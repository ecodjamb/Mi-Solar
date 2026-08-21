import bcrypt from 'bcryptjs';
import { privateRpc } from './privateRpc.js';
import { validMiSolarPassword } from './passwordPolicy.js';

const identityDb = (operation, payload = {}) => privateRpc('identity', operation, payload);

export async function listUsers() {
  const { users = [], sites = [], site_permissions: sitePermissions = [], menu_permissions: menuPermissions = [], action_permissions: actionPermissions = [], devices = [] } = await identityDb('list_users') || {};
  return (users || []).map((user) => ({
    id: user.id, username: user.username, displayName: user.display_name, email: user.email, phone: user.phone, active: user.active,
    mustChangePassword: user.must_change_password, createdAt: user.created_at, lastLoginAt: user.last_login_at,
    role: user.roles?.key || 'member', roleName: user.roles?.name || 'Miembro',
    sites: (sitePermissions || []).filter((row) => row.user_id === user.id).map((row) => ({ ...row, name: (sites || []).find((site) => site.id === row.site_id)?.name || String(row.site_id) })),
    menus: Object.fromEntries((menuPermissions || []).filter((row) => row.user_id === user.id).map((row) => [row.menu_key, row.allowed])),
    actions: Object.fromEntries((actionPermissions || []).filter((row) => row.user_id === user.id).map((row) => [row.action_key, row.allowed])),
    devices: (devices || []).filter((row) => row.user_id === user.id).map((row) => ({ id: row.id, label: row.label, lastSeenAt: row.last_seen_at, createdAt: row.created_at }))
  }));
}

export async function createUser(input, actorUserId) {
  const username = String(input.username || '').trim();
  const displayName = String(input.displayName || '').trim();
  const password = String(input.password || '');
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username) || displayName.length < 2 || !validMiSolarPassword(password)) {
    const error = new Error('Usuario, nombre o contraseña no cumplen los requisitos. La contraseña debe tener exactamente 8 caracteres.');error.status = 400;throw error;
  }
  const role = await identityDb('role_by_key', { key: input.role || 'member' });
  if (!role) { const error = new Error('Rol no válido.');error.status = 400;throw error; }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await identityDb('create_user', { username, display_name: displayName, email: input.email || '', phone: input.phone || '', password_hash: passwordHash, role_id: role.id, active: true, must_change_password: true });
  if (!user) throw new Error('No fue posible crear el usuario.');
  await applyUserAccess(user.id, input);
  await audit(actorUserId, 'user.created', user.id, null, { username, displayName, role: role.key });
  return { id: user.id, username, displayName };
}

async function applyUserAccess(userId, input) {
  const payload = { user_id: userId };
  if (Array.isArray(input.siteIds)) { payload.site_ids = input.siteIds.map(Number);payload.can_control_isolar = Boolean(input.canControlISolar); }
  if (input.menus && typeof input.menus === 'object') payload.menus = Object.fromEntries(Object.entries(input.menus).map(([key,value]) => [key,Boolean(value)]));
  if (input.actions && typeof input.actions === 'object') payload.actions = Object.fromEntries(Object.entries(input.actions).map(([key,value]) => [key,Boolean(value)]));
  if (Object.keys(payload).length > 1) await identityDb('access_set', payload);
}

export async function updateUser(userId, input, actorUserId) {
  const before = await identityDb('user_snapshot', { user_id: userId });
  if (!before) { const error = new Error('Usuario no encontrado.');error.status = 404;throw error; }
  const patch = {};
  if (input.displayName != null) patch.display_name = String(input.displayName).trim();
  if (input.email !== undefined) patch.email = input.email || null;
  if (input.phone !== undefined) patch.phone = input.phone || null;
  if (typeof input.active === 'boolean') patch.active = input.active;
  if (input.role) { const role = await identityDb('role_by_key', { key: input.role });if (!role) { const error = new Error('Rol no válido.');error.status = 400;throw error; }patch.role_id = role.id; }
  if (Object.keys(patch).length) await identityDb('user_update', { user_id: userId, ...patch });
  await applyUserAccess(userId, input);
  if (input.active === false) await revokeUserSessions(userId, actorUserId, false);
  await audit(actorUserId, 'user.updated', userId, before, patch);
  return { ok: true };
}

export async function resetUserPassword(userId, password, actorUserId) {
  if (!validMiSolarPassword(password)) { const error = new Error('La nueva contraseña debe tener exactamente 8 caracteres.');error.status = 400;throw error; }
  const passwordHash = await bcrypt.hash(String(password), 12);
  await identityDb('password_reset', { user_id: userId, password_hash: passwordHash });
  await audit(actorUserId, 'user.password_reset', userId, null, { sessionsRevoked: true });
  return { ok: true };
}

export async function revokeUserSessions(userId, actorUserId, writeAudit = true) {
  const now = new Date().toISOString();
  await identityDb('sessions_revoke', { user_id: userId });
  if (writeAudit) await audit(actorUserId, 'user.sessions_revoked', userId, null, { revokedAt: now });
  return { ok: true };
}

async function audit(actorUserId, action, entityId, beforeValues, afterValues) {
  await identityDb('audit', { actor_user_id: actorUserId || '', action, entity_type: 'app_user', entity_id: String(entityId), before_values: beforeValues, after_values: afterValues });
}
