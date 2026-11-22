import { canonicalToLegacy } from './canonicalTelemetry.js';
import { latestCanonical, providerHistorySeries, publicProviderCatalog } from './providerStore.js';
import { storedForecastForDate } from './solarProjection.js';

const SITE_TIME_ZONE = 'America/Santiago';
const PUBLIC_REALTIME_FIELDS = [
  'currentTime',
  'pvInputPower1', 'pvInputPower2', 'pvInputVoltage1', 'pvInputCurrent1', 'pvInputVoltage2', 'pvInputCurrent2',
  'acOutputActivePowerTotal', 'acOutputApparentPowerTotal', 'gridPowerInputActiveTotal', 'statusGrid',
  'batteryChargingPower', 'batteryDischargingPower', 'batteryCapacity', 'batteryVoltage', 'batteryCurrent',
  'acOutputVoltage', 'acOutputFrequency', 'inverterTemperature', 'radiatorTemperature', 'statusInverter',
  'fault1', 'warning1', 'workMode', 'outputSourcePriority', 'deviceModel', 'mainCpuFirmware',
  'secondaryCpuFirmware', 'loggerFirmware', 'ratedOutputPowerW', 'ratedOutputPowerVa', 'mpptTrackerCount'
];
const PUBLIC_HISTORY_FIELDS = [
  'currentTime', 'provider', 'aggregateSamples', 'aggregateHours', 'statusGrid', 'batteryCapacity',
  'pvInputPower1', 'pvInputPower2', 'acOutputActivePowerTotal', 'gridPowerInputActiveTotal',
  'batteryChargingPower', 'batteryDischargingPower'
];

function finiteOrValue(value) {
  if (value === null || value === undefined || value === '') return value ?? null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return typeof value === 'string' || typeof value === 'boolean' ? value : null;
}

function pickPublicFields(source, fields) {
  const result = {};
  for (const field of fields) {
    const value = finiteOrValue(source?.[field]);
    if (value !== null && value !== undefined && value !== '') result[field] = value;
  }
  return result;
}

export function sanitizeMonitorRealtime(canonical) {
  return pickPublicFields(canonicalToLegacy(canonical || {}), PUBLIC_REALTIME_FIELDS);
}

export function sanitizeMonitorHistory(row) {
  return pickPublicFields(row || {}, PUBLIC_HISTORY_FIELDS);
}

function chileDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - date.getTime();
}

function zonedMidnightUtc(date, timeZone = SITE_TIME_ZONE) {
  const [year, month, day] = date.split('-').map(Number);
  let guess = new Date(Date.UTC(year, month - 1, day));
  for (let index = 0; index < 2; index += 1) {
    guess = new Date(Date.UTC(year, month - 1, day) - timeZoneOffsetMs(guess, timeZone));
  }
  return guess.toISOString();
}

function sampleTime(sample) {
  const parsed = Date.parse(sample?.sampled_at || sample?.received_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

async function freshestSavedSample(site) {
  const enabled = (site.providers || []).filter((item) => item.enabled).map((item) => item.provider);
  const samples = await Promise.all(enabled.map(async (provider) => ({
    provider,
    sample: await latestCanonical(site.id, provider).catch(() => null)
  })));
  return samples.filter((item) => item.sample?.canonical).sort((left, right) => sampleTime(right.sample) - sampleTime(left.sample))[0] || null;
}

async function publicSiteSnapshot(site, today, from, to) {
  const latest = await freshestSavedSample(site);
  if (!latest) {
    return { id: site.id, key: site.siteKey, name: site.name, available: false, realtime: {}, history: [], forecastTodayKwh: null };
  }
  const [history, forecast] = await Promise.all([
    providerHistorySeries(site.siteKey, latest.provider, from, to, 'hour').catch(() => []),
    storedForecastForDate(site.siteKey, today).catch(() => null)
  ]);
  return {
    id: site.id,
    key: site.siteKey,
    name: site.name,
    available: true,
    provider: latest.provider,
    sampledAt: latest.sample.sampled_at || latest.sample.received_at || null,
    realtime: sanitizeMonitorRealtime(latest.sample.canonical),
    history: history.map(sanitizeMonitorHistory),
    forecastTodayKwh: Number.isFinite(Number(forecast?.forecastKwh)) ? Number(forecast.forecastKwh) : null
  };
}

/**
 * Resumen público, estrictamente de solo lectura. Lee únicamente muestras ya
 * respaldadas por Mi Solar: nunca autentica, sincroniza ni consulta proveedores.
 */
export async function publicMonitorSnapshot(now = new Date()) {
  const today = chileDate(now);
  const from = zonedMidnightUtc(today);
  const to = zonedMidnightUtc(addDays(today, 1));
  const catalog = await publicProviderCatalog();
  const sites = await Promise.all(catalog.map((site) => publicSiteSnapshot(site, today, from, to)));
  return {
    readOnly: true,
    generatedAt: now.toISOString(),
    date: today,
    refreshAfterSeconds: 60,
    sites
  };
}
