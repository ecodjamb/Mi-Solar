import { providerBackgroundIntervalSeconds, providerClaimSeconds } from './pollPolicy.js';
import crypto from 'node:crypto';
import { privateProviderQueryControl, privateProviderQueryControlStatus, privateProviderSyncLease, privateProviderSyncRelease, privateRpc } from './privateRpc.js';
import { decryptProviderSecret, encryptProviderSecret, maskIdentifier, sanitizeProviderPayload, sha256Json } from './providerCrypto.js';
import { canonicalToLegacy, evaluateEnergyBalance, normalizeISolar, normalizeWatchPower, NORMALIZER_VERSION } from './canonicalTelemetry.js';
import { WatchPowerProvider } from './providers/watchPowerProvider.js';
import { ISolarProvider } from './providers/isolarProvider.js';
import { ProviderError } from './providers/ProviderAdapter.js';
import { archiveRows, ensureSite, findSiteId, readEnergySamples, readLatestEnergySample, resolveDeviceReference } from './archive.js';

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

const HISTORY_BUCKET_MINUTES = 5;
const HISTORY_LOOKBACK_DAYS = 3;
const HISTORY_REPAIR_CHUNK_HOURS = 6;
const HISTORY_REPAIR_MAX_WINDOWS = 8;
const HISTORY_REPAIR_DEADLINE_MS = 46_000;
const HISTORY_LEASE_MINIMUM_MS = 30_000;

function rowSampleTime(row) {
  const value = row?.sample_at ?? row?.currentTime ?? row?.createTime ?? row?.collectTime ?? row?.dataTime ?? row?.time;
  if (value == null) return null;
  const raw = String(value).trim().replace(/\//g, '-').replace(' ', 'T');
  const parsed = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function compactGapRanges(missingBuckets, bucketMs) {
  const ranges = [];
  for (const value of missingBuckets) {
    const previous = ranges[ranges.length - 1];
    if (previous && previous.endMs === value) previous.endMs = value + bucketMs;
    else ranges.push({ startMs: value, endMs: value + bucketMs });
  }
  return ranges.map((range) => ({
    from: new Date(range.startMs).toISOString(),
    to: new Date(range.endMs).toISOString(),
    minutes: Math.round((range.endMs - range.startMs) / 60_000)
  }));
}

/**
 * i.Solar devuelve cerca de un día aunque se le solicite un rango de varios
 * días y declara la respuesta como completa. Construimos ventanas pequeñas,
 * solo para sectores que contienen huecos, y priorizamos las más recientes.
 * Así una única reparación regulada completa primero el día que ve el usuario
 * sin abrir una consulta por cada muestra ausente.
 */
export function buildHistoryRepairWindows(missingBuckets = [], {
  bucketMinutes = HISTORY_BUCKET_MINUTES,
  chunkHours = HISTORY_REPAIR_CHUNK_HOURS,
  maxWindows = HISTORY_REPAIR_MAX_WINDOWS
} = {}) {
  const values = [...new Set((missingBuckets || []).map(Number).filter(Number.isFinite))].sort((left, right) => left - right);
  if (!values.length) return [];
  const bucketMs = Math.max(1, Number(bucketMinutes) || HISTORY_BUCKET_MINUTES) * 60_000;
  const windowMs = Math.max(bucketMs, Number(chunkHours) * 3_600_000 || HISTORY_REPAIR_CHUNK_HOURS * 3_600_000);
  const first = Math.floor(values[0] / windowMs) * windowMs;
  const lastExclusive = values[values.length - 1] + bucketMs;
  const windows = [];
  let missingIndex = 0;
  for (let startMs = first; startMs < lastExclusive; startMs += windowMs) {
    const endMs = Math.min(startMs + windowMs, lastExclusive);
    while (missingIndex < values.length && values[missingIndex] < startMs) missingIndex += 1;
    if (missingIndex < values.length && values[missingIndex] < endMs) windows.push({ startMs, endMs });
  }
  return windows.reverse().slice(0, Math.max(1, Number(maxWindows) || HISTORY_REPAIR_MAX_WINDOWS));
}

export function historyLeaseRetryDelayMs(account, nowMs = Date.now()) {
  const lastAttemptMs = Date.parse(String(account?.last_attempt_at || ''));
  // Un segundo de margen evita competir en el mismo milisegundo en que se
  // cumple la separación mínima exigida entre solicitudes a i.Solar.
  if (Number.isFinite(lastAttemptMs)) return Math.min(31_000, Math.max(1_000, lastAttemptMs + HISTORY_LEASE_MINIMUM_MS + 1_000 - nowMs));
  return 5_000;
}

export function analyzeHistoryGaps(rows = [], { from, to, bucketMinutes = HISTORY_BUCKET_MINUTES } = {}) {
  const bucketMs = Math.max(1, Number(bucketMinutes) || HISTORY_BUCKET_MINUTES) * 60_000;
  const fromMs = Math.ceil(new Date(from).getTime() / bucketMs) * bucketMs;
  const toMs = Math.floor(new Date(to).getTime() / bucketMs) * bucketMs;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) throw new Error('Rango de auditoría histórica inválido.');
  const present = new Set();
  for (const row of rows || []) {
    const sampledAt = rowSampleTime(row);
    if (sampledAt == null || sampledAt < fromMs || sampledAt >= toMs) continue;
    present.add(Math.floor(sampledAt / bucketMs) * bucketMs);
  }
  const missingBuckets = [];
  for (let cursor = fromMs; cursor < toMs; cursor += bucketMs) if (!present.has(cursor)) missingBuckets.push(cursor);
  const expectedBuckets = Math.max(0, Math.round((toMs - fromMs) / bucketMs));
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    bucketMinutes: bucketMs / 60_000,
    expectedBuckets,
    presentBuckets: present.size,
    missingBuckets,
    missingCount: missingBuckets.length,
    coveragePercent: expectedBuckets ? Number((((expectedBuckets - missingBuckets.length) / expectedBuckets) * 100).toFixed(1)) : 100,
    gaps: compactGapRanges(missingBuckets, bucketMs)
  };
}

function santiagoDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function santiagoMidnightUtc(value = new Date()) {
  const dateKey = santiagoDateKey(value);
  const [year, month, day] = dateKey.split('-').map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const partsAt = (date) => Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const represented = partsAt(new Date(wallClockUtc));
  const representedUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute, represented.second);
  const first = new Date(wallClockUtc - (representedUtc - wallClockUtc));
  const checked = partsAt(first);
  const checkedUtc = Date.UTC(checked.year, checked.month - 1, checked.day, checked.hour, checked.minute, checked.second);
  return new Date(first.getTime() - (checkedUtc - wallClockUtc));
}

function addDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

