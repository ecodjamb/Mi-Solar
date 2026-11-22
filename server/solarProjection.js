import { findSiteId, resolveDeviceReference, rest } from './archive.js';
import { ARRAYAN_CONFIGURATION_EFFECTIVE_FROM, configurationScaleForSample, automationSiteProfile } from './siteProfiles.js';
import { arrayanMeteorologicalProjection } from './arrayanMeteorologicalProjection.js';

const PUERTO_MONTT_REFERENCE_DAY = '2026-10-08';

const CONFIGURATION_V2_ROLLOUT_AT = '2026-10-02T03:36:00.000Z';
const ARRAYAN_METEOROLOGICAL_MODEL_EFFECTIVE_DATE = '2026-11-17';
const ARRAYAN_METEOROLOGICAL_MODEL_ROLLOUT_AT = '2026-11-17T17:06:35.000Z';
const OFFICIAL_FORECAST_REPAIRS = new Map([
  // El valor 20 kWh era una referencia manual, no un pronóstico. El corte se
  // corrige con la radiación Open-Meteo capturada a las 22:00 y el algoritmo
  // robusto vigente de El Arrayán, manteniendo intacto el registro original.
  ['96342509120972:2026-10-08', { forecastKwh: 17.08, radiationKwhM2: 4.89, lockedAt: '2026-10-08T01:00:00.000Z' }],
  // Puerto Montt mostraba 7,98 kWh como pronóstico oficial del 8 de octubre.
  // Se preserva el corte confirmado de las 22:00 del día anterior al corregir
  // la potencia instalada; la nueva calibración no puede reescribirlo durante
  // el día ni sustituirlo por el cálculo vivo.
  ['96322507118828:2026-10-08', { forecastKwh: 7.98, radiationKwhM2: 5.57, lockedAt: '2026-10-08T01:00:00.000Z' }]
]);

