import type { HistoryRow, Realtime } from '../types';

export type SiteCachePayload = {
  realtime?: Realtime;
  summary?: Realtime;
  dayRows?: HistoryRow[];
  weekRows?: HistoryRow[];
  monthRows?: HistoryRow[];
  savedAt?: number;
  monthCheckedAt?: number;
  realtimeSavedAt?: number;
  summarySavedAt?: number;
  realtimeSchemaVersion?: number;
};

const PREFIX = 'miSolar:v8.1:site-cache:';
const REALTIME_SCHEMA_VERSION = 3;

function key(deviceSn: string, provider = 'isolar') {
  return `${PREFIX}${deviceSn}:${provider}`;
}

export function readSiteCache(deviceSn: string, provider = 'isolar'): SiteCachePayload | null {
  if (!deviceSn) return null;
  try {
    const raw = localStorage.getItem(key(deviceSn, provider));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SiteCachePayload;
    // No reutilizar datos con más de 24 horas; evita mezclar días antiguos.
    if (!parsed.savedAt || Date.now() - parsed.savedAt > 24 * 60 * 60_000) return null;
    // Las versiones anteriores guardaban la respuesta viva de i.Solar antes
    // de pasar por el modelo canónico. Se conservan sus históricos, pero esa
    // fotografía instantánea no puede volver a alimentar el diagrama.
    if (parsed.realtimeSchemaVersion !== REALTIME_SCHEMA_VERSION) {
      delete parsed.realtime;
      delete parsed.summary;
      delete parsed.realtimeSavedAt;
      delete parsed.summarySavedAt;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSiteCache(deviceSn: string, patch: SiteCachePayload, provider = 'isolar') {
  if (!deviceSn) return;
  try {
    const current = readSiteCache(deviceSn, provider) || {};
    const now = Date.now();
    localStorage.setItem(key(deviceSn, provider), JSON.stringify({
      ...current,
      ...patch,
      savedAt: now,
      ...(Object.prototype.hasOwnProperty.call(patch, 'realtime') ? { realtimeSchemaVersion: REALTIME_SCHEMA_VERSION } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'realtime') ? { realtimeSavedAt: now } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'summary') ? { summarySavedAt: now } : {})
    }));
  } catch {
    // El caché es una mejora de resiliencia: nunca debe romper la aplicación.
  }
}
