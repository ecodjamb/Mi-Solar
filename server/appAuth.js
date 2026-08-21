import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { privatePasswordChange, privateRpc } from './privateRpc.js';

const SESSION_COOKIE = 'misolar_app_session';
const CSRF_COOKIE = 'misolar_csrf';
const SESSION_DAYS = 365;

const hash = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const identityDb = (operation, payload = {}) => privateRpc('identity', operation, payload);

function cookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || '').split(';').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const index = entry.indexOf('=');
    return [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))];
  }));
}

export function appAuthRequired() {
  return String(process.env.APP_AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
}

export async function ensureSuperadmin() {
  const username = String(process.env.MISOLAR_SUPERADMIN_USERNAME || '').trim();
  const password = String(process.env.MISOLAR_SUPERADMIN_PASSWORD || '');
  if (!username || !password) return { configured: false };
  const existing = await identityDb('user_by_username', { username });
  if (existing) return { configured: true, created: false };
  const role = await identityDb('role_by_key', { key: 'superadmin' });
  if (!role?.id) throw new Error('El rol superadministrador aún no existe.');
  const passwordHash = await bcrypt.hash(password, 12);
  const created = await identityDb('create_user', { username, display_name: 'Superadministrador', password_hash: passwordHash, role_id: role.id, must_change_password: true });
  return { configured: true, created: true, userId: created?.id || null };
}

async function permissionsFor(user) {
  return await identityDb('permissions', { user_id: user.id, role_id: user.role_id });
}

async function userByUsername(username) {
  return await identityDb('user_by_username', { username });
}

async function userById(id) {
  return await identityDb('user_by_id', { user_id: id });
}

function cookieHeaders(refreshToken, csrfToken, maxAge = SESSION_DAYS * 86400) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return [
    `${SESSION_COOKIE}=${refreshToken}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}`,
    `${CSRF_COOKIE}=${csrfToken}; Path=/${secure}; SameSite=Strict; Max-Age=${maxAge}`
  ];
}

export async function loginApp(username, password, req) {
  await ensureSuperadmin();
  const user = await userByUsername(String(username || '').trim());
  const valid = user?.active && await bcrypt.compare(String(password || ''), user.password_hash || '');
  if (!valid) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const error = new Error('Usuario o contraseña incorrectos.');
    error.status = 401;
    throw error;
  }
  const refreshToken = token();
  const csrfToken = token();
  const deviceId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  const userAgentHash = hash(req.headers?.['user-agent'] || 'unknown');
  const ipHash = hash(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
  await identityDb('session_create', { device_id: deviceId, user_id: user.id, user_agent_hash: userAgentHash, ip_hash: ipHash, refresh_token_hash: hash(refreshToken), csrf_token_hash: hash(csrfToken), expires_at: expiresAt });
  const access = await permissionsFor(user);
  return { user: { id: user.id, username: user.username, displayName: user.display_name, mustChangePassword: user.must_change_password }, access, expiresAt, cookies: cookieHeaders(refreshToken, csrfToken) };
}

export async function openAppSession(req, { touch = true } = {}) {
  const refreshToken = cookies(req)[SESSION_COOKIE];
  if (!refreshToken) return null;
  const opened = await identityDb('session_open', { refresh_token_hash: hash(refreshToken) });
  const session = opened?.session;
  const user = opened?.user;
  if (!user?.active) return null;
  if (touch) {
    await identityDb('session_touch', { session_id: session.id, device_id: session.device_id || '' });
  }
  return { session, user, access: await permissionsFor(user) };
}

export function requireCsrf(req, appSession) {
  if (['GET','HEAD','OPTIONS'].includes(String(req.method || 'GET').toUpperCase())) return;
  const csrf = String(req.headers?.['x-csrf-token'] || '');
  const cookieCsrf = cookies(req)[CSRF_COOKIE] || '';
  if (!csrf || csrf !== cookieCsrf || hash(csrf) !== appSession?.session?.csrf_token_hash) {
    const error = new Error('La protección CSRF rechazó la solicitud.');
    error.status = 403;
    throw error;
  }
}

export async function requireAppPermission(req, permission) {
  const appSession = await openAppSession(req);
  if (!appSession) {
    const error = new Error('Inicia sesión en MiSolar para realizar esta acción.');
    error.status = 401;
    throw error;
  }
  requireCsrf(req, appSession);
  const allowed = appSession.access.role === 'superadmin' || appSession.access.permissions.includes(permission) || appSession.access.actions[permission] === true;
  if (!allowed) {
    const error = new Error('No tienes permiso para realizar esta acción.');
    error.status = 403;
    throw error;
  }
  return appSession;
}

export async function requireAppViewIfEnabled(req, permission = 'solar.view') {
  if (!appAuthRequired()) return null;
  return await requireAppPermission(req, permission);
}

export async function changeAppPassword(req, currentPassword, nextPassword) {
  const appSession = await openAppSession(req);
  if (!appSession) {
    const error = new Error('Inicia sesión en MiSolar para cambiar la contraseña.');
    error.status = 401;
    throw error;
  }
  requireCsrf(req, appSession);
  const user = await userByUsername(appSession.user.username);
  if (!await bcrypt.compare(String(currentPassword || ''), user?.password_hash || '')) {
    const error = new Error('La contraseña actual no coincide.');
    error.status = 401;
    throw error;
  }
  if (String(nextPassword || '').length < 12 || String(nextPassword) === String(currentPassword || '')) {
    const error = new Error('La nueva contraseña debe tener al menos 12 caracteres y ser diferente.');
    error.status = 400;
    throw error;
  }
  const passwordHash = await bcrypt.hash(String(nextPassword), 12);
  await privatePasswordChange({ user_id: appSession.user.id, password_hash: passwordHash });
  await identityDb('audit', { actor_user_id: appSession.user.id, action: 'user.password_changed', entity_type: 'app_user', entity_id: appSession.user.id, before_values: null, after_values: { sessionsRevoked: true } });
  return { ok: true, cookies: cookieHeaders('', '', 0) };
}

export async function logoutApp(req) {
  const refreshToken = cookies(req)[SESSION_COOKIE];
  if (refreshToken) await identityDb('session_logout', { refresh_token_hash: hash(refreshToken) });
  return cookieHeaders('', '', 0);
}

export async function appSessionStatus(req) {
  const current = await openAppSession(req, { touch: false });
  return current ? {
    authenticated: true,
    authRequired: appAuthRequired(),
    user: { id: current.user.id, username: current.user.username, displayName: current.user.display_name, mustChangePassword: current.user.must_change_password },
    access: current.access,
    expiresAt: current.session.expires_at
  } : { authenticated: false, authRequired: appAuthRequired(), user: null, access: { role: 'guest', permissions: [], menus: {}, actions: {} } };
}
