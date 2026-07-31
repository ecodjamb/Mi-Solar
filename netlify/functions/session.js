// Mi Solar V6 — archivo actualizado para reemplazo completo del repositorio.
import crypto from 'node:crypto';

const COOKIE_NAME = 'isolar_session';
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

function key() {
  const configured = process.env.SESSION_SECRET || 'isolar-v2-change-this-secret-in-netlify';
  return crypto.createHash('sha256').update(configured).digest();
}

export function sealSession(session) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const plaintext = Buffer.from(JSON.stringify(session), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function openSession(cookieHeader = '') {
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      return index === -1 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)];
    })
  );
  const packed = cookies[COOKIE_NAME];
  if (!packed) return null;
  try {
    const data = Buffer.from(packed, 'base64url');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const session = JSON.parse(plaintext.toString('utf8'));
    if (session.expiresAt && Date.now() > session.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookie(session) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.NETLIFY);
  return `${COOKIE_NAME}=${sealSession(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure ? '; Secure' : ''}`;
}

export function clearCookie() {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.NETLIFY);
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
