import crypto from 'node:crypto';

const VERSION = 1;

function masterKey(version = VERSION) {
  const configured = process.env[`PROVIDER_CREDENTIALS_KEY_V${version}`];
  if (!configured) throw new Error(`Falta la llave de cifrado de proveedores v${version}.`);
  return crypto.createHash('sha256').update(configured).digest();
}

export function encryptProviderSecret(value, version = VERSION) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(version), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    cipher: [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.'),
    version
  };
}

export function decryptProviderSecret(packed, version = VERSION) {
  const [ivRaw, tagRaw, encryptedRaw] = String(packed || '').split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('El secreto cifrado del proveedor no es válido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(version), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

export function maskIdentifier(value, visibleStart = 2, visibleEnd = 2) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length <= visibleStart + visibleEnd) return '•'.repeat(Math.max(4, text.length));
  return `${text.slice(0, visibleStart)}${'•'.repeat(Math.min(8, text.length - visibleStart - visibleEnd))}${text.slice(-visibleEnd)}`;
}

export function sanitizeProviderPayload(value) {
  const blocked = /pass(word)?|pwd|token|secret|cookie|sign(ature)?|authorization|vrt/i;
  const walk = (input, depth = 0) => {
    if (depth > 12) return '[profundidad limitada]';
    if (Array.isArray(input)) return input.map((item) => walk(item, depth + 1));
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, blocked.test(key) ? '[eliminado]' : walk(item, depth + 1)]));
  };
  return walk(value);
}

export function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
