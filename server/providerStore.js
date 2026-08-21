import crypto from 'node:crypto';
import { privateRpc } from './privateRpc.js';
import { decryptProviderSecret, encryptProviderSecret, maskIdentifier, sanitizeProviderPayload, sha256Json } from './providerCrypto.js';
import { normalizeISolar, normalizeWatchPower, NORMALIZER_VERSION } from './canonicalTelemetry.js';
import { WatchPowerProvider } from './providers/watchPowerProvider.js';
import { ISolarProvider } from './providers/isolarProvider.js';
import { ProviderError } from './providers/ProviderAdapter.js';
import { readEnergySamples, readLatestEnergySample } from './archive.js';

const adapters = { isolar: new ISolarProvider(), watchpower: new WatchPowerProvider() };
const PROVIDERS = new Set(Object.keys(adapters));

async function providerDb(operation, payload = {}) {
  return await privateRpc('provider', operation, payload);
}

function assertProvider(provider) {
  if (!PROVIDERS.has(provider)) {
    const error = new Error('Proveedor no válido.');
    error.status = 400;
    throw error;
  }
}

async function siteById(siteId) {
  const site = await providerDb('site', { site_id: siteId });
  if (!site) {
    const error = new Error('Instalación no encontrada.');
    error.status = 404;
    throw error;
  }
  return site;
}

async function accountFor(siteId, provider) {
  assertProvider(provider);
  return await providerDb('account', { site_id: siteId, provider });
}

function publicAccount(account, devices = []) {
  if (!account) return null;
  const environmentUsername = account.provider === 'watchpower' ? process.env.WATCHPOWER_USERNAME : null;
  return {
    id: account.id,
    siteId: account.site_id,
    provider: account.provider,
    enabled: account.enabled,
    status: account.status,
    usernameMasked: account.username_masked || (environmentUsername ? maskIdentifier(environmentUsername) : null),
    passwordConfigured: Boolean(account.credentials_cipher || (account.provider === 'watchpower' && process.env.WATCHPOWER_USERNAME && process.env.WATCHPOWER_PASSWORD)),
    consecutiveFailures: account.consecutive_failures,
    blockedUntil: account.blocked_until,
    lastSuccessAt: account.last_success_at,
    lastAttemptAt: account.last_attempt_at,
    lastErrorCode: account.last_error_code,
    devices: devices.map((device) => ({ id: device.id, alias: device.alias, model: device.model, serialMasked: device.serial_masked, loggerSerialMasked: device.logger_serial_masked, lastReadingAt: device.last_reading_at, active: device.active }))
  };
}

export async function listProviderAccounts() {
  const { sites = [], accounts = [], devices = [] } = await providerDb('accounts') || {};
  return (sites || []).map((site) => ({
    id: site.id,
    name: site.name,
    providers: ['isolar','watchpower'].map((provider) => {
      const account = (accounts || []).find((row) => row.site_id === site.id && row.provider === provider);
      return account ? publicAccount(account, (devices || []).filter((device) => device.provider_account_id === account.id)) : { provider, enabled: false, status: 'not_configured', passwordConfigured: false, devices: [] };
    })
  }));
}

export async function publicProviderCatalog() {
  const sites = await providerDb('catalog') || [];
  return sites.map((site) => ({
    id: site.id,
    name: site.name,
    siteKey: `site:${site.id}`,
    deviceSuffix: String(site.device_sn || '').slice(-4),
    providers: ['isolar','watchpower'].map((provider) => {
      const account = (site.providers || []).find((row) => row.provider === provider);
      return { provider, enabled: Boolean(account?.enabled), status: account?.status || 'not_configured', lastSuccessAt: account?.last_success_at || null, lastAttemptAt: account?.last_attempt_at || null, readOnly: provider === 'watchpower' };
    })
  }));
}

