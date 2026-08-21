import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.PROVIDER_CREDENTIALS_KEY_V1 = Buffer.alloc(32, 7).toString('base64');
const { decryptProviderSecret, encryptProviderSecret, sanitizeProviderPayload } = await import('../server/providerCrypto.js');
const { appAuthRequired } = await import('../server/appAuth.js');

const packed = encryptProviderSecret({ username: 'fixture-user', password: 'fixture-password' });
assert.equal(packed.version, 1);
assert.doesNotMatch(packed.cipher, /fixture-(user|password)/);
assert.deepEqual(decryptProviderSecret(packed.cipher, packed.version), { username: 'fixture-user', password: 'fixture-password' });

assert.deepEqual(sanitizeProviderPayload({
  ok: true,
  password: 'hidden',
  nested: { token: 'hidden', value: 12 },
  headers: { cookie: 'hidden', accept: 'json' }
}), { ok: true, password: '[eliminado]', nested: { token: '[eliminado]', value: 12 }, headers: { cookie: '[eliminado]', accept: 'json' } });

process.env.APP_AUTH_REQUIRED = 'false';
assert.equal(appAuthRequired(), false);
process.env.APP_AUTH_REQUIRED = 'true';
assert.equal(appAuthRequired(), true);

const root = path.resolve(import.meta.dirname, '..');
const sourceFiles = [
  'src/App.tsx', 'src/services/api.ts', 'api/index.js', 'server/providerStore.js',
  'server/providers/watchPowerProvider.js', '.env.example'
];
const source = sourceFiles.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
assert.doesNotMatch(source, /NEXT_PUBLIC_(WATCHPOWER|MISOLAR_SUPERADMIN|PROVIDER_CREDENTIALS|MISOLAR_AUTH)/);
assert.doesNotMatch(source, /sites\/\$\{[^}]+\}\/providers\/watchpower\/(write|command|settings)/i);
assert.match(source, /WATCHPOWER_WRITES_ENABLED=false/);
assert.match(source, /WatchPower: solo lectura/);

console.log('security contract tests: ok');