function chileDate(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

function chileTime(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

function chileClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function forecastRevisionDue(now = new Date()) {
  return chileClock(now).hour % 2 === 0;
}

export function forecastRevisionSlot(now = new Date()) {
  const clock = chileClock(now);
  return `${clock.date}T${String(clock.hour).padStart(2, '0')}`;
}

export function officialForecastRepair(deviceSn, targetDate, profile = null) {
  const direct = OFFICIAL_FORECAST_REPAIRS.get(`${String(deviceSn)}:${targetDate}`);
  if (direct) return direct;
  // Las rutas nuevas trabajan con referencias lógicas (site:N). Si la
  // resolución del número de serie falla transitoriamente, la reparación
  // confirmada sigue perteneciendo inequívocamente a El Arrayán.
  if (profile?.key === 'arrayan' && targetDate === '2026-10-08') {
    return OFFICIAL_FORECAST_REPAIRS.get(`96342509120972:${targetDate}`) || null;
  }
  if (profile?.key === 'puerto-montt' && targetDate === '2026-10-08') {
    return OFFICIAL_FORECAST_REPAIRS.get(`96322507118828:${targetDate}`) || null;
  }
  return null;
}

function minutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function forecastLockDue(now = new Date()) {
  return minutes(chileTime(now)) >= 22 * 60;
}

function addDays(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function forecastAttainmentCorrection(samples = []) {
  const ratios = samples
    .filter((item) => Number(item.coverageHours) >= 20 && Number(item.actualKwh) > 0.35 && Number(item.forecastKwh) >= 1)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-14)
    .map((item) => Math.max(0.2, Math.min(1.25, Number(item.actualKwh) / Number(item.forecastKwh))));
  if (ratios.length < 5) return { factor: 1, sampleDays: ratios.length };
  return { factor: Number(Math.max(0.55, Math.min(1.05, median(ratios))).toFixed(3)), sampleDays: ratios.length };
}

function circularDayDistance(a, b) {
  const day = (value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
  };
  const distance = Math.abs(day(a) - day(b));
  return Math.min(distance, 365 - distance);
}

function regression(samples, installedKwp, targetDate) {
  if (samples.length < 3) return { slope: installedKwp * 0.62, intercept: 0, rSquared: 0 };
  const weighted = samples.map((sample) => ({
    ...sample,
    weight: Math.exp(-Math.pow(circularDayDistance(targetDate, sample.date) / 62, 2))
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const meanX = weighted.reduce((sum, item) => sum + item.radiation * item.weight, 0) / totalWeight;
  const meanY = weighted.reduce((sum, item) => sum + item.actual * item.weight, 0) / totalWeight;
  const covariance = weighted.reduce((sum, item) => sum + item.weight * (item.radiation - meanX) * (item.actual - meanY), 0);
  const variance = weighted.reduce((sum, item) => sum + item.weight * Math.pow(item.radiation - meanX, 2), 0);
  const rawSlope = variance > 0.02 ? covariance / variance : median(weighted.map((item) => item.actual / item.radiation));
  const slope = Math.max(installedKwp * 0.18, Math.min(installedKwp * 1.05, rawSlope));
  const intercept = Math.max(-installedKwp * 0.8, Math.min(installedKwp * 0.8, meanY - slope * meanX));
  const residual = weighted.reduce((sum, item) => sum + item.weight * Math.pow(item.actual - (slope * item.radiation + intercept), 2), 0);
  const total = weighted.reduce((sum, item) => sum + item.weight * Math.pow(item.actual - meanY, 2), 0);
  return { slope, intercept, rSquared: total > 0.01 ? Math.max(0, Math.min(1, 1 - residual / total)) : 0 };
}

async function radiation(profile, forecastDays = 3) {
  if (profile.key === 'arrayan' && profile.configuration?.strings?.length) {
    return arrayanMeteorologicalProjection(profile, forecastDays);
  }
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(profile.latitude));
  url.searchParams.set('longitude', String(profile.longitude));
  url.searchParams.set('daily', 'shortwave_radiation_sum,weather_code');
  url.searchParams.set('past_days', '60');
  url.searchParams.set('forecast_days', String(Math.max(3, Math.min(16, forecastDays))));
  url.searchParams.set('timezone', 'America/Santiago');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.daily?.time || []).map((date, index) => ({
    date,
    radiation: Number(payload.daily?.shortwave_radiation_sum?.[index] || 0) / 3.6,
    weatherCode: Number(payload.daily?.weather_code?.[index] || 0)
  }));
}

async function forecastContext(profile, siteId, today, forecastDays = 16, deviceSn = '') {
  if (profile.key === 'arrayan') {
    const radiationDays = await radiation(profile, forecastDays);
    return {
      profile,
      today,
      byDate: new Map(radiationDays.map((item) => [item.date, item.radiation])),
      meteorologyByDate: new Map(radiationDays.map((item) => [item.date, item])),
      samples: [],
      accuracy: { factor: 1, sampleDays: 0 },
      puertoReference: null
    };
  }
  const start = addDays(today, -65);
  const [radiationDays, baseActualRows, baseLockedRows, puertoAnchorRows, puertoAnchorLocks] = await Promise.all([
    radiation(profile, forecastDays),
    rest(`energy_daily?site_id=eq.${siteId}&bucket_at=gte.${start}T00:00:00Z&bucket_at=lt.${today}T00:00:00Z&select=bucket_at,solar_w,load_w,samples,coverage_hours&order=bucket_at.asc&limit=100`),
    rest(`solar_forecast_locks?site_id=eq.${siteId}&forecast_date=gte.${start}&forecast_date=lt.${today}&select=forecast_date,forecast_kwh,radiation_kwh_m2&order=forecast_date.asc&limit=100`),
    profile.key === 'puerto-montt' ? rest(`energy_daily?site_id=eq.${siteId}&bucket_at=gte.${PUERTO_MONTT_REFERENCE_DAY}T00:00:00Z&bucket_at=lt.${addDays(PUERTO_MONTT_REFERENCE_DAY, 1)}T00:00:00Z&select=bucket_at,solar_w,load_w,samples,coverage_hours&limit=2`) : Promise.resolve([]),
    profile.key === 'puerto-montt' ? rest(`solar_forecast_locks?site_id=eq.${siteId}&forecast_date=eq.${PUERTO_MONTT_REFERENCE_DAY}&select=forecast_date,forecast_kwh,radiation_kwh_m2&limit=1`) : Promise.resolve([])
  ]);
  const actualRows = [...new Map([...(baseActualRows || []), ...(puertoAnchorRows || [])].map((row) => [String(row.bucket_at).slice(0, 10), row])).values()];
  const lockedRows = [...new Map([...(baseLockedRows || []), ...(puertoAnchorLocks || [])].map((row) => [row.forecast_date, row])).values()];
  const byDate = new Map(radiationDays.map((item) => [item.date, item.radiation]));
  for (const row of puertoAnchorLocks || []) {
    if (Number(row.radiation_kwh_m2) > 0) byDate.set(row.forecast_date, Number(row.radiation_kwh_m2));
  }
  const rawSamples = (actualRows || []).map((row) => {
    const date = String(row.bucket_at).slice(0, 10);
    const radiationValue = byDate.get(date) || 0;
    const observed = Number(row.solar_w || 0) * Number(row.coverage_hours || 0) / 1000;
    const loadKwh = Number(row.load_w || 0) * Number(row.coverage_hours || 0) / 1000;
    const actual = observed * configurationScaleForSample(deviceSn, date, today);
    return { date, radiation: radiationValue, actual, loadKwh, samples: Number(row.samples || 0), ratio: actual / (profile.installedKwp * (radiationValue || 1)) };
  }).filter((item) => item.samples >= 120 && item.actual > 0.35 && item.radiation > 0.5 && item.ratio > 0.12 && item.ratio < 1.35 && (profile.key !== 'arrayan' || (item.actual >= 5 && item.loadKwh >= 5)));
  const puertoReference = profile.key === 'puerto-montt' ? rawSamples.find((item) => item.date === PUERTO_MONTT_REFERENCE_DAY) : null;
  const modelSamples = puertoReference ? [puertoReference] : rawSamples;
  const center = median(modelSamples.map((item) => item.ratio));
  const mad = median(modelSamples.map((item) => Math.abs(item.ratio - center)));
  const filtered = modelSamples.filter((item) => Math.abs(item.ratio - center) <= Math.max(0.1, mad * 3));
  const actualByDate = new Map((actualRows || []).map((row) => [String(row.bucket_at).slice(0, 10), {
    actualKwh: Number(row.solar_w || 0) * Number(row.coverage_hours || 0) / 1000,
    coverageHours: Number(row.coverage_hours || 0)
  }]));
  const compatibleLocks = (lockedRows || []).filter((row) => !profile.configurationEffectiveFrom || row.forecast_date >= profile.configurationEffectiveFrom);
  const accuracy = profile.key === 'puerto-montt' ? { factor: 1, sampleDays: puertoReference ? 1 : 0 } : forecastAttainmentCorrection(compatibleLocks.map((row) => ({
    date: row.forecast_date,
    forecastKwh: Number(row.forecast_kwh || 0),
    ...(actualByDate.get(row.forecast_date) || {})
  })));
  return { profile, today, byDate, samples: puertoReference ? [puertoReference] : (filtered.length >= 3 ? filtered : modelSamples), accuracy, puertoReference };
}

function forecastFromContext(context, targetDate) {
  const { profile, today, byDate, samples, accuracy } = context;
  if (profile.key === 'arrayan') {
    const meteorology = context.meteorologyByDate?.get(targetDate);
    if (!meteorology || !(meteorology.forecastKwh >= 0)) return null;
    const forecastKwh = Number(meteorology.forecastKwh || 0);
    const legacyScale = profile.legacyConfiguration && targetDate <= profile.legacyComparisonUntil
      ? (profile.legacyConfiguration.installedKwp / profile.installedKwp) * (profile.legacyConfiguration.designFactor / profile.configuration.designFactor)
      : null;
    return {
      date: targetDate,
      forecastKwh: Number(forecastKwh.toFixed(2)),
      radiationKwhM2: Number(Number(meteorology.radiation || 0).toFixed(2)),
      rawTiltedRadiationKwhM2: Number(Number(meteorology.rawTiltedRadiationKwhM2 || 0).toFixed(2)),
      sampleDays: 0,
      // Estos tres campos se conservan en la tabla existente. En el modelo
      // físico representan factor de diseño, opacidad y dispersión meteorológica.
      slope: Number(Number(profile.configuration?.designFactor || 0.895).toFixed(3)),
      intercept: Number((Number(meteorology.cloudOpacityPct || 0) / 100).toFixed(3)),
      rSquared: Number((Math.min(100, Number(meteorology.modelSpreadPct || 0)) / 100).toFixed(3)),
      rawForecastKwh: Number(forecastKwh.toFixed(2)),
      clearEnergyKwh: Number(Number(meteorology.clearEnergyKwh || 0).toFixed(2)),
      accuracyFactor: 1,
      accuracySampleDays: 0,
      cloudOpacityPct: Number(Number(meteorology.cloudOpacityPct || 0).toFixed(1)),
      cloudTransmissionPct: Number(Number(meteorology.cloudTransmissionPct || 100).toFixed(1)),
      cloudCoverPct: Number(Number(meteorology.cloudCoverPct || 0).toFixed(1)),
      dominantCloudLayer: meteorology.dominantCloudLayer,
      modelSpreadPct: Number(Number(meteorology.modelSpreadPct || 0).toFixed(1)),
      precipitationMm: Number(Number(meteorology.precipitationMm || 0).toFixed(1)),
      weatherCode: Number(meteorology.weatherCode || 0),
      stringForecasts: meteorology.strings,
      configurationKey: profile.configurationKey || null,
      installedKwp: profile.installedKwp,
      configurationEffectiveFrom: profile.configurationEffectiveFrom || null,
      legacyForecastKwh: legacyScale == null ? null : Number((forecastKwh * legacyScale).toFixed(2)),
      legacyConfigurationKey: legacyScale == null ? null : profile.legacyConfiguration.key,
      site: profile,
      sourceLabel: 'Open-Meteo · consenso ECMWF/GFS/GEM + radiación inclinada y opacidad por capas',
      calibrationMethod: 'Modelo físico meteorológico · sin producción histórica ni ajuste en vivo',
      referenceDate: null,
      referenceRadiationKwhM2: null,
      referenceEnergyKwh: null,
      locked: false,
      lockedAt: null
    };
  }
  const globalCoefficients = context.puertoReference
    ? { slope: profile.installedKwp * Math.max(0.25, Math.min(1.35, context.puertoReference.ratio)), intercept: 0, rSquared: 1 }
    : regression(samples, profile.installedKwp, today);
  const localCoefficients = context.puertoReference ? globalCoefficients : regression(samples, profile.installedKwp, targetDate);
  const confidence = Math.min(0.82, 0.48 + samples.length / 55);
  const coefficients = samples.length < 5 ? globalCoefficients : {
    slope: globalCoefficients.slope * (1 - confidence) + localCoefficients.slope * confidence,
    intercept: globalCoefficients.intercept * (1 - confidence) + localCoefficients.intercept * confidence,
    rSquared: localCoefficients.rSquared
  };
  const targetRadiation = byDate.get(targetDate);
  if (!(targetRadiation > 0)) return null;
  const upper = Math.max(SEASON_UPPER[profile.key][season(targetDate)], targetRadiation * profile.installedKwp * 1.05);
  const rawForecastKwh = Math.max(0, Math.min(upper, coefficients.slope * targetRadiation + coefficients.intercept));
  const forecastKwh = rawForecastKwh * (accuracy?.factor || 1);
  const legacyScale = profile.legacyConfiguration && targetDate <= profile.legacyComparisonUntil
    ? (profile.legacyConfiguration.installedKwp / profile.installedKwp) * (profile.legacyConfiguration.designFactor / profile.configuration.designFactor)
    : null;
  return {
    date: targetDate,
    forecastKwh: Number(forecastKwh.toFixed(2)),
    radiationKwhM2: Number(targetRadiation.toFixed(2)),
    sampleDays: samples.length,
    slope: Number(coefficients.slope.toFixed(3)),
    intercept: Number(coefficients.intercept.toFixed(3)),
    rSquared: Number(coefficients.rSquared.toFixed(3)),
    rawForecastKwh: Number(rawForecastKwh.toFixed(2)),
    accuracyFactor: Number((accuracy?.factor || 1).toFixed(3)),
    accuracySampleDays: Number(accuracy?.sampleDays || 0),
    configurationKey: profile.configurationKey || null,
    installedKwp: profile.installedKwp,
    configurationEffectiveFrom: profile.configurationEffectiveFrom || null,
    legacyForecastKwh: legacyScale == null ? null : Number((forecastKwh * legacyScale).toFixed(2)),
    legacyConfigurationKey: legacyScale == null ? null : profile.legacyConfiguration.key,
    site: profile,
    sourceLabel: 'Open-Meteo · radiación de onda corta + histórico validado de Mi Solar',
    calibrationMethod: context.puertoReference ? 'Día patrón Puerto Montt · 08-10-2026' : 'Regresión estacional robusta · días completos sin anomalías',
    referenceDate: context.puertoReference?.date || null,
    referenceRadiationKwhM2: context.puertoReference?.radiation || null,
    referenceEnergyKwh: context.puertoReference?.actual || null,
    locked: false,
    lockedAt: null
  };
}

const SEASON_UPPER = {
  arrayan: { winter: 16.5, spring: 54, summer: 98, autumn: 49 },
  'puerto-montt': { winter: 24, spring: 36, summer: 48, autumn: 32 }
};

function season(date) {
  const month = Number(date.slice(5, 7));
  if (month === 12 || month <= 2) return 'summer';
  if (month <= 5) return 'autumn';
  if (month <= 8) return 'winter';
  return 'spring';
}

export function validLockForProfile(row, targetDate, profile) {
  if (!row) return false;
  if (profile?.configurationKey === 'arrayan-v2-10540' && targetDate >= ARRAYAN_CONFIGURATION_EFFECTIVE_FROM) {
    if (String(row.locked_at || '') < CONFIGURATION_V2_ROLLOUT_AT) return false;
  }
  if (profile?.key === 'arrayan' && targetDate >= ARRAYAN_METEOROLOGICAL_MODEL_EFFECTIVE_DATE) {
    const theoreticalMeteorology = Number(row.sample_days || 0) === 0
      && Number(row.slope || 0) >= 0.65
      && Number(row.slope || 0) <= 0.98;
    return String(row.locked_at || '') >= ARRAYAN_METEOROLOGICAL_MODEL_ROLLOUT_AT && theoreticalMeteorology;
  }
  return true;
}

function lockedForecast(row, profile) {
  const legacyScale = profile?.legacyConfiguration && row.forecast_date <= profile.legacyComparisonUntil
    ? (profile.legacyConfiguration.installedKwp / profile.installedKwp) * (profile.legacyConfiguration.designFactor / profile.configuration.designFactor)
    : null;
  const theoreticalMeteorology = profile?.key === 'arrayan'
    && Number(row.sample_days || 0) === 0
    && Number(row.slope || 0) >= 0.65
    && Number(row.slope || 0) <= 0.98;
  return {
    date: row.forecast_date,
    forecastKwh: Number(row.forecast_kwh),
    radiationKwhM2: Number(row.radiation_kwh_m2),
    sampleDays: Number(row.sample_days || 0),
    slope: Number(row.slope || 0),
    intercept: Number(row.intercept || 0),
    rSquared: Number(row.r_squared || 0),
    configurationKey: profile?.configurationKey || null,
    installedKwp: profile?.installedKwp || null,
    configurationEffectiveFrom: profile?.configurationEffectiveFrom || null,
    legacyForecastKwh: legacyScale == null ? null : Number((Number(row.forecast_kwh) * legacyScale).toFixed(2)),
    legacyConfigurationKey: legacyScale == null ? null : profile.legacyConfiguration.key,
    legacyComparisonUntil: profile?.legacyComparisonUntil || null,
    cloudOpacityPct: theoreticalMeteorology ? Number((Number(row.intercept || 0) * 100).toFixed(1)) : null,
    modelSpreadPct: theoreticalMeteorology ? Number((Number(row.r_squared || 0) * 100).toFixed(1)) : null,
    theoreticalPerformanceRatio: theoreticalMeteorology ? Number(row.slope || 0) : null,
    sourceLabel: theoreticalMeteorology
      ? 'Open-Meteo · consenso ECMWF/GFS/GEM + radiación inclinada y opacidad por capas'
      : 'Open-Meteo · radiación de onda corta + histórico validado de Mi Solar',
    calibrationMethod: profile?.key === 'puerto-montt'
      ? 'Día patrón Puerto Montt · 08-10-2026'
      : theoreticalMeteorology
        ? 'Modelo físico meteorológico · sin producción histórica ni ajuste en vivo'
        : 'Regresión estacional robusta · días completos sin anomalías',
    locked: true,
    lockedAt: row.locked_at
  };
}

async function readForecastLock(siteId, targetDate, profile) {
  const rows = await rest(`solar_forecast_locks?site_id=eq.${siteId}&forecast_date=eq.${targetDate}&select=*&limit=1`);
  const row = rows?.[0];
  if (!validLockForProfile(row, targetDate, profile)) return null;
  return lockedForecast(row, profile);
}

async function saveForecastLock(siteId, forecast, profile, lockedAt = new Date().toISOString()) {
  try {
    // Un corte oficial es inmutable: sólo se inserta. Usar upsert obligaba a
    // conceder UPDATE y hacía fallar incluso la primera escritura en PostgREST.
    await rest('solar_forecast_locks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        site_id: siteId,
        forecast_date: forecast.date,
        forecast_kwh: forecast.forecastKwh,
        radiation_kwh_m2: forecast.radiationKwhM2,
        sample_days: forecast.sampleDays,
        slope: forecast.slope,
        intercept: forecast.intercept,
        r_squared: forecast.rSquared,
        locked_at: lockedAt
      })
    });
  } catch (error) {
    // Dos ejecuciones pueden coincidir dentro del mismo minuto. El índice
    // único decide cuál creó el corte; nunca se modifica el ganador.
    if (Number(error?.status) !== 409) throw error;
  }
  return readForecastLock(siteId, forecast.date, profile);
}

