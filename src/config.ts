export const APP_VERSION = '8.38.5';

export const SESSION_POLICY = {
  idleMs: 24 * 60 * 60_000,
  activityPingMs: 5 * 60_000,
  storageKey: 'miSolarLastUserActivity'
} as const;

export const REFRESH_POLICY = {
  realtime: 5 * 60_000,
  day: 5 * 60_000,
  week: 60 * 60_000,
  month: 12 * 60 * 60_000,
  weather: 15 * 60_000,
  radiation: 15 * 60_000
} as const;
