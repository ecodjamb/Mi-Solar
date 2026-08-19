import type { HistoryRow, Realtime } from '../types';

export type SiteCachePayload = {
  realtime?: Realtime;
  summary?: Realtime;
  dayRows?: HistoryRow[];
  weekRows?: HistoryRow[];
  monthRows?: HistoryRow[];
  savedAt?: number;
  realtimeSavedAt?: number;
  summarySavedAt?: number;
};

const PREFIX = 'miSolar:v8.1:site-cache:';

function key(deviceSn: string) {
  return `${PREFIX}${deviceSn}`;
}

export function readSiteCache(deviceSn: string): SiteCachePayload | null {
  if (!deviceSn) return null;
  try {
    const raw = localStorage.getItem(key(deviceSn));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SiteCachePayload;
    // No reutilizar datos con más de 24 horas; evita mezclar días antiguos.
    if (!parsed.savedAt || Date.now() - parsed.savedAt > 24 * 60 * 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSiteCache(deviceSn: string, patch: SiteCachePayload) {
  if (!deviceSn) return;
  try {
    const current = readSiteCache(deviceSn) || {};
    const now = Date.now();
    localStorage.setItem(key(deviceSn), JSON.stringify({
      ...current,
      ...patch,
      savedAt: now,
      ...(Object.prototype.hasOwnProperty.call(patch, 'realtime') ? { realtimeSavedAt: now } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'summary') ? { summarySavedAt: now } : {})
    }));
  } catch {
    // El caché es una mejora de resiliencia: nunca debe romper la aplicación.
  }
}