export async function forecastForDate(deviceSn, targetDate, nowDate = new Date(), options = {}) {
  const today = chileDate(nowDate);
  if (!targetDate) targetDate = addDays(today, 1);
  const resolvedDeviceSn = await resolveDeviceReference(deviceSn) || String(deviceSn);
  const profile = automationSiteProfile(resolvedDeviceSn, targetDate);
  const siteId = await findSiteId(deviceSn);
  if (!siteId) throw new Error('La instalación todavía no existe en el respaldo permanente.');
  if (targetDate && !options.ignoreLock) {
    const existingLock = await readForecastLock(siteId, targetDate, profile);
    if (existingLock) return { ...existingLock, site: profile };
  }
  if (targetDate < today || targetDate > addDays(today, 15)) throw new Error('La fecha de proyección automática no es válida.');
  const result = forecastFromContext(await forecastContext(profile, siteId, today, 16, resolvedDeviceSn), targetDate);
  if (!result) throw new Error('Open-Meteo todavía no entregó la radiación solicitada.');
  const shouldLock = !options.ignoreLock && targetDate === addDays(today, 1) && forecastLockDue(nowDate);
  if (!shouldLock) return result;
  const locked = await saveForecastLock(siteId, result, profile);
  return locked ? { ...locked, site: profile } : result;
}

