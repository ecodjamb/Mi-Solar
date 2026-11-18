'use strict';

const fs = require('node:fs/promises');

const MONITOR_URL = 'https://misolar.vercel.app/api/public/monitor';
const SITE_KEY = 'site:2';
const SITE_NAME = 'El Arrayán';
const DEFAULT_STATE_FILE = '/tmp/mi-solar-alexa-state.json';
const STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_REFRESH_SECONDS = 60;
const TZ = 'America/Santiago';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatKw(watts) {
  return `${(number(watts) / 1000).toFixed(1).replace('.', ',')} kW`;
}

function formatPercent(value) {
  return `${Math.round(number(value))} %`;
}

function formatKwh(value) {
  const kwh = Number(value);
  return Number.isFinite(kwh) ? `${kwh.toFixed(1).replace('.', ',')} kWh` : '--';
}

function generatedTodayKwh(site) {
  return (Array.isArray(site?.history) ? site.history : []).reduce((total, row) => {
    const hours = Math.max(0, number(row?.aggregateHours));
    const watts = Math.max(0, number(row?.pvInputPower1)) + Math.max(0, number(row?.pvInputPower2));
    return total + watts * hours / 1000;
  }, 0);
}

function formatTime(sampledAt) {
  const timestamp = Date.parse(sampledAt);
  if (!Number.isFinite(timestamp)) return '--:--';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(timestamp));
}

function isStale(sampledAt, now = new Date()) {
  const timestamp = Date.parse(sampledAt);
  if (!Number.isFinite(timestamp)) return true;
  const age = now.getTime() - timestamp;
  return age < -120000 || age > STALE_AFTER_MS;
}

function emptySnapshot(status = 'Sin datos') {
  return {
    sitio: SITE_NAME,
    generacion: '--',
    consumo: '--',
    bateria: '--',
    red: '--',
    generadoHoy: '--',
    esperadoHoy: '--',
    progresoSolar: '0%',
    estado: status,
    hora: '--:--',
    origen: '--',
    disponible: false,
    sampledAt: null
  };
}

function selectArrayan(payload) {
  const sites = Array.isArray(payload?.sites) ? payload.sites : [];
  return sites.find(site => site?.key === SITE_KEY) ||
    sites.find(site => site?.name === SITE_NAME) || null;
}

function snapshotFromMonitor(payload, now = new Date()) {
  const site = selectArrayan(payload);
  if (!site) throw new Error('La API pública no incluyó El Arrayán.');
  if (!site.available || !site.realtime || !site.sampledAt) {
    const unavailable = emptySnapshot('No disponible');
    unavailable.origen = String(site.provider || '--');
    unavailable.disponible = false;
    unavailable.sampledAt = site.sampledAt || null;
    unavailable.hora = formatTime(site.sampledAt);
    return unavailable;
  }

  const realtime = site.realtime;
  const generated = generatedTodayKwh(site);
  const expected = Number(site.forecastTodayKwh);
  const hasExpected = Number.isFinite(expected) && expected > 0;
  const progress = hasExpected ? Math.max(0, Math.min(100, Math.round(generated / expected * 100))) : 0;
  return {
    sitio: SITE_NAME,
    generacion: formatKw(number(realtime.pvInputPower1) + number(realtime.pvInputPower2)),
    consumo: formatKw(realtime.acOutputActivePowerTotal),
    bateria: formatPercent(realtime.batteryCapacity),
    red: formatKw(Math.max(0, number(realtime.gridPowerInputActiveTotal))),
    generadoHoy: formatKwh(generated),
    esperadoHoy: hasExpected ? formatKwh(expected) : '--',
    progresoSolar: `${progress}%`,
    estado: isStale(site.sampledAt, now) ? 'Dato atrasado' : 'Actualizado',
    hora: formatTime(site.sampledAt),
    origen: String(site.provider || '--'),
    disponible: true,
    sampledAt: site.sampledAt
  };
}

function refreshSeconds(payload) {
  const requested = Math.floor(number(payload?.refreshAfterSeconds, MAX_REFRESH_SECONDS));
  return Math.max(1, Math.min(MAX_REFRESH_SECONDS, requested || MAX_REFRESH_SECONDS));
}

async function fetchMonitor({
  fetchImpl = globalThis.fetch,
  timeoutMs = 7000,
  now = new Date()
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch no está disponible en este runtime.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(MONITOR_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`API pública HTTP ${response.status}`);
    const payload = await response.json();
    return {
      snapshot: snapshotFromMonitor(payload, now),
      refreshAfterSeconds: refreshSeconds(payload)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readState(path = process.env.ALEXA_WIDGET_STATE_FILE || DEFAULT_STATE_FILE) {
  try {
    const value = JSON.parse(await fs.readFile(path, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeState(state, path = process.env.ALEXA_WIDGET_STATE_FILE || DEFAULT_STATE_FILE) {
  await fs.writeFile(path, JSON.stringify(state), { mode: 0o600 });
}

async function syncMonitorToDataStore({
  targetId,
  writeDataStore,
  fetchImpl = globalThis.fetch,
  timeoutMs,
  now = new Date(),
  statePath
}) {
  if (!targetId) throw new Error('Falta el destino de Alexa Data Store.');
  if (typeof writeDataStore !== 'function') throw new Error('Falta writeDataStore.');
  const state = await readState(statePath);
  const targetState = state.targets?.[targetId] || {};
  let snapshot;
  let refreshAfterSeconds = MAX_REFRESH_SECONDS;
  let sourceError = null;

  try {
    const result = await fetchMonitor({ fetchImpl, timeoutMs, now });
    snapshot = result.snapshot;
    refreshAfterSeconds = result.refreshAfterSeconds;
    if (!snapshot.disponible && targetState.snapshot) {
      snapshot = { ...targetState.snapshot, estado: 'No disponible' };
    }
  } catch (error) {
    sourceError = error;
    if (!targetState.snapshot) throw error;
    snapshot = { ...targetState.snapshot, estado: 'Dato atrasado' };
  }

  if (snapshot.sampledAt && snapshot.sampledAt === targetState.lastWrittenSampledAt) {
    return { written: false, snapshot, refreshAfterSeconds, sourceError };
  }

  await writeDataStore(snapshot, targetId);
  await writeState({
    ...state,
    targets: {
      ...state.targets,
      [targetId]: {
        lastWrittenSampledAt: snapshot.sampledAt,
        snapshot,
        writtenAt: now.toISOString()
      }
    }
  }, statePath);
  return { written: true, snapshot, refreshAfterSeconds, sourceError };
}

module.exports = {
  MONITOR_URL,
  emptySnapshot,
  fetchMonitor,
  generatedTodayKwh,
  isStale,
  readState,
  refreshSeconds,
  selectArrayan,
  snapshotFromMonitor,
  syncMonitorToDataStore,
  writeState
};