export function santiagoDateBoundsUtc(dateKey = santiagoDateKey()) {
  const safeDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey)) ? String(dateKey) : santiagoDateKey();
  return {
    date: safeDateKey,
    start: santiagoMidnightUtc(`${safeDateKey}T12:00:00.000Z`),
    end: santiagoMidnightUtc(`${addDateKey(safeDateKey, 1)}T12:00:00.000Z`)
  };
}

export function formatISolarTimestamp(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function isolarProviderRangeForSantiagoDate(dateKey, requestedEnd = null) {
  const bounds = santiagoDateBoundsUtc(dateKey);
  const effectiveEnd = requestedEnd instanceof Date
    ? new Date(Math.min(requestedEnd.getTime(), bounds.end.getTime()))
    : bounds.end;
  return {
    bounds,
    requestedEnd: effectiveEnd,
    providerRange: {
      start: formatISolarTimestamp(bounds.start),
      end: formatISolarTimestamp(new Date(effectiveEnd.getTime() - 1000))
    }
  };
}

function summarizeEnergySamples(rows = []) {
  const sorted = [...rows]
    .map((row) => ({ ...row, timeMs: Date.parse(String(row.sample_at || '')) }))
    .filter((row) => Number.isFinite(row.timeMs))
    .sort((left, right) => left.timeMs - right.timeMs);
  const integrate = (key) => {
    let wattHours = 0;
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const hours = (current.timeMs - previous.timeMs) / 3_600_000;
      if (!(hours > 0) || hours > 0.25) continue;
      wattHours += (Math.max(0, Number(previous[key]) || 0) + Math.max(0, Number(current[key]) || 0)) / 2 * hours;
    }
    return Number((wattHours / 1000).toFixed(3));
  };
  return {
    samples: sorted.length,
    firstSampleAt: sorted[0]?.sample_at || null,
    lastSampleAt: sorted[sorted.length - 1]?.sample_at || null,
    solarKwh: integrate('solar_w'),
    loadKwh: integrate('load_w'),
    gridImportKwh: integrate('grid_w'),
    batteryChargeKwh: integrate('battery_charge_w'),
    batteryDischargeKwh: integrate('battery_discharge_w')
  };
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

export async function providerQueryControl(provider) {
  assertProvider(provider);
  return await privateProviderQueryControlStatus(provider);
}

export async function setProviderQueriesPaused({ provider, paused, actorUserId = null }) {
  assertProvider(provider);
  return await privateProviderQueryControl(provider, paused, actorUserId);
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
  // Una credencial reemplazada nunca debe reutilizar la sesión de la clave
  // anterior. La operación de desconexión revoca solo la sesión externa y no
  // toca ninguna muestra histórica.
  if (existing?.id) await providerDb('disconnect', { account_id: existing.id });
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

export function shouldRecordProviderFailure(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return Number(error?.status) !== 423
    && !['CIRCUIT_OPEN', 'PROVIDER_DISABLED', 'CREDENTIALS_MISSING', 'NOT_CONFIGURED', 'ARCHIVE_STORAGE_ERROR'].includes(code)
    // Compatibilidad con errores producidos antes de que archive.js añadiera
    // el código explícito. Un timeout de nuestra base nunca debe castigar ni
    // bloquear la cuenta del proveedor externo.
    && !/Archivo permanente HTTP|statement timeout|canceling statement/i.test(message);
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
    return await authenticateFreshSession(site, account);
  } catch (error) {
    await markFailure(account, error);
    if (error && typeof error === 'object') error.providerFailureRecorded = true;
    throw error;
  }
}

async function authenticateFreshSession(site, account) {
  const credentials = await credentialsFor(account, site);
  if (!credentials) throw new ProviderError('El proveedor no tiene credenciales configuradas.', { code: 'CREDENTIALS_MISSING', status: 409 });
  const session = await adapters[account.provider].authenticate(credentials);
  await storeSession(account, session);
  return session;
}

async function storeSession(account, session) {
  const packed = encryptProviderSecret(session);
  const expiresAt = new Date(Date.now() + Math.max(300, Number(session.expiresInSeconds || 600)) * 1000).toISOString();
  await providerDb('session_replace', { account_id: account.id, session_cipher: packed.cipher, encryption_version: packed.version, expires_at: expiresAt });
}

export function looksLikeExpiredISolarSession(error) {
  const message = String(error?.message || '').toLowerCase();
  return Number(error?.status) === 401
    || error?.code === 'SESSION_EXPIRED'
    || message.includes('sesión')
    || message.includes('session')
    || message.includes('token')
    || message.includes('login');
}

async function sharedISolarGroup(site, account) {
  const targetCredentials = await credentialsFor(account, site);
  if (!targetCredentials) return [{ site, account }];
  const catalog = await providerDb('accounts') || {};
  const sites = catalog.sites || [];
  const matches = [];
  for (const candidate of (catalog.accounts || []).filter((row) => row.provider === 'isolar' && row.enabled)) {
    const candidateSite = sites.find((row) => Number(row.id) === Number(candidate.site_id));
    if (!candidateSite) continue;
    const candidateCredentials = await credentialsFor(candidate, candidateSite);
    if (candidateCredentials?.username === targetCredentials.username && candidateCredentials?.password === targetCredentials.password) {
      matches.push({ site: candidateSite, account: candidate });
    }
  }
  return (matches.length ? matches : [{ site, account }]).sort((left, right) => Number(left.site.id) - Number(right.site.id));
}

// Unifica las operaciones de configuración con la misma sesión persistente
// que ya usa la telemetría. Así Programar no depende de una cookie antigua del
// navegador y funciona también cuando la UI identifica la instalación como
// `site:2`. La sesión rotativa de i.Solar se vuelve a guardar tras cada uso.
export async function withISolarProviderSession(deviceReference, operation, { retryRead = false } = {}) {
  const siteId = await ensureSite(deviceReference);
  const deviceSn = await resolveDeviceReference(deviceReference);
  if (!siteId || !deviceSn) throw new ProviderError('No fue posible identificar el inversor de esta instalación.', { code: 'DEVICE_NOT_FOUND', status: 404 });
  const site = await siteById(siteId);
  const account = await accountFor(siteId, 'isolar');
  if (!account) throw new ProviderError('i.Solar aún no está configurado para esta instalación.', { code: 'NOT_CONFIGURED', status: 409 });
  const sessionGroup = await sharedISolarGroup(site, account);
  const [sessionOwner] = sessionGroup;

  const run = async (session) => {
    const value = await operation({ session, deviceSn, siteId, site, account });
    for (const member of sessionGroup) await storeSession(member.account, session);
    return value;
  };

  let session = await sessionFor(sessionOwner.site, sessionOwner.account);
  try {
    return await run(session);
  } catch (error) {
    // Solo las lecturas se reintentan automáticamente. Una escritura nunca se
    // repite a ciegas porque la primera orden pudo haber alcanzado al inversor.
    if (!retryRead || !looksLikeExpiredISolarSession(error)) throw error;
    session = await authenticateFreshSession(sessionOwner.site, sessionOwner.account);
    return await run(session);
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

async function persistTelemetry({ site, account, providerDevice, payload, summary = {} }) {
  const providerSummary = account.provider === 'isolar' ? {
    deviceModel: providerDevice?.model || null,
    mainCpuFirmware: providerDevice?.firmware_main || null,
    secondaryCpuFirmware: providerDevice?.firmware_secondary || null,
    loggerFirmware: providerDevice?.logger_firmware || null,
    ...summary
  } : {};
  const storedPayload = account.provider === 'isolar' ? { ...payload, ...providerSummary } : payload;
  const canonical = account.provider === 'watchpower' ? normalizeWatchPower({ ...payload, device: providerDevice }) : normalizeISolar(storedPayload);
  const rawPayloadId = await recordRaw(site.id, providerDevice?.id || null, account.provider, 'realtime', storedPayload, canonical);
  if (canonical.quality?.energy_balance?.status === 'inconsistent') {
    return { canonical, inserted: false, rejected: true, rawPayloadId };
  }
  let archiveStored = 0;
  if (account.provider === 'isolar' && site.device_sn) {
    try {
      // El flujo canónico y los gráficos históricos deben recibir la misma
      // fotografía coherente. El bucket de cinco minutos hace idempotentes las
      // sincronizaciones de un minuto y evita inflar el archivo.
      archiveStored = Number((await archiveRows(String(site.device_sn), [storedPayload], { bucketMinutes: HISTORY_BUCKET_MINUTES, source: 'isolar-realtime' }))?.stored || 0);
    } catch (error) {
      // Una caída del archivo no se contabiliza como error de credenciales de
      // i.Solar; la reparación silenciosa del día completará ese intervalo.
      console.error('[isolar/archive] No fue posible persistir la muestra histórica.', { message: String(error?.message || error) });
    }
  }
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
  return { canonical, inserted: Boolean(result?.inserted), rejected: false, rawPayloadId, archiveStored };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function claimISolarInteractiveLease({ siteId, account }) {
  let leaseToken = await privateProviderSyncLease({ siteId, provider: 'isolar', minimumSeconds: 30 });
  if (leaseToken) return leaseToken;
  const blockedUntilMs = Date.parse(String(account?.blocked_until || ''));
  if (Number.isFinite(blockedUntilMs) && blockedUntilMs > Date.now()) {
    throw new ProviderError('i.Solar está en pausa preventiva. Se conserva la última información respaldada.', { code: 'CIRCUIT_OPEN', status: 423 });
  }
  // Una sola espera acotada: el botón se ordena detrás de la consulta que ya
  // está en curso, sin generar reintentos ni solicitudes superpuestas.
  await wait(historyLeaseRetryDelayMs(account));
  leaseToken = await privateProviderSyncLease({ siteId, provider: 'isolar', minimumSeconds: 30 });
  if (!leaseToken) throw new ProviderError('Otra actualización de i.Solar sigue en curso. Inténtalo nuevamente en unos segundos.', { code: 'PROVIDER_BUSY', status: 409 });
  return leaseToken;
}

async function fetchCoherentRealtime({ site, account, providerDevice, session, input, retryInconsistent = true, summary = {} }) {
  let persisted = null;
  let attempts = 0;
  const maximumAttempts = retryInconsistent ? 2 : 1;
  while (attempts < maximumAttempts) {
    attempts += 1;
    const payload = await adapters[account.provider].getRealtimeData(session, input);
    persisted = await persistTelemetry({ site, account, providerDevice, payload, summary });
    if (!persisted.rejected) break;
    if (attempts < maximumAttempts) await wait(750);
  }
  return { ...persisted, attempts };
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
  const sessionGroup = provider === 'isolar' ? await sharedISolarGroup(site, account) : [{ site, account }];
  const sessionOwner = sessionGroup[0];
  const session = await sessionFor(sessionOwner.site, sessionOwner.account);
  const health = await adapters[provider].healthCheck(session);
  if (provider === 'isolar') for (const member of sessionGroup) await storeSession(member.account, session);
  return { ...health, provider, readOnly: adapters[provider].readOnly };
}

export async function syncProviderNow({ siteId, provider }) {
  const site = await siteById(siteId);
  const account = await accountFor(siteId, provider);
  if (!account) throw new ProviderError('El proveedor aún no está configurado.', { code: 'NOT_CONFIGURED', status: 409 });
  if (provider === 'isolar') return await syncISolarGroupNow(await sharedISolarGroup(site, account));
  return await syncSingleProviderNow({ site, account, provider });
}

async function syncSingleProviderNow({ site, account, provider }) {
  const run = await providerDb('sync_start', { site_id: site.id, provider, sync_type: 'manual' });
  const runId = run?.id;
  const started = Date.now();
  try {
    let session = await sessionFor(site, account);
    let results;
    try {
      results = await synchronizeWithSession({ site, account, provider, session });
    } catch (firstError) {
      // i.Solar rota el token en sus respuestas. Una sesión guardada antes de
      // esta corrección puede haber quedado inválida: se renueva una sola vez,
      // sin bucles ni intentos consecutivos ilimitados.
      if (provider !== 'isolar' || !looksLikeExpiredISolarSession(firstError)) throw firstError;
      session = await authenticateFreshSession(site, account);
      results = await synchronizeWithSession({ site, account, provider, session });
    }
    const rejected = results.some((item) => item.rejected);
    if (runId) await providerDb('sync_finish', { run_id: runId, status: rejected ? 'partial' : 'success', samples_received: results.reduce((total, item) => total + Number(item.attempts || 1), 0), samples_inserted: results.filter((item) => item.inserted).length, duplicates: results.filter((item) => !item.inserted && !item.rejected).length, duration_ms: Date.now() - started, error_code: rejected ? 'ENERGY_BALANCE_INCONSISTENT' : '', error_message: rejected ? 'La respuesta cruda se guardó, pero no reemplazó la última muestra coherente.' : '' });
    return { provider, site: { id: site.id, name: site.name }, devices: results, readOnly: adapters[provider].readOnly, syncedAt: new Date().toISOString() };
  } catch (error) {
    if (runId) await providerDb('sync_finish', { run_id: runId, status: 'failed', samples_received: 0, samples_inserted: 0, duplicates: 0, error_code: String(error?.code || 'SYNC_ERROR').slice(0, 80), error_message: String(error?.message || 'Error de sincronización').slice(0, 240), duration_ms: Date.now() - started });
    if (!error?.providerFailureRecorded && shouldRecordProviderFailure(error)) await markFailure(account, error);
    throw error;
  }
}

async function synchronizeISolarGroupWithSession(group, session) {
  const activeSession = session;
  const results = [];
  for (const { site, account } of group) {
    // El identificador ya fue validado y está guardado por instalación. No se
    // vuelve a enumerar la cuenta completa cada cinco minutos; el ciclo consulta
    // directamente cada inversor configurado y rota una sola sesión común.
    const input = { deviceSn: String(site.device_sn || ''), nickName: site.name };
    if (!input.deviceSn) throw new ProviderError(`La instalación ${site.name} no tiene un equipo i.Solar configurado.`, { code: 'DEVICE_NOT_FOUND', status: 404 });
    const saved = await saveISolarDevice(account, input);
    const persisted = await fetchCoherentRealtime({ site, account, providerDevice: saved, session: activeSession, input });
    const canonical = persisted.canonical;
    if (saved && !persisted.rejected) await providerDb('device_update', { device_id: saved.id, model: canonical.device.model || '', firmware_main: canonical.device.firmware_main || '', firmware_secondary: canonical.device.firmware_secondary || '', last_reading_at: canonical.time.sampled_at_utc });
    results.push({ siteId: site.id, siteName: site.name, device: { alias: saved?.alias || input.nickName || null, serialMasked: saved?.serial_masked || maskIdentifier(input.deviceSn) }, canonical, inserted: persisted.inserted, rejected: persisted.rejected, attempts: persisted.attempts });
  }
  for (const { account } of group) await storeSession(account, activeSession);
  return results;
}

async function syncISolarGroupNow(group) {
  const runs = [];
  for (const { site } of group) runs.push({ site, run: await providerDb('sync_start', { site_id: site.id, provider: 'isolar', sync_type: 'grouped' }) });
  const started = Date.now();
  const sessionOwner = group[0];
  try {
    let session = await sessionFor(sessionOwner.site, sessionOwner.account);
    let results;
    try {
      results = await synchronizeISolarGroupWithSession(group, session);
    } catch (firstError) {
      if (!looksLikeExpiredISolarSession(firstError)) throw firstError;
      session = await authenticateFreshSession(sessionOwner.site, sessionOwner.account);
      results = await synchronizeISolarGroupWithSession(group, session);
    }
    for (const { site, run } of runs) {
      const item = results.find((result) => Number(result.siteId) === Number(site.id));
      if (run?.id) await providerDb('sync_finish', { run_id: run.id, status: item?.rejected ? 'partial' : 'success', samples_received: Number(item?.attempts || (item ? 1 : 0)), samples_inserted: item?.inserted ? 1 : 0, duplicates: item && !item.inserted && !item.rejected ? 1 : 0, duration_ms: Date.now() - started, error_code: item?.rejected ? 'ENERGY_BALANCE_INCONSISTENT' : '', error_message: item?.rejected ? 'La respuesta cruda se guardó, pero no reemplazó la última muestra coherente.' : '' });
    }
    return { provider: 'isolar', sites: group.map(({ site }) => ({ id: site.id, name: site.name })), devices: results, readOnly: false, syncedAt: new Date().toISOString() };
  } catch (error) {
    for (const { run } of runs) {
      if (run?.id) await providerDb('sync_finish', { run_id: run.id, status: 'failed', samples_received: 0, samples_inserted: 0, duplicates: 0, error_code: String(error?.code || 'SYNC_ERROR').slice(0, 80), error_message: String(error?.message || 'Error de sincronización').slice(0, 240), duration_ms: Date.now() - started });
    }
    if (!error?.providerFailureRecorded && shouldRecordProviderFailure(error)) {
      for (const { account } of group) await markFailure(account, error);
    }
    throw error;
  }
}

async function synchronizeWithSession({ site, account, provider, session }) {
  const listed = await adapters[provider].listDevices(session);
  const activeSession = listed.session || session;
  const inputDevices = provider === 'isolar'
    ? (listed.devices || []).filter((device) => String(device.deviceSn || device.sn || '') === String(site.device_sn || ''))
    : (listed.devices || []);
  const results = [];
  for (const input of inputDevices) {
    const saved = provider === 'watchpower' ? await saveDiscoveredDevice(account, input) : await saveISolarDevice(account, input);
    const persisted = await fetchCoherentRealtime({ site, account, providerDevice: saved, session: activeSession, input });
    const canonical = persisted.canonical;
    if (saved && !persisted.rejected) await providerDb('device_update', { device_id: saved.id, model: canonical.device.model || '', firmware_main: canonical.device.firmware_main || '', firmware_secondary: canonical.device.firmware_secondary || '', last_reading_at: canonical.time.sampled_at_utc });
    results.push({ device: { alias: saved?.alias || input.nickName || null, serialMasked: saved?.serial_masked || maskIdentifier(input.deviceSn) }, canonical, inserted: persisted.inserted, rejected: persisted.rejected, attempts: persisted.attempts });
  }
  if (!results.length) throw new ProviderError('El proveedor conectó, pero no devolvió el dispositivo de esta instalación.', { code: 'DEVICE_NOT_FOUND', status: 404 });
  // Una sincronización válida también renueva la sesión persistida y deja la
  // cuenta en estado conectado. WatchPower antes conservaba un estado de
  // error antiguo aun cuando seguía entregando muestras correctamente.
  await storeSession(account, activeSession);
  return results;
}

export async function syncProviderIfDue({ siteId, provider, minimumSeconds = 300 }) {
  assertProvider(provider);
  // WatchPower entrega una fotografía que suele mantenerse estable durante
  // varios minutos. Todas las entradas (cron, Inicio, prueba manual y
  // automatizaciones) comparten este piso para no abrir sincronizaciones
  // redundantes entre dos ciclos del archivo periódico.
  const effectiveMinimumSeconds = provider === 'watchpower'
    ? Math.max(300, Number(minimumSeconds) || 300)
    : Math.max(60, Number(minimumSeconds) || 60);
  const queryControl = await providerQueryControl(provider);
  if (queryControl?.paused) return { provider, siteId: Number(siteId), skipped: true, reason: 'manually_paused' };
  let claimSiteId = siteId;
  if (provider === 'isolar') {
    const site = await siteById(siteId);
    const account = await accountFor(siteId, provider);
    if (account) claimSiteId = (await sharedISolarGroup(site, account))[0].site.id;
  }
  const leaseToken = await privateProviderSyncLease({ siteId: claimSiteId, provider, minimumSeconds: providerClaimSeconds(effectiveMinimumSeconds) });
  if (!leaseToken) return { provider, siteId: Number(siteId), skipped: true, reason: 'recent_running_or_paused' };
  try {
    return await syncProviderNow({ siteId, provider });
  } finally {
    // La liberación exige el token propietario. Si Vercel corta la función,
    // la concesión expira sola y el ciclo siguiente puede recuperarse.
    await privateProviderSyncRelease({ siteId: claimSiteId, provider, token: leaseToken }).catch(() => false);
  }
}

// Inicio, el botón manual, el cron y la automatización comparten exactamente
// el mismo regulador. i.Solar se sincroniza por grupo para que un solo ciclo
// actualice todas las instalaciones asociadas a esa cuenta.
export async function syncProviderRealtimeIfDue({ siteId, provider, minimumSeconds = 300 }) {
  return await syncProviderIfDue({ siteId, provider, minimumSeconds: Math.max(60, minimumSeconds) });
}

export async function forceISolarRealtimeNow({ siteId }) {
  const queryControl = await providerQueryControl('isolar');
  if (queryControl?.paused) throw new ProviderError('Las consultas a i.Solar están suspendidas manualmente.', { code: 'PROVIDER_MANUALLY_PAUSED', status: 423 });
  const site = await siteById(siteId);
  const account = await accountFor(site.id, 'isolar');
  if (!account) throw new ProviderError('i.Solar aún no está configurado para esta instalación.', { code: 'NOT_CONFIGURED', status: 409 });
  const group = await sharedISolarGroup(site, account);
  const sessionOwner = group[0];
  const leaseToken = await claimISolarInteractiveLease({ siteId: sessionOwner.site.id, account: sessionOwner.account });
  const run = await providerDb('sync_start', { site_id: site.id, provider: 'isolar', sync_type: 'force_transmit' });
  const started = Date.now();
  try {
    const session = await sessionFor(sessionOwner.site, sessionOwner.account);
    const input = { deviceSn: String(site.device_sn || ''), nickName: site.name };
    if (!input.deviceSn) throw new ProviderError('La instalación no tiene un inversor i.Solar identificado.', { code: 'DEVICE_NOT_FOUND', status: 404 });
    const saved = await saveISolarDevice(account, input);
    const command = await adapters.isolar.forceTransmit(session, input);
    // En las dos secuencias capturadas con Proxyman la muestra apareció entre
    // seis y nueve segundos después de FORCE_TRAN. Una sola espera y una sola
    // lectura evitan convertir el botón en un sondeo agresivo.
    const waitMs = 9_000;
    await wait(waitMs);
    const technical = await adapters.isolar.getTechnicalProfile(session, input);
    const persisted = await fetchCoherentRealtime({ site, account, providerDevice: saved, session, input, summary: technical.summary });
    for (const member of group) await storeSession(member.account, session);
    if (saved && !persisted.rejected) await providerDb('device_update', {
      device_id: saved.id,
      model: persisted.canonical.device.model || '',
      firmware_main: persisted.canonical.device.firmware_main || '',
      firmware_secondary: persisted.canonical.device.firmware_secondary || '',
      last_reading_at: persisted.canonical.time.sampled_at_utc
    });
    const sampledAtMs = Date.parse(String(persisted.canonical?.time?.sampled_at_utc || ''));
    const freshAfterCommand = Number.isFinite(sampledAtMs) && sampledAtMs >= started - 15_000;
    if (run?.id) await providerDb('sync_finish', {
      run_id: run.id,
      status: persisted.rejected ? 'partial' : 'success',
      samples_received: Number(persisted.attempts || 1),
      samples_inserted: persisted.inserted ? 1 : 0,
      duplicates: !persisted.inserted && !persisted.rejected ? 1 : 0,
      duration_ms: Date.now() - started,
      error_code: persisted.rejected ? 'ENERGY_BALANCE_INCONSISTENT' : freshAfterCommand ? '' : 'FORCE_TRAN_STALE_SAMPLE',
      error_message: persisted.rejected ? 'La muestra forzada fue físicamente inconsistente.' : freshAfterCommand ? '' : 'i.Solar aceptó la orden, pero aún devolvió una muestra anterior.'
    });
    return {
      ok: !persisted.rejected,
      forced: command.accepted,
      freshAfterCommand,
      waitedMs: waitMs,
      canonical: persisted.canonical,
      archived: persisted.archiveStored,
      technical: technical.summary,
      sampledAt: persisted.canonical?.time?.sampled_at_utc || null,
      receivedAt: new Date().toISOString()
    };
  } catch (error) {
    if (run?.id) await providerDb('sync_finish', {
      run_id: run.id, status: 'failed', samples_received: 0, samples_inserted: 0, duplicates: 0,
      error_code: String(error?.code || 'FORCE_TRAN_ERROR').slice(0, 80),
      error_message: String(error?.message || 'No fue posible actualizar el inversor.').slice(0, 240),
      duration_ms: Date.now() - started
    });
    if (!error?.providerFailureRecorded && shouldRecordProviderFailure(error)) await markFailure(account, error);
    throw error;
  } finally {
    await privateProviderSyncRelease({ siteId: sessionOwner.site.id, provider: 'isolar', token: leaseToken }).catch(() => false);
  }
}

export async function downloadISolarDayArchive({ siteId, target = 'today', now = new Date() }) {
  const queryControl = await providerQueryControl('isolar');
  if (queryControl?.paused) throw new ProviderError('Las consultas a i.Solar están suspendidas manualmente.', { code: 'PROVIDER_MANUALLY_PAUSED', status: 423 });
  const requestedSite = await siteById(siteId);
  const account = await accountFor(requestedSite.id, 'isolar');
  if (!account) throw new ProviderError('i.Solar aún no está configurado para esta instalación.', { code: 'NOT_CONFIGURED', status: 409 });
  const group = await sharedISolarGroup(requestedSite, account);
  const sessionOwner = group[0];
  const leaseToken = await claimISolarInteractiveLease({ siteId: sessionOwner.site.id, account: sessionOwner.account });
  const todayKey = santiagoDateKey(now);
  const dateKey = target === 'previous' ? addDateKey(todayKey, -1) : todayKey;
  const fullBounds = santiagoDateBoundsUtc(dateKey);
  const requestedThrough = target === 'previous' ? fullBounds.end : new Date(now);
  const { bounds, requestedEnd, providerRange } = isolarProviderRangeForSantiagoDate(dateKey, requestedThrough);
  const runs = [];
  for (const member of group) runs.push({ member, run: await providerDb('sync_start', { site_id: member.site.id, provider: 'isolar', sync_type: target === 'previous' ? 'history_day_daily' : 'history_day_manual' }) });
  const started = Date.now();
  const results = [];
  let firstError = null;
  try {
    const session = await sessionFor(sessionOwner.site, sessionOwner.account);
    for (const { member, run } of runs) {
      const input = { deviceSn: String(member.site.device_sn || ''), nickName: member.site.name };
      try {
        if (!input.deviceSn) throw new ProviderError(`La instalación ${member.site.name} no tiene un inversor i.Solar identificado.`, { code: 'DEVICE_NOT_FOUND', status: 404 });
        const beforeRows = await readEnergySamples(member.site.id, bounds.start.toISOString(), requestedEnd.toISOString(), 20_000);
        const history = await adapters.isolar.getHistory(session, input, {
          startDate: providerRange.start,
          endDate: providerRange.end,
          pageSize: 500,
          maxPages: 2
        });
        const boundedRows = history.rows.filter((row) => {
          const sampledAt = rowSampleTime(row);
          return sampledAt != null && sampledAt >= bounds.start.getTime() && sampledAt < requestedEnd.getTime();
        });
        const archived = await archiveRows(input.deviceSn, boundedRows, { bucketMinutes: HISTORY_BUCKET_MINUTES, source: target === 'previous' ? 'isolar-day-daily' : 'isolar-day-manual' });
        const storedRows = await readEnergySamples(member.site.id, bounds.start.toISOString(), requestedEnd.toISOString(), 20_000);
        const audit = analyzeHistoryGaps(storedRows, { from: bounds.start, to: requestedEnd, bucketMinutes: HISTORY_BUCKET_MINUTES });
        const analysis = summarizeEnergySamples(storedRows);
        const result = {
          site: { id: member.site.id, name: member.site.name },
          date: dateKey,
          received: boundedRows.length,
          saved: archived.stored,
          newSamples: Math.max(0, storedRows.length - beforeRows.length),
          providerRequests: history.requests,
          truncated: history.truncated,
          audit: { ...audit, missingBuckets: undefined },
          analysis
        };
        results.push(result);
        if (run?.id) await providerDb('sync_finish', {
          run_id: run.id,
          status: history.truncated || !boundedRows.length ? 'partial' : 'success',
          samples_received: boundedRows.length,
          samples_inserted: archived.stored,
          duplicates: Math.max(0, boundedRows.length - result.newSamples),
          error_code: history.truncated ? 'HISTORY_DAY_TRUNCATED' : !boundedRows.length ? 'HISTORY_DAY_EMPTY' : '',
          error_message: history.truncated ? 'i.Solar indicó que la descarga del día quedó paginada parcialmente.' : !boundedRows.length ? 'i.Solar no entregó muestras para el día solicitado.' : '',
          duration_ms: Date.now() - started
        });
      } catch (error) {
        firstError ||= error;
        if (run?.id) await providerDb('sync_finish', {
          run_id: run.id, status: 'failed', samples_received: 0, samples_inserted: 0, duplicates: 0,
          error_code: String(error?.code || 'HISTORY_DAY_ERROR').slice(0, 80),
          error_message: String(error?.message || 'No fue posible descargar el día.').slice(0, 240),
          duration_ms: Date.now() - started
        });
      }
    }
    for (const member of group) await storeSession(member.account, session);
    if (!results.length && firstError) throw firstError;
    return {
      ok: results.length > 0,
      target,
      date: dateKey,
      providerTimezone: 'Asia/Shanghai',
      siteTimezone: 'America/Santiago',
      providerRange,
      requestedAt: new Date(now).toISOString(),
      sites: results
    };
  } catch (error) {
    if (!error?.providerFailureRecorded && shouldRecordProviderFailure(error)) await markFailure(sessionOwner.account, error);
    throw error;
  } finally {
    await privateProviderSyncRelease({ siteId: sessionOwner.site.id, provider: 'isolar', token: leaseToken }).catch(() => false);
  }
}

export async function syncEnabledProviders({ onlyProvider = null, minimumSeconds = 300 } = {}) {
  const sites = await listProviderAccounts();
  const results = [];
  for (const site of sites) {
    for (const account of site.providers.filter((item) => item.enabled && (!onlyProvider || item.provider === onlyProvider))) {
      try {
        // Un solo ciclo i.Solar actualiza todas las instalaciones de la misma
        // cuenta y alimenta los acumulados diarios. No degradarlo a 15 minutos
        // cuando la app queda en reposo: WatchPower conserva esa optimización.
        const providerMinimum = providerBackgroundIntervalSeconds(account.provider,minimumSeconds);
        results.push(await syncProviderIfDue({ siteId: site.id, provider: account.provider, minimumSeconds: providerMinimum }));
      } catch (error) {
        results.push({ siteId: site.id, provider: account.provider, error: String(error?.message || 'Error de proveedor') });
      }
    }
  }
  return results;
}

export async function latestCanonical(siteId, provider) {
  assertProvider(provider);
  const current = await providerDb('latest', { site_id: siteId, provider });
  if (current?.canonical && evaluateEnergyBalance(current.canonical).status !== 'inconsistent') return current;
  // También depura muestras guardadas antes de que existiera
  // quality.energy_balance, independientemente del proveedor.
  // Se buscan solo seis horas para mantener esta lectura liviana y se devuelve
  // la última fotografía temporal físicamente coherente.
  const to = new Date(Date.now() + 5 * 60_000).toISOString();
  const from = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
  const recent = await providerDb('history', { site_id: siteId, provider, from, to, limit: 1500 }) || [];
  const coherent = [...recent].reverse().find((sample) => sample?.canonical && evaluateEnergyBalance(sample.canonical).status !== 'inconsistent');
  if (coherent) return coherent;
  if (provider !== 'isolar') return null;
  const archived = await readLatestEnergySample(siteId);
  if (!archived) return null;
  const fallback = archivedSample(archived);
  return evaluateEnergyBalance(fallback.canonical).status === 'inconsistent' ? null : fallback;
}

export async function providerHistory(siteId, provider, from, to, limit = 10_000) {
  assertProvider(provider);
  const boundedLimit = Math.min(20_000, Math.max(1, Number(limit) || 10_000));
  const current = await providerDb('history', { site_id: siteId, provider, from, to, limit: boundedLimit }) || [];
  // Los payloads crudos se conservan, pero una muestra imposible nunca debe
  // contaminar acumulados, gráficos ni proyecciones históricas.
  const coherentCurrent = current.filter((sample) => sample?.canonical && evaluateEnergyBalance(sample.canonical).status !== 'inconsistent');
  if (coherentCurrent.length || provider !== 'isolar') return coherentCurrent;
  return (await readEnergySamples(siteId, from, to, boundedLimit)).map(archivedSample);
}

const PROVIDER_SERIES_FIELDS=['pvInputPower1','pvInputPower2','acOutputActivePowerTotal','gridPowerInputActiveTotal','batteryChargingPower','batteryDischargingPower'];

function providerSeriesDateKey(value){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
}

function providerSeriesBucket(date,resolution){
  return resolution==='day'?providerSeriesDateKey(date):new Date(Math.floor(date.getTime()/3_600_000)*3_600_000).toISOString();
}

export async function providerHistorySeries(deviceSn,provider,from,to,resolution='hour'){
  assertProvider(provider);
  const siteId=await findSiteId(deviceSn);
  if(!siteId)return [];
  const startMs=Date.parse(from),endMs=Date.parse(to);
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs||endMs-startMs>2*366*86_400_000)throw new ProviderError('Rango histórico inválido.',{code:'INVALID_HISTORY_RANGE',status:400});
  const samples=[];
  const chunkMs=45*86_400_000;
  for(let cursor=startMs;cursor<endMs;cursor+=chunkMs){
    const chunkStart=new Date(Math.max(startMs-3_600_000,cursor-(cursor===startMs?3_600_000:600_000))).toISOString();
    const chunkEnd=new Date(Math.min(endMs,cursor+chunkMs)).toISOString();
    samples.push(...await providerHistory(siteId,provider,chunkStart,chunkEnd,20_000));
  }
  const unique=new Map(samples.map(sample=>[String(sample.sampled_at),sample]));
  const ordered=[...unique.values()].sort((left,right)=>Date.parse(left.sampled_at)-Date.parse(right.sampled_at));
  const buckets=new Map();
  for(let index=0;index<ordered.length;index+=1){
    const sample=ordered[index];
    const time=new Date(sample.sampled_at);
    if(time.getTime()<startMs||time.getTime()>=endMs)continue;
    const legacy=canonicalToLegacy(sample.canonical);
    const key=providerSeriesBucket(time,resolution);
    let bucket=buckets.get(key);
    if(!bucket){
      bucket={currentTime:resolution==='day'?time.toISOString():key,provider,aggregateSamples:0,aggregateHours:0,statusGrid:0,batteryCapacitySum:0,batteryCapacityCount:0,energy:{},instant:{}};
      for(const field of PROVIDER_SERIES_FIELDS){bucket.energy[field]=0;bucket.instant[field]=0}
      buckets.set(key,bucket);
    }
    bucket.aggregateSamples+=1;
    bucket.statusGrid=Math.max(bucket.statusGrid,Number(legacy.statusGrid||0));
    const soc=Number(legacy.batteryCapacity);
    if(Number.isFinite(soc)){bucket.batteryCapacitySum+=soc;bucket.batteryCapacityCount+=1}
    for(const field of PROVIDER_SERIES_FIELDS)bucket.instant[field]+=Number(legacy[field]||0);
    const previous=ordered[index-1];
    const previousTime=previous?Date.parse(previous.sampled_at):NaN;
    const intervalHours=(time.getTime()-previousTime)/3_600_000;
    if(!previous||!Number.isFinite(intervalHours)||intervalHours<=0||intervalHours>0.5)continue;
    const previousLegacy=canonicalToLegacy(previous.canonical);
    bucket.aggregateHours+=intervalHours;
    for(const field of PROVIDER_SERIES_FIELDS)bucket.energy[field]+=((Number(previousLegacy[field]||0)+Number(legacy[field]||0))/2)*intervalHours;
  }
  return [...buckets.values()].map(bucket=>{
    const row={currentTime:bucket.currentTime,provider:bucket.provider,statusGrid:bucket.statusGrid,aggregateSamples:bucket.aggregateSamples,aggregateHours:bucket.aggregateHours,batteryCapacity:bucket.batteryCapacityCount?bucket.batteryCapacitySum/bucket.batteryCapacityCount:undefined};
    for(const field of PROVIDER_SERIES_FIELDS)row[field]=bucket.aggregateHours>0?bucket.energy[field]/bucket.aggregateHours:bucket.instant[field]/Math.max(1,bucket.aggregateSamples);
    return row;
  }).sort((left,right)=>Date.parse(left.currentTime)-Date.parse(right.currentTime));
}

export async function auditISolarHistoryToday(siteId, { now = new Date() } = {}) {
  const site = await siteById(siteId);
  const account = await accountFor(site.id, 'isolar');
  const bucketMs = HISTORY_BUCKET_MINUTES * 60_000;
  const toMs = Math.floor(new Date(now).getTime() / bucketMs) * bucketMs;
  // Incluye hoy y los tres días locales anteriores. Así al abrir Mi Solar se
  // reparan también huecos recientes que afecten gráficos, costos y cálculos.
  const fromMs = santiagoMidnightUtc(new Date(new Date(now).getTime() - HISTORY_LOOKBACK_DAYS * 86_400_000)).getTime();
  const rows = await readEnergySamples(site.id, new Date(fromMs).toISOString(), new Date(toMs).toISOString(), 20_000);
  const audit = analyzeHistoryGaps(rows, { from: new Date(fromMs), to: new Date(toMs), bucketMinutes: HISTORY_BUCKET_MINUTES });
  return {
    site: { id: site.id, name: site.name },
    provider: 'isolar',
    configured: Boolean(account?.enabled),
    checkedAt: new Date().toISOString(),
    lookbackDays: HISTORY_LOOKBACK_DAYS,
    ...audit,
    // Los instantes internos solo se utilizan para filtrar la respuesta del
    // proveedor y no se incluyen en la API pública.
    missingBuckets: audit.missingBuckets
  };
}

export async function repairISolarHistoryToday({ siteId }) {
  const requestStarted = Date.now();
  const initial = await auditISolarHistoryToday(siteId);
  const publicAudit = ({ missingBuckets, ...value }) => value;
  if (!initial.missingCount) {
    console.info('[history/repair] recent window complete', { siteId, from: initial.from, to: initial.to, coveragePercent: initial.coveragePercent });
    return { ok: true, queriedProvider: false, reason: 'complete', audit: publicAudit(initial), received: 0, inserted: 0 };
  }
  if (!initial.configured) {
    return { ok: false, queriedProvider: false, reason: 'not_configured', audit: publicAudit(initial), received: 0, inserted: 0 };
  }
  const control = await providerQueryControl('isolar');
  if (control?.paused) {
    return { ok: false, queriedProvider: false, reason: 'manually_paused', audit: publicAudit(initial), received: 0, inserted: 0 };
  }

  const site = await siteById(siteId);
  const account = await accountFor(site.id, 'isolar');
  if (!account) return { ok: false, queriedProvider: false, reason: 'not_configured', audit: publicAudit(initial), received: 0, inserted: 0 };
  const group = await sharedISolarGroup(site, account);
  const sessionOwner = group[0];
  // Reutiliza la concesión distribuida ya desplegada. Así la recuperación
  // histórica nunca compite ni se superpone con la telemetría instantánea.
  let leaseToken = await privateProviderSyncLease({ siteId: sessionOwner.site.id, provider: 'isolar', minimumSeconds: 30 });
  if (!leaseToken) {
    const latestAccount = await accountFor(sessionOwner.site.id, 'isolar');
    const blockedUntilMs = Date.parse(String(latestAccount?.blocked_until || ''));
    if (Number.isFinite(blockedUntilMs) && blockedUntilMs > Date.now()) {
      return { ok: false, queriedProvider: false, reason: 'temporarily_blocked', audit: publicAudit(initial), received: 0, inserted: 0 };
    }
    const retryDelayMs = historyLeaseRetryDelayMs(latestAccount);
    console.info('[history/repair] queued behind realtime sync', { siteId, retryDelayMs, missingCount: initial.missingCount, coveragePercent: initial.coveragePercent });
    // No consulta a i.Solar mientras espera. Se realiza un solo segundo intento
    // de obtener la concesión; nunca existe un ciclo de reintentos.
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    const controlAfterWait = await providerQueryControl('isolar');
    if (controlAfterWait?.paused) {
      return { ok: false, queriedProvider: false, reason: 'manually_paused', audit: publicAudit(initial), received: 0, inserted: 0 };
    }
    leaseToken = await privateProviderSyncLease({ siteId: sessionOwner.site.id, provider: 'isolar', minimumSeconds: 30 });
    if (!leaseToken) {
      console.info('[history/repair] skipped after one queued attempt: provider regulator busy', { siteId, missingCount: initial.missingCount, coveragePercent: initial.coveragePercent });
      return { ok: false, queriedProvider: false, reason: 'recent_running_or_blocked', audit: publicAudit(initial), received: 0, inserted: 0 };
    }
  }

  const run = await providerDb('sync_start', { site_id: site.id, provider: 'isolar', sync_type: 'history_repair_recent' });
  const started = Date.now();
  try {
    const session = await sessionFor(sessionOwner.site, sessionOwner.account);
    const input = { deviceSn: String(site.device_sn || ''), nickName: site.name };
    if (!input.deviceSn) throw new ProviderError('La instalación no tiene un inversor i.Solar identificado.', { code: 'DEVICE_NOT_FOUND', status: 404 });
    const windows = buildHistoryRepairWindows(initial.missingBuckets, { bucketMinutes: initial.bucketMinutes });
    const historyRows = [];
    let providerRequests = 0;
    let providerTruncated = false;
    let queriedWindows = 0;
    let deadlineReached = false;
    for (const window of windows) {
      if (Date.now() - requestStarted >= HISTORY_REPAIR_DEADLINE_MS) {
        deadlineReached = true;
        break;
      }
      const history = await adapters.isolar.getHistory(session, input, {
        startDate: formatISolarTimestamp(window.startMs),
        endDate: formatISolarTimestamp(window.endMs - 1000),
        pageSize: 500,
        maxPages: 1
      });
      queriedWindows += 1;
      providerRequests += history.requests;
      providerTruncated ||= history.truncated;
      historyRows.push(...history.rows);
    }
    console.info('[history/repair] provider response', {
      siteId,
      strategy: 'recent-first-6h-windows',
      requestedWindows: windows.length,
      queriedWindows,
      received: historyRows.length,
      requests: providerRequests,
      truncated: providerTruncated,
      deadlineReached
    });

    const missingSet = new Set(initial.missingBuckets);
    const bucketMs = initial.bucketMinutes * 60_000;
    const selectedByBucket = new Map();
    for (const row of historyRows) {
      const sampledAt = rowSampleTime(row);
      if (sampledAt == null) continue;
      const bucket = Math.floor(sampledAt / bucketMs) * bucketMs;
      if (missingSet.has(bucket)) selectedByBucket.set(bucket, row);
    }
    const selectedRows = [...selectedByBucket.entries()].sort((left, right) => left[0] - right[0]).map((entry) => entry[1]);
    const archived = await archiveRows(input.deviceSn, selectedRows, { bucketMinutes: initial.bucketMinutes, source: 'isolar-history-repair' });
    for (const member of group) await storeSession(member.account, session);
    const latestRow = selectedRows[selectedRows.length - 1];
    if (latestRow) {
      const savedDevice = await saveISolarDevice(account, input);
      const latestCanonical = normalizeISolar(latestRow);
      await providerDb('device_update', { device_id: savedDevice.id, model: '', firmware_main: '', firmware_secondary: '', last_reading_at: latestCanonical.time.sampled_at_utc });
    }
    const finalAudit = await auditISolarHistoryToday(site.id);
    const unavailableAtSource = historyRows.length === 0 || selectedRows.length === 0;
    const incomplete = providerTruncated || deadlineReached || finalAudit.missingCount > 0;
    if (run?.id) await providerDb('sync_finish', {
      run_id: run.id,
      status: incomplete ? 'partial' : 'success',
      samples_received: historyRows.length,
      samples_inserted: archived.stored,
      duplicates: Math.max(0, historyRows.length - selectedRows.length),
      error_code: providerTruncated ? 'HISTORY_WINDOW_TRUNCATED' : deadlineReached ? 'HISTORY_REPAIR_DEADLINE' : '',
      error_message: providerTruncated ? 'Una ventana histórica de seis horas superó una página.' : deadlineReached ? 'La reparación se detuvo dentro del límite seguro de tiempo.' : '',
      duration_ms: Date.now() - started
    });
    return {
      ok: finalAudit.missingCount === 0,
      queriedProvider: true,
      reason: providerTruncated || deadlineReached ? 'partial' : unavailableAtSource ? 'source_unavailable' : finalAudit.missingCount ? 'remaining_gaps' : 'repaired',
      providerRequests,
      queriedWindows,
      received: historyRows.length,
      inserted: archived.stored,
      audit: publicAudit(finalAudit)
    };
  } catch (error) {
    if (run?.id) await providerDb('sync_finish', {
      run_id: run.id, status: 'failed', samples_received: 0, samples_inserted: 0, duplicates: 0,
      error_code: String(error?.code || 'HISTORY_REPAIR_ERROR').slice(0, 80),
      error_message: String(error?.message || 'Error de reparación histórica').slice(0, 240),
      duration_ms: Date.now() - started
    });
    if (!error?.providerFailureRecorded && shouldRecordProviderFailure(error)) await markFailure(account, error);
    throw error;
  } finally {
    await privateProviderSyncRelease({ siteId: sessionOwner.site.id, provider: 'isolar', token: leaseToken }).catch(() => false);
  }
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