/** Lee únicamente el corte oficial ya guardado, sin consultar clima ni proveedor. */
export async function storedForecastForDate(deviceSn, targetDate, nowDate = new Date()) {
  const resolvedDeviceSn = await resolveDeviceReference(deviceSn) || String(deviceSn);
  const profile = automationSiteProfile(resolvedDeviceSn, targetDate || chileDate(nowDate));
  const siteId = await findSiteId(deviceSn);
  if (!siteId) return null;
  return readForecastLock(siteId, targetDate || chileDate(nowDate), profile);
}

export async function forecastRange(deviceSn, startDate, endDate, nowDate = new Date()) {
  const siteId = await findSiteId(deviceSn);
  if (!siteId) return [];
  const today = chileDate(nowDate);
  const lastForecastDate = addDays(today, 15);
  const effectiveStart = startDate < today ? today : startDate;
  const effectiveEnd = endDate > lastForecastDate ? lastForecastDate : endDate;
  if (effectiveStart > effectiveEnd) return [];
  const dates = [];
  for (let date = effectiveStart; date <= effectiveEnd; date = addDays(date, 1)) dates.push(date);
  const resolvedDeviceSn = await resolveDeviceReference(deviceSn) || String(deviceSn);
  const profile = automationSiteProfile(resolvedDeviceSn, effectiveStart);
  const [context, locks] = await Promise.all([
    forecastContext(profile, siteId, today, 16, resolvedDeviceSn).catch(() => null),
    rest(`solar_forecast_locks?site_id=eq.${siteId}&forecast_date=gte.${effectiveStart}&forecast_date=lte.${effectiveEnd}&select=*&order=forecast_date.asc`) || []
  ]);
  const lockByDate = new Map(locks.filter((row) => validLockForProfile(row, row.forecast_date, automationSiteProfile(resolvedDeviceSn, row.forecast_date))).map((row) => {
    const rowProfile = automationSiteProfile(resolvedDeviceSn, row.forecast_date);
    return [row.forecast_date, { ...lockedForecast(row, rowProfile), site: rowProfile }];
  }));
  return dates.map((date) => lockByDate.get(date) || (context ? forecastFromContext(context, date) : null)).filter(Boolean);
}

