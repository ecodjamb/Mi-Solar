'use strict';

const fs = require('node:fs/promises');
const { isAlexaDeviceId, normalizeDataStoreTarget } = require('./datastore-client.cjs');

const MONITOR_URL = 'https://misolar.vercel.app/api/alexa/widget-data';
const PUBLIC_MONITOR_URL = 'https://misolar.vercel.app/api/public/monitor';
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

function localizedNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
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
    bateriaValor: 0,
    red: '--',
    redDireccion: 'SIN INTERCAMBIO',
    generadoHoy: '--',
    esperadoHoy: '--',
    progresoSolar: '0%',
    progresoSolarValor: 0,
    tienePronostico: false,
    pv1: '--',
    pv2: '--',
    estado: status,
    hora: '--:--',
    origen: '--',
    disponible: false,
    sampledAt: null
  };
}

function enrichSnapshot(snapshot) {
  const battery = localizedNumber(snapshot?.bateria);
  const signedGridKw = localizedNumber(snapshot?.red);
  const direction = snapshot?.redDireccion || (
    signedGridKw == null || Math.abs(signedGridKw) <= 0.05
      ? 'SIN INTERCAMBIO'
      : signedGridKw < 0 ? 'EXPORTANDO A LA RED' : 'IMPORTANDO DE LA RED'
  );
  return {
    ...snapshot,
    bateriaValor: Number.isFinite(battery) ? Math.max(0, Math.min(100, Math.round(battery))) : 0,
    red: Number.isFinite(signedGridKw) ? formatKw(Math.abs(signedGridKw) * 1000) : (snapshot?.red || '--'),
    redDireccion: direction
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
  const imported = Math.max(0, number(realtime.gridPowerInputActiveTotal));
  const exported = Math.max(0, number(realtime.gridPowerOutputActiveTotal));
  const gridDirection = imported > 50
    ? 'IMPORTANDO DE LA RED'
    : exported > 50 ? 'EXPORTANDO A LA RED' : 'SIN INTERCAMBIO';
  return enrichSnapshot({
    sitio: SITE_NAME,
    generacion: formatKw(number(realtime.pvInputPower1) + number(realtime.pvInputPower2)),
    pv1: formatKw(realtime.pvInputPower1),
    pv2: formatKw(realtime.pvInputPower2),
    consumo: formatKw(realtime.acOutputActivePowerTotal),
    bateria: formatPercent(realtime.batteryCapacity),
    red: formatKw(Math.max(imported, exported)),
    redDireccion: gridDirection,
    generadoHoy: formatKwh(generated),
    esperadoHoy: hasExpected ? formatKwh(expected) : '--',
    progresoSolar: `${progress}%`,
    progresoSolarValor: progress,
    tienePronostico: hasExpected,
    estado: isStale(site.sampledAt, now) ? 'Dato atrasado' : 'Actualizado',
    hora: formatTime(site.sampledAt),
    origen: String(site.provider || '--'),
    disponible: true,
    sampledAt: site.sampledAt
  });
}

function refreshSeconds(payload) {
  const requested = Math.floor(number(payload?.refreshAfterSeconds, MAX_REFRESH_SECONDS));
  return Math.max(1, Math.min(MAX_REFRESH_SECONDS, requested || MAX_REFRESH_SECONDS));
}

async function fetchMonitor({
  fetchImpl = globalThis.fetch,
  timeoutMs = 7000,
  now = new Date(),
  protectedUrl = process.env.ALEXA_WIDGET_MONITOR_URL || MONITOR_URL,
  publicUrl = process.env.ALEXA_WIDGET_PUBLIC_MONITOR_URL || PUBLIC_MONITOR_URL,
  allowPublicFallback = process.env.ALEXA_WIDGET_PUBLIC_FALLBACK !== 'false'
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch no está disponible en este runtime.');
  const request = async (url, headers) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { headers, signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Endpoint Alexa HTTP ${response.status || 'desconocido'}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const token = process.env.ALEXA_WIDGET_TOKEN || process.env.ALEXA_WIDGET_DATA_TOKEN;
  let protectedError = null;
  if (token) {
    try {
      const payload = await request(protectedUrl, {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      });
      return {
        snapshot: payload?.sitio
          ? enrichSnapshot({
            ...payload,
            estado: isStale(payload.sampledAt, now) ? 'Dato atrasado' : (payload.estado || 'Actualizado')
          })
          : snapshotFromMonitor(payload, now),
        refreshAfterSeconds: refreshSeconds(payload),
        source: 'protected',
        protectedError: null
      };
    } catch (error) {
      protectedError = error;
    }
  } else {
    protectedError = new Error('Falta ALEXA_WIDGET_TOKEN en el entorno de la Lambda.');
    protectedError.code = 'ALEXA_WIDGET_TOKEN_MISSING';
  }

  if (!allowPublicFallback) throw protectedError;
  const payload = await request(publicUrl, { Accept: 'application/json' });
  return {
    snapshot: snapshotFromMonitor(payload, now),
    refreshAfterSeconds: refreshSeconds(payload),
    source: 'public-fallback',
    protectedError
  };
}

function snapshotFingerprint(snapshot) {
  const stable = {
    sampledAt: snapshot?.sampledAt || null,
    generacion: snapshot?.generacion,
    consumo: snapshot?.consumo,
    bateria: snapshot?.bateria,
    red: snapshot?.red,
    redDireccion: snapshot?.redDireccion,
    generadoHoy: snapshot?.generadoHoy,
    esperadoHoy: snapshot?.esperadoHoy,
    estado: snapshot?.estado
  };
  return JSON.stringify(stable);
}

function safeDiagnostic(error) {
  if (!error) return null;
  return {
    name: String(error.name || 'Error'),
    code: error.code ? String(error.code) : undefined,
    status: Number.isFinite(Number(error.status)) ? Number(error.status) : undefined,
    message: String(error.message || 'Error sin detalle').slice(0, 180)
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
  target,
  writeDataStore,
  fetchImpl = globalThis.fetch,
  timeoutMs,
  now = new Date(),
  statePath,
  force = false
}) {
  const normalizedTarget = normalizeDataStoreTarget(target || targetId);
  if (typeof writeDataStore !== 'function') throw new Error('Falta writeDataStore.');
  const state = await readState(statePath);
  const targetKey = normalizedTarget.type === 'USER'
    ? normalizedTarget.id
    : normalizedTarget.items.join(',');
  const targetState = state.targets?.[targetKey] || {};
  let snapshot;
  let refreshAfterSeconds = MAX_REFRESH_SECONDS;
  let sourceError = null;
  let source = 'unknown';
  let protectedError = null;

  try {
    const result = await fetchMonitor({ fetchImpl, timeoutMs, now });
    snapshot = result.snapshot;
    refreshAfterSeconds = result.refreshAfterSeconds;
    source = result.source;
    protectedError = result.protectedError || null;
    if (!snapshot.disponible && targetState.snapshot) {
      snapshot = { ...targetState.snapshot, estado: 'No disponible' };
    }
  } catch (error) {
    sourceError = error;
    if (!targetState.snapshot) throw error;
    snapshot = { ...targetState.snapshot, estado: 'Dato atrasado' };
  }

  const fingerprint = snapshotFingerprint(snapshot);
  if (!force && fingerprint === targetState.lastFingerprint) {
    return {
      written: false, snapshot, refreshAfterSeconds, source, sourceError,
      protectedError: safeDiagnostic(protectedError)
    };
  }

  await writeDataStore(snapshot, normalizedTarget);
  await writeState({
    ...state,
    targets: {
      ...state.targets,
      [targetKey]: {
        lastWrittenSampledAt: snapshot.sampledAt,
        lastFingerprint: fingerprint,
        snapshot,
        writtenAt: now.toISOString()
      }
    }
  }, statePath);
  return {
    written: true, snapshot, refreshAfterSeconds, source, sourceError,
    protectedError: safeDiagnostic(protectedError)
  };
}

module.exports = {
  MONITOR_URL,
  PUBLIC_MONITOR_URL,
  emptySnapshot,
  enrichSnapshot,
  fetchMonitor,
  generatedTodayKwh,
  isStale,
  isAlexaDeviceId,
  readState,
  refreshSeconds,
  selectArrayan,
  snapshotFromMonitor,
  snapshotFingerprint,
  syncMonitorToDataStore,
  writeState
};
