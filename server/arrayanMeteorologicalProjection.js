// ECMWF IFS usa aquí su malla nativa de 9 km. GFS y GEM aportan contraste
// independiente para cuantificar la incertidumbre meteorológica del valle.
const WEATHER_MODELS = ['ecmwf_ifs', 'gfs_global', 'gem_seamless'];
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const weatherCache = new Map();

const HOURLY_FIELDS = [
  'global_tilted_irradiance', 'shortwave_radiation', 'terrestrial_radiation',
  'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
  'temperature_2m', 'wind_speed_10m', 'precipitation', 'weather_code'
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function finiteValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function modelValues(payload, field, index) {
  const suffixed = WEATHER_MODELS
    .map((model) => finiteValue(payload.hourly?.[`${field}_${model}`]?.[index]))
    .filter((value) => value !== null);
  if (suffixed.length) return suffixed;
  const fallback = finiteValue(payload.hourly?.[field]?.[index]);
  return fallback === null ? [] : [fallback];
}

export function toOpenMeteoAzimuth(azimuthFromNorth) {
  const normalized = ((Number(azimuthFromNorth) - 180 + 540) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
}

/**
 * Opacidad óptica teórica. Las nubes bajas pesan más porque suelen ser más
 * densas; las altas dejan pasar una fracción mayor de radiación difusa.
 * Las capas se combinan por solapamiento, no por suma, para no superar 100%.
 */
export function cloudOpticalOpacity({ total = 0, low = 0, mid = 0, high = 0, weatherCode = 0, precipitation = 0 } = {}) {
  const lowOpacity = clamp(low / 100, 0, 1) * 0.92;
  const midOpacity = clamp(mid / 100, 0, 1) * 0.68;
  const highOpacity = clamp(high / 100, 0, 1) * 0.38;
  const layered = 1 - (1 - lowOpacity) * (1 - midOpacity) * (1 - highOpacity);
  let opacity = Math.max(layered, clamp(total / 100, 0, 1) * 0.62);
  const code = Number(weatherCode) || 0;
  if (code === 45 || code === 48) opacity = Math.max(opacity, 0.82);
  else if (code >= 95) opacity = Math.max(opacity, 0.90);
  else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) opacity = Math.max(opacity, 0.76);
  else if (code >= 51 && code <= 57) opacity = Math.max(opacity, 0.58);
  if (Number(precipitation) >= 1) opacity = Math.max(opacity, 0.84);
  else if (Number(precipitation) >= 0.2) opacity = Math.max(opacity, 0.68);
  return clamp(opacity, 0, 0.94);
}

export function cloudOpticalTransmission(opacity) {
  return clamp(1 - 0.82 * clamp(opacity, 0, 1), 0.16, 1);
}

/**
 * Producción horaria puramente física: no usa generación histórica ni la
 * lectura viva. GTI aporta geometría y meteorología; la envolvente de opacidad
 * evita aceptar una GTI optimista cuando las capas nubosas dicen lo contrario.
 */
export function theoreticalPvHour({
  gti = 0, ghi = 0, terrestrial = 0, totalCloud = 0, lowCloud = 0, midCloud = 0, highCloud = 0,
  temperature = 20, windSpeed = 0, precipitation = 0, weatherCode = 0,
  installedKwp = 0, designFactor = 0.895
} = {}) {
  const modelGti = Math.max(0, Number(gti) || 0);
  const extraterrestrial = Math.max(0, Number(terrestrial) || 0);
  if (!(modelGti > 0) || !(installedKwp > 0)) {
    return { energyKwh: 0, effectiveIrradiance: 0, opacity: 0, transmission: 1, temperatureFactor: 1 };
  }
  const opacity = cloudOpticalOpacity({ total: totalCloud, low: lowCloud, mid: midCloud, high: highCloud, weatherCode, precipitation });
  const transmission = cloudOpticalTransmission(opacity);
  const orientationRatio = clamp(modelGti / Math.max(1, Number(ghi) || modelGti), 0.35, 1.85);
  const clearPlaneIrradiance = extraterrestrial > 0 ? extraterrestrial * 0.76 * orientationRatio : modelGti;
  const opacityCap = extraterrestrial > 0 ? clearPlaneIrradiance * transmission : modelGti;
  const effectiveIrradiance = Math.max(0, Math.min(modelGti, opacityCap));
  const windCooling = Math.min(8, Math.max(0, Number(windSpeed) || 0) * 0.18);
  const cellTemperature = Number(temperature || 20) + effectiveIrradiance * 0.025 - windCooling;
  const temperatureFactor = clamp(1 - 0.0035 * (cellTemperature - 25), 0.82, 1.08);
  const energyKwh = effectiveIrradiance / 1000 * Number(installedKwp) * clamp(designFactor, 0.65, 0.98) * temperatureFactor;
  return { energyKwh, effectiveIrradiance, opacity, transmission, temperatureFactor };
}

function dominantLayer(weights) {
  const ordered = Object.entries(weights).sort((left, right) => right[1] - left[1]);
  if (!ordered[0] || ordered[0][1] <= 0) return 'sin nubosidad dominante';
  return ordered[0][0] === 'low' ? 'nubes bajas' : ordered[0][0] === 'mid' ? 'nubes medias' : 'nubes altas';
}

async function fetchStringProjection(profile, string, forecastDays) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(profile.latitude));
  url.searchParams.set('longitude', String(profile.longitude));
  url.searchParams.set('hourly', HOURLY_FIELDS.join(','));
  url.searchParams.set('models', WEATHER_MODELS.join(','));
  url.searchParams.set('tilt', String(string.tiltDeg));
  url.searchParams.set('azimuth', String(toOpenMeteoAzimuth(string.azimuthDeg)));
  url.searchParams.set('forecast_days', String(Math.max(3, Math.min(16, forecastDays))));
  url.searchParams.set('timezone', 'America/Santiago');
  url.searchParams.set('cell_selection', 'land');
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(15000) : undefined
  });
  if (!response.ok) throw new Error(`Open-Meteo multi-modelo HTTP ${response.status}`);
  const payload = await response.json();
  const days = new Map();
  for (let index = 0; index < (payload.hourly?.time || []).length; index += 1) {
    const date = String(payload.hourly.time[index]).slice(0, 10);
    const gtiValues = modelValues(payload, 'global_tilted_irradiance', index);
    const forecastGti = median(gtiValues);
    const forecastGhi = median(modelValues(payload, 'shortwave_radiation', index));
    const ghi = forecastGhi;
    const gti = forecastGti;
    const terrestrial = median(modelValues(payload, 'terrestrial_radiation', index));
    const totalCloud = median(modelValues(payload, 'cloud_cover', index));
    const lowCloud = median(modelValues(payload, 'cloud_cover_low', index));
    const midCloud = median(modelValues(payload, 'cloud_cover_mid', index));
    const highCloud = median(modelValues(payload, 'cloud_cover_high', index));
    const temperature = median(modelValues(payload, 'temperature_2m', index));
    const windSpeed = median(modelValues(payload, 'wind_speed_10m', index));
    const precipitation = median(modelValues(payload, 'precipitation', index));
    const weatherCode = Math.round(median(modelValues(payload, 'weather_code', index)));
    const physical = theoreticalPvHour({
      gti, ghi, terrestrial, totalCloud, lowCloud, midCloud, highCloud, temperature, windSpeed,
      precipitation, weatherCode, installedKwp: string.installedKwp, designFactor: profile.configuration?.designFactor || 0.895
    });
    const day = days.get(date) || {
      date, energyKwh: 0, gtiKwhM2: 0, effectiveGtiKwhM2: 0, clearEnergyKwh: 0,
      opacityWeighted: 0, transmissionWeighted: 0, cloudWeighted: 0, solarWeight: 0,
      precipitationMm: 0, weatherCode: 0, layerWeights: { low: 0, mid: 0, high: 0 }, modelTotals: new Map()
    };
    const solarWeight = Math.max(0, terrestrial, gti);
    day.energyKwh += physical.energyKwh;
    day.gtiKwhM2 += gti / 1000;
    day.effectiveGtiKwhM2 += physical.effectiveIrradiance / 1000;
    day.clearEnergyKwh += gti / 1000 * Number(string.installedKwp) * Number(profile.configuration?.designFactor || 0.895);
    day.opacityWeighted += physical.opacity * solarWeight;
    day.transmissionWeighted += physical.transmission * solarWeight;
    day.cloudWeighted += totalCloud * solarWeight;
    day.solarWeight += solarWeight;
    day.precipitationMm += Math.max(0, precipitation);
    day.weatherCode = Math.max(day.weatherCode, weatherCode);
    day.layerWeights.low += lowCloud * 0.92 * solarWeight;
    day.layerWeights.mid += midCloud * 0.68 * solarWeight;
    day.layerWeights.high += highCloud * 0.38 * solarWeight;
    WEATHER_MODELS.forEach((model) => {
      const value = finiteValue(payload.hourly?.[`global_tilted_irradiance_${model}`]?.[index]);
      if (value !== null) day.modelTotals.set(model, (day.modelTotals.get(model) || 0) + Math.max(0, value) / 1000);
    });
    days.set(date, day);
  }
  return new Map([...days.entries()].map(([date, day]) => {
    const modelTotals = [...day.modelTotals.values()].filter((value) => value > 0);
    const modelMedian = median(modelTotals);
    const modelSpreadPct = modelTotals.length > 1 && modelMedian > 0
      ? (Math.max(...modelTotals) - Math.min(...modelTotals)) / modelMedian * 100
      : 0;
    return [date, {
      date,
      stringKey: string.key,
      installedKwp: string.installedKwp,
      forecastKwh: day.energyKwh,
      clearEnergyKwh: day.clearEnergyKwh,
      gtiKwhM2: day.gtiKwhM2,
      effectiveGtiKwhM2: day.effectiveGtiKwhM2,
      cloudOpacityPct: day.solarWeight > 0 ? day.opacityWeighted / day.solarWeight * 100 : 0,
      cloudTransmissionPct: day.solarWeight > 0 ? day.transmissionWeighted / day.solarWeight * 100 : 100,
      cloudCoverPct: day.solarWeight > 0 ? day.cloudWeighted / day.solarWeight : 0,
      dominantCloudLayer: dominantLayer(day.layerWeights),
      precipitationMm: day.precipitationMm,
      weatherCode: day.weatherCode,
      modelSpreadPct
    }];
  }));
}