async function siteIdForDevice(deviceSn) {
  return findSiteId(deviceSn);
}

export async function listForecastRevisions(deviceSn, dates) {
  const siteId = await siteIdForDevice(deviceSn);
  if (!siteId || !dates?.length) return {};
  const resolvedDeviceSn = await resolveDeviceReference(deviceSn) || String(deviceSn);
  const [rows, locks] = await Promise.all([
    rest(`solar_forecast_revisions?site_id=eq.${siteId}&forecast_date=in.(${dates.join(',')})&select=forecast_date,forecast_kwh,radiation_kwh_m2,observed_at&order=observed_at.asc&limit=192`) || [],
    rest(`solar_forecast_locks?site_id=eq.${siteId}&forecast_date=in.(${dates.join(',')})&select=forecast_date,locked_at`) || []
  ]);
  const lockedAtByDate = new Map((locks || []).map((row) => [row.forecast_date, Date.parse(row.locked_at)]));
  return Object.fromEntries(dates.map((date) => {
    const profile = automationSiteProfile(resolvedDeviceSn, date);
    const legacyScale = profile.legacyConfiguration && date <= profile.legacyComparisonUntil
      ? (profile.legacyConfiguration.installedKwp / profile.installedKwp) * (profile.legacyConfiguration.designFactor / profile.configuration.designFactor)
      : null;
    const lockedAt = lockedAtByDate.get(date) || 0;
    return [date, rows.filter((row) => row.forecast_date === date && Date.parse(row.observed_at) >= lockedAt).map((row) => ({
      date: row.forecast_date,
      forecastKwh: Number(row.forecast_kwh),
      legacyForecastKwh: legacyScale == null ? null : Number((Number(row.forecast_kwh) * legacyScale).toFixed(2)),
      radiationKwhM2: Number(row.radiation_kwh_m2),
      observedAt: row.observed_at
    }))];
  }));
}