export async function saveProviderCredentials({ siteId, provider, username, password, actorUserId = null }) {
  assertProvider(provider);
  const site = await siteById(siteId);
  const encrypted = encryptProviderSecret({ username: String(username || '').trim(), password: String(password || '') });
  if (!String(username || '').trim() || !String(password || '')) {
    const error = new Error('Usuario y contraseña son obligatorios.');
    error.status = 400;
    throw error;
  }
  const existing = await accountFor(site.id, provider);
  const row = {
    site_id: site.id,
    provider,
    enabled: true,
    username_masked: maskIdentifier(username),
    credentials_cipher: encrypted.cipher,
    encryption_version: encrypted.version,
    status: 'disconnected',
    consecutive_failures: 0,
    blocked_until: null,
    last_error_code: null,
    last_error_sanitized: null,
    updated_at: new Date().toISOString()
  };
  const result = await providerDb('save_account', row);
  await providerDb('audit', { site_id: site.id, account_id: result?.id || existing?.id, actor_user_id: actorUserId || '', action: existing ? 'credentials_replaced' : 'credentials_created', success: true, metadata: { provider } });
  return publicAccount(result || { ...existing, ...row });
}

export async function disconnectProvider({ siteId, provider, actorUserId = null }) {
  const account = await accountFor(siteId, provider);
  if (!account) return { ok: true };
  await providerDb('disconnect', { account_id: account.id });
  await providerDb('audit', { site_id: Number(siteId), account_id: account.id, actor_user_id: actorUserId || '', action: 'credentials_removed', success: true, metadata: { provider } });
  return { ok: true };
}