export async function arrayanMeteorologicalProjection(profile, forecastDays = 16) {
  const configuration = profile.configuration;
  if (!configuration?.strings?.length) throw new Error('El Arrayán no tiene strings configurados para la proyección meteorológica.');
  const cacheKey = `${profile.latitude}:${profile.longitude}:${configuration.key}:${forecastDays}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < WEATHER_CACHE_TTL_MS) return cached.value;
  const stringDays = await Promise.all(configuration.strings.map((string) => fetchStringProjection(profile, string, forecastDays)));
  const dates = [...new Set(stringDays.flatMap((map) => [...map.keys()]))].sort();
  const result = dates.map((date) => {
    const strings = stringDays.map((map) => map.get(date)).filter(Boolean);
    const totalKwp = strings.reduce((sum, item) => sum + Number(item.installedKwp || 0), 0) || profile.installedKwp;
    const weighted = (field) => strings.reduce((sum, item) => sum + Number(item[field] || 0) * Number(item.installedKwp || 0), 0) / totalKwp;
    return {
      date,
      radiation: weighted('effectiveGtiKwhM2'),
      rawTiltedRadiationKwhM2: weighted('gtiKwhM2'),
      forecastKwh: strings.reduce((sum, item) => sum + Number(item.forecastKwh || 0), 0),
      clearEnergyKwh: strings.reduce((sum, item) => sum + Number(item.clearEnergyKwh || 0), 0),
      cloudOpacityPct: weighted('cloudOpacityPct'),
      cloudTransmissionPct: weighted('cloudTransmissionPct'),
      cloudCoverPct: weighted('cloudCoverPct'),
      modelSpreadPct: weighted('modelSpreadPct'),
      precipitationMm: weighted('precipitationMm'),
      weatherCode: Math.max(0, ...strings.map((item) => Number(item.weatherCode || 0))),
      dominantCloudLayer: strings.sort((left, right) => right.cloudOpacityPct - left.cloudOpacityPct)[0]?.dominantCloudLayer || 'sin nubosidad dominante',
      strings
    };
  });
  weatherCache.set(cacheKey, { createdAt: Date.now(), value: result });
  return result;
}

export const ARRAYAN_METEOROLOGICAL_MODELS = [...WEATHER_MODELS];