export async function recordForecastRevision(deviceSn, targetDate, nowDate = new Date(), options = {}) {
  if (!forecastRevisionDue(nowDate)) return { status: 'outside-two-hour-slot', targetDate };
  const siteId = await siteIdForDevice(deviceSn);
  const resolvedDeviceSn = await resolveDeviceReference(deviceSn) || String(deviceSn);
  const official = siteId ? await readForecastLock(siteId, targetDate, automationSiteProfile(resolvedDeviceSn, targetDate)) : null;
  if (!siteId || (!official && !options.allowBeforeLock)) return { status: 'not-locked', targetDate };
  const latestRows = await rest(`solar_forecast_revisions?site_id=eq.${siteId}&forecast_date=eq.${targetDate}&select=forecast_kwh,radiation_kwh_m2,observed_at&order=observed_at.desc&limit=1`);
  const latest = latestRows?.[0];
  if (latest && forecastRevisionSlot(new Date(latest.observed_at)) === forecastRevisionSlot(nowDate)) return { status: 'two-hour-slot-already-recorded', targetDate };
  const live = await forecastForDate(deviceSn, targetDate, nowDate, { ignoreLock: true });
  await rest('solar_forecast_revisions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    site_id: siteId,
    forecast_date: targetDate,
    forecast_kwh: live.forecastKwh,
    radiation_kwh_m2: live.radiationKwhM2,
    observed_at: nowDate.toISOString()
  }) });
  return { status: official ? 'recorded-two-hour-followup' : 'recorded-prelock-candidate', targetDate, forecastKwh: live.forecastKwh, radiationKwhM2: live.radiationKwhM2 };
}

