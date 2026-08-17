export const APP_VERSION = '8.21.1';

export const SESSION_POLICY = {
  idleMs: 24 * 60 * 60_000,
  activityPingMs: 5 * 60_000,
  storageKey: 'miSolarLastUserActivity'
} as const;

export const REFRESH_POLICY = {
  realtime: 30_000,
  day: 5 * 60_000,
  week: 5 * 60_000,
  month: 5 * 60_000,
  weather: 5 * 60_000,
  radiation: 5 * 60_000
} as const;