function environmentCredentials(site, provider) {
  const siteName = String(site.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (provider !== 'watchpower' || !/arrayan/i.test(siteName)) return null;
  if (!process.env.WATCHPOWER_USERNAME || !process.env.WATCHPOWER_PASSWORD) return null;
  return { username: process.env.WATCHPOWER_USERNAME, password: process.env.WATCHPOWER_PASSWORD };
}

async function credentialsFor(account, site) {
  if (account?.credentials_cipher) return decryptProviderSecret(account.credentials_cipher, account.encryption_version);
  return environmentCredentials(site, account?.provider);
}

async function reusableSession(account) {
  const row = await providerDb('session_get', { account_id: account.id });
  return row ? { row, value: decryptProviderSecret(row.session_cipher, row.encryption_version) } : null;
}

function statusFrom(error) {
  if (error?.code === 'INVALID_CREDENTIALS') return 'invalid_credentials';
  if (error?.code === 'SESSION_EXPIRED') return 'expired_session';
  if (error?.code === 'ACCOUNT_BLOCKED' || error?.code === 'RATE_LIMIT') return 'temporarily_blocked';
  return 'unavailable';
}

async function markFailure(account, error) {
  const failures = Math.min(100, Number(account.consecutive_failures || 0) + 1);
  const blockMinutes = failures >= 3 ? Math.min(360, 15 * (2 ** Math.min(4, failures - 3))) : 0;
  const blockedUntil = blockMinutes ? new Date(Date.now() + blockMinutes * 60_000).toISOString() : null;
  await providerDb('account_failure', {
    account_id: account.id,
    status: failures >= 3 ? 'temporarily_blocked' : statusFrom(error),
    failures,
    blocked_until: blockedUntil,
    error_code: String(error?.code || 'PROVIDER_ERROR').slice(0, 80),
    error_message: String(error?.message || 'Error de proveedor').slice(0, 240)
  });
}

async function sessionFor(site, account) {
  if (!account?.enabled) throw new ProviderError('El proveedor está desactivado.', { code: 'PROVIDER_DISABLED', status: 409 });
  if (account.blocked_until && new Date(account.blocked_until).getTime() > Date.now()) throw new ProviderError('El proveedor está en pausa preventiva después de varios errores.', { code: 'CIRCUIT_OPEN', status: 423 });
  const existing = await reusableSession(account);
  if (existing) return existing.value;
  const credentials = await credentialsFor(account, site);
  if (!credentials) throw new ProviderError('El proveedor no tiene credenciales configuradas.', { code: 'CREDENTIALS_MISSING', status: 409 });
  try {
    const session = await adapters[account.provider].authenticate(credentials);
    const packed = encryptProviderSecret(session);
    const expiresAt = new Date(Date.now() + Math.max(300, Number(session.expiresInSeconds || 600)) * 1000).toISOString();
    await providerDb('session_replace', { account_id: account.id, session_cipher: packed.cipher, encryption_version: packed.version, expires_at: expiresAt });
    return session;
  } catch (error) {
    await markFailure(account, error);
    throw error;
  }
}

async function recordRaw(siteId, providerDeviceId, provider, payloadType, payload, canonical) {
  const sanitized = sanitizeProviderPayload(payload);
  const payloadHash = sha256Json(sanitized);
  const created = await providerDb('raw_upsert', {
    site_id: siteId,
    provider_device_id: providerDeviceId || '',
    provider,
    payload_type: payloadType,
    provider_timestamp: canonical?.time?.provider_timestamp || '',
    sampled_at: canonical?.time?.sampled_at_utc || '',
    sanitized_payload: sanitized,
    payload_sha256: payloadHash,
    normalizer_version: NORMALIZER_VERSION
  });
  return created?.id || null;
}

async function persistTelemetry({ site, account, providerDevice, payload }) {
  const canonical = account.provider === 'watchpower' ? normalizeWatchPower({ ...payload, device: providerDevice }) : normalizeISolar(payload);
  const rawPayloadId = await recordRaw(site.id, providerDevice?.id || null, account.provider, 'realtime', payload, canonical);
  const idempotencyKey = crypto.createHash('sha256').update(`${account.provider}:${providerDevice?.provider_device_id || 'unknown'}:${canonical.time.sampled_at_utc}:realtime`).digest('hex');
  const result = await providerDb('telemetry_upsert', {
    site_id: site.id,
    inverter_id: providerDevice?.inverter_id || '',
    provider_device_id: providerDevice?.id || '',
    provider: account.provider,
    sample_type: 'realtime',
    provider_timestamp: canonical.time.provider_timestamp || '',
    provider_timezone: canonical.time.provider_timezone || '',
    sampled_at: canonical.time.sampled_at_utc,
    sampled_at_local: canonical.time.sampled_at_local || '',
    data_age_seconds: canonical.time.data_age_seconds,
    canonical,
    quality: canonical.quality,
    raw_payload_id: rawPayloadId || '',
    normalizer_version: NORMALIZER_VERSION,
    idempotency_key: idempotencyKey
  });
  return { canonical, inserted: Boolean(result?.inserted) };
}

async function saveDiscoveredDevice(account, device) {
  const providerDeviceId = `${device.pn || ''}:${device.devcode ?? ''}:${device.devaddr ?? ''}:${device.sn || ''}`;
  const deviceCipher = encryptProviderSecret({ pn: device.pn, devcode: device.devcode, devaddr: device.devaddr, sn: device.sn });
  return await providerDb('device_upsert', {
    account_id: account.id,
    provider_device_id: providerDeviceId,
    device_identifier_cipher: deviceCipher.cipher,
    serial_masked: maskIdentifier(device.sn),
    logger_identifier_cipher: device.pn ? encryptProviderSecret({ pn: device.pn }).cipher : '',
    logger_serial_masked: maskIdentifier(device.pn) || '',
    alias: device.devalias || device.alias || '',
    protocol_code: Number.isFinite(Number(device.devcode)) ? Number(device.devcode) : null,
    device_address: Number.isFinite(Number(device.devaddr)) ? Number(device.devaddr) : null
  });
}

async function saveISolarDevice(account, device) {
  const serial = String(device.deviceSn || device.sn || '').trim();
  if (!serial) throw new ProviderError('i.Solar devolvió un equipo sin identificador.', { code: 'DEVICE_ID_INCOMPLETE', status: 502 });
  const packed = encryptProviderSecret({ deviceSn: serial });
  return await providerDb('device_upsert', {
    account_id: account.id,
    provider_device_id: serial,
    device_identifier_cipher: packed.cipher,
    serial_masked: maskIdentifier(serial),
    logger_identifier_cipher: '',
    logger_serial_masked: '',
    alias: device.nickName || device.deviceName || '',
    protocol_code: null,
    device_address: null
  });
}

export async function testProviderConnection({ siteId, provider }) {
  const site = await siteById(siteId);
  const account = await accountFor(siteId, provider);
  if (!account) throw new ProviderError('El proveedor aún no está configurado.', { code: 'NOT_CONFIGURED', status: 409 });
  const session = await sessionFor(site, account);
  const health = await adapters[provider].healthCheck(session);
  return { ...health, provider, readOnly: adapters[provider].readOnly };
}

export async function syncProviderNow({ siteId, provider }) {
  const site = await siteById(siteId);
  const account = await accountFor(siteId, provider);
  if (!account) throw new ProviderError('El proveedor aún no está configurado.', { code: 'NOT_CONFIGURED', status: 409 });
  const run = await providerDb('sync_start', { site_id: site.id, provider, sync_type: 'manual' });
  const runId = run?.id;
  const started = Date.now();
  try {
    const session = await sessionFor(site, account);
    const listed = await adapters[provider].listDevices(session);
    const inputDevices = provider === 'isolar'
      ? (listed.devices || []).filter((device) => String(device.deviceSn || device.sn || '') === String(site.device_sn || ''))
      : (listed.devices || []);
    const results = [];
    for (const input of inputDevices) {
      const saved = provider === 'watchpower' ? await saveDiscoveredDevice(account, input) : await saveISolarDevice(account, input);
      const payload = await adapters[provider].getRealtimeData(session, input);
      const persisted = await persistTelemetry({ site, account, providerDevice: saved, payload });
      const canonical = persisted.canonical;
      if (saved) await providerDb('device_update', { device_id: saved.id, model: canonical.device.model || '', firmware_main: canonical.device.firmware_main || '', firmware_secondary: canonical.device.firmware_secondary || '', last_reading_at: canonical.time.sampled_at_utc });
      results.push({ device: { alias: saved?.alias || input.nickName || null, serialMasked: saved?.serial_masked || maskIdentifier(input.deviceSn) }, canonical, inserted: persisted.inserted });
    }
    if (runId) await providerDb('sync_finish', { run_id: runId, status: 'success', samples_received: results.length, samples_inserted: results.filter((item) => item.inserted).length, duplicates: results.filter((item) => !item.inserted).length, duration_ms: Date.now() - started, error_code: '', error_message: '' });
    return { provider, site: { id: site.id, name: site.name }, devices: results, readOnly: adapters[provider].readOnly, syncedAt: new Date().toISOString() };
  } catch (error) {
    if (runId) await providerDb('sync_finish', { run_id: runId, status: 'failed', samples_received: 0, samples_inserted: 0, duplicates: 0, error_code: String(error?.code || 'SYNC_ERROR').slice(0, 80), error_message: String(error?.message || 'Error de sincronización').slice(0, 240), duration_ms: Date.now() - started });
    throw error;
  }
}

export async function latestCanonical(siteId, provider) {
  assertProvider(provider);
  const current = await providerDb('latest', { site_id: siteId, provider });
  if (current || provider !== 'isolar') return current;
  const archived = await readLatestEnergySample(siteId);
  return archived ? archivedSample(archived) : null;
}

export async function providerHistory(siteId, provider, from, to, limit = 10_000) {
  assertProvider(provider);
  const boundedLimit = Math.min(20_000, Math.max(1, Number(limit) || 10_000));
  const current = await providerDb('history', { site_id: siteId, provider, from, to, limit: boundedLimit }) || [];
  if (current.length || provider !== 'isolar') return current;
  return (await readEnergySamples(siteId, from, to, boundedLimit)).map(archivedSample);
}

function archivedSample(row) {
  const gridActive = row.grid_active === true;
  const raw = {
    currentTime: row.sample_at,
    pvInputPower1: Number(row.pv1_w || 0),
    pvInputPower2: Number(row.pv2_w || 0),
    acOutputActivePowerTotal: Number(row.load_w || 0),
    gridPowerInputActiveTotal: gridActive ? Number(row.grid_w || 0) : 0,
    statusGrid: gridActive ? 1 : 0,
    batteryChargingPower: Number(row.battery_charge_w || 0),
    batteryDischargingPower: Number(row.battery_discharge_w || 0),
    batteryCapacity: row.battery_soc == null ? null : Number(row.battery_soc)
  };
  return {
    id: `archive:${row.id}`,
    site_id: row.site_id,
    provider: 'isolar',
    sampled_at: row.sample_at,
    received_at: row.ingested_at || row.sample_at,
    canonical: normalizeISolar(raw),
    source: row.source || 'misolar-archive',
    archived: true
  };
}