export async function reconcileOfficialForecast(deviceSn, nowDate = new Date()) {
  const today = chileDate(nowDate);
  const resolvedDeviceSn = await resolveDeviceReference(deviceSn) || String(deviceSn);
  const siteId = await siteIdForDevice(deviceSn);
  if (!siteId) return { status: 'site-missing', today };
  const profile = automationSiteProfile(resolvedDeviceSn, today);
  const repair = officialForecastRepair(resolvedDeviceSn, today, profile);
  const current = await readForecastLock(siteId, today, profile);
  if (current && !repair) return { status: 'already-locked', today, projection: current };

  // La versión 8.77.0 cambió por completo la metodología de El Arrayán. Un
  // corte legado no se elimina: queda en la base para auditoría, pero deja de
  // gobernar la pantalla. La API entrega el cálculo meteorológico teórico vivo
  // hasta que exista un nuevo corte oficial creado por esta metodología.
  if (profile.key === 'arrayan' && today >= ARRAYAN_METEOROLOGICAL_MODEL_EFFECTIVE_DATE && !current) {
    const projection = await forecastForDate(deviceSn, today, nowDate, { ignoreLock: true });
    return { status: 'legacy-meteorological-lock-bypassed', today, projection };
  }

  if (current && repair) {
    const legacyScale = profile.legacyConfiguration && today <= profile.legacyComparisonUntil
      ? (profile.legacyConfiguration.installedKwp / profile.installedKwp) * (profile.legacyConfiguration.designFactor / profile.configuration.designFactor)
      : null;
    const projection = {
      ...current,
      forecastKwh: Number(repair.forecastKwh),
      radiationKwhM2: Number(repair.radiationKwhM2),
      legacyForecastKwh: legacyScale == null ? null : Number((Number(repair.forecastKwh) * legacyScale).toFixed(2)),
      locked: true,
      lockedAt: repair.lockedAt
    };
    return {
      status: Number(current.forecastKwh) === Number(repair.forecastKwh)
        ? 'already-locked-confirmed'
        : 'confirmed-cutoff-overrides-invalid-lock',
      today,
      projection
    };
  }

  const candidates = await rest(`solar_forecast_revisions?site_id=eq.${siteId}&forecast_date=eq.${today}&select=forecast_kwh,radiation_kwh_m2,observed_at&order=observed_at.desc&limit=48`) || [];
  const candidate = candidates.find((row) => chileDate(new Date(row.observed_at)) < today) || null;
  if (!repair && !candidate) return { status: 'missing-without-candidate', today };

  const radiationKwhM2 = Number(repair?.radiationKwhM2 ?? candidate.radiation_kwh_m2);
  const forecastKwh = Number(repair?.forecastKwh ?? candidate.forecast_kwh);
  const lockedAt = repair?.lockedAt || candidate.observed_at;
  const recovered = {
    date: today,
    forecastKwh,
    radiationKwhM2,
    sampleDays: 0,
    slope: radiationKwhM2 > 0 ? Number((forecastKwh / radiationKwhM2).toFixed(3)) : 0,
    intercept: 0,
    rSquared: 0,
    configurationKey: profile.configurationKey || null,
    installedKwp: profile.installedKwp,
    configurationEffectiveFrom: profile.configurationEffectiveFrom || null,
    legacyForecastKwh: profile.legacyConfiguration && today <= profile.legacyComparisonUntil
      ? Number((forecastKwh * (profile.legacyConfiguration.installedKwp / profile.installedKwp) * (profile.legacyConfiguration.designFactor / profile.configuration.designFactor)).toFixed(2))
      : null,
    site: profile,
    locked: true,
    lockedAt
  };
  let saved = null;
  let persistenceError = null;
  try { saved = await saveForecastLock(siteId, recovered, profile, lockedAt); }
  catch (error) { persistenceError = String(error?.message || error).slice(0, 180); }
  return { status: repair ? 'repaired-confirmed-cutoff' : 'recovered-from-prelock-candidate', today, projection: saved || recovered, persistenceError };
}

export async function forecastTomorrow(deviceSn) {
  return forecastForDate(deviceSn, addDays(chileDate(), 1));
}

export async function lockTomorrowForecasts(nowDate = new Date()) {
  const today = chileDate(nowDate);
  const time = chileTime(nowDate);
  const sites = await rest('solar_sites?select=device_sn&order=device_sn.asc');
  const targetDate = addDays(today, 1);
  const results = [];

  if (!forecastLockDue(nowDate)) {
    for (const site of sites || []) {
      try {
        const revisions = await Promise.all([
          recordForecastRevision(site.device_sn, today, nowDate),
          recordForecastRevision(site.device_sn, targetDate, nowDate, { allowBeforeLock: true })
        ]);
        results.push({ deviceSn: site.device_sn, status: 'before-lock-time', revisions });
      } catch (error) {
        results.push({ deviceSn: site.device_sn, status: 'failed', error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { status: 'before-lock-time', chile: { date: today, time }, targetDate, results };
  }

  for (const site of sites || []) {
    try {
      const projection = await forecastForDate(site.device_sn, targetDate, nowDate);
      const revisions = await Promise.all([
        recordForecastRevision(site.device_sn, today, nowDate),
        recordForecastRevision(site.device_sn, targetDate, nowDate)
      ]);
      results.push({ deviceSn: site.device_sn, status: projection.locked ? 'locked' : 'live', projection, revisions });
    } catch (error) {
      results.push({ deviceSn: site.device_sn, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { status: 'checked', chile: { date: today, time }, targetDate, results };
}
