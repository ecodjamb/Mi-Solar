export const ARRAYAN_CONFIGURATION_EFFECTIVE_FROM = '2026-10-01';
export const ARRAYAN_LEGACY_COMPARISON_UNTIL = '2027-09-30';
export const PUERTO_MONTT_CONFIGURATION_EFFECTIVE_FROM = '2026-09-18';

export const ARRAYAN_EQUIPMENT_CONFIGURATIONS = [
  {
    key: 'arrayan-v1-8680',
    label: 'Configuración anterior',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-09-30',
    comparisonUntil: ARRAYAN_LEGACY_COMPARISON_UNTIL,
    installedKwp: 8.68,
    panelCount: 14,
    designFactor: 0.86,
    strings: [
      { key: 'legacy', label: 'Arreglo anterior', panelCount: 14, installedKwp: 8.68, orientation: 'Norponiente', azimuthDeg: null, tiltDeg: null }
    ]
  },
  {
    key: 'arrayan-v2-10540',
    label: 'Configuración vigente',
    effectiveFrom: ARRAYAN_CONFIGURATION_EFFECTIVE_FROM,
    effectiveTo: null,
    comparisonUntil: null,
    installedKwp: 10.54,
    panelCount: 17,
    // Promedio ponderado de los dos arreglos. No reemplaza la calibración real:
    // sólo permite partir con una estimación razonable mientras se acumulan días.
    designFactor: 0.895,
    strings: [
      { key: 'pv1', label: 'String 1 · techo viejo', panelCount: 9, installedKwp: 5.58, orientation: '290° oeste', azimuthDeg: 290, tiltDeg: 38, composition: '4 Ulica Solar + 5 OSDA Solar' },
      { key: 'pv2', label: 'String 2 · techo motos', panelCount: 8, installedKwp: 4.96, orientation: '348° norte', azimuthDeg: 348, tiltDeg: 20, composition: '8 OSDA Solar' }
    ]
  }
];

export const PUERTO_MONTT_EQUIPMENT_CONFIGURATIONS = [
  {
    key: 'puerto-montt-v1-1845',
    label: 'Configuración anterior',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-09-17',
    comparisonUntil: null,
    installedKwp: 1.845,
    panelCount: 3,
    designFactor: 0.88,
    strings: [
      { key: 'pv1', label: 'String único', panelCount: 3, installedKwp: 1.845, orientation: 'Sin cambio', azimuthDeg: null, tiltDeg: null, composition: '3 JA Solar de 615 W en serie' }
    ]
  },
  {
    key: 'puerto-montt-v2-3690',
    label: 'Configuración vigente',
    effectiveFrom: PUERTO_MONTT_CONFIGURATION_EFFECTIVE_FROM,
    effectiveTo: null,
    comparisonUntil: null,
    installedKwp: 3.69,
    panelCount: 6,
    designFactor: 0.88,
    strings: [
      { key: 'pv1', label: 'String único', panelCount: 6, installedKwp: 3.69, orientation: 'Sin cambio', azimuthDeg: null, tiltDeg: null, composition: '6 paneles JA Solar de 615 W en serie' }
    ]
  }
];

const PROFILES = {
  '96342509120972': { key: 'arrayan', label: 'El Arrayán', latitude: -33.3633868, longitude: -70.4935291 },
  '96322507118828': { key: 'puerto-montt', label: 'Puerto Montt', latitude: -41.573491, longitude: -72.716358, installedKwp: 3.69, configurationKey: 'puerto-montt-v2-3690' }
};

function currentChileDate(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

export function siteConfigurationForDate(deviceSn, date = currentChileDate()) {
  const reference = String(deviceSn);
  if (reference === '96342509120972') return date >= ARRAYAN_CONFIGURATION_EFFECTIVE_FROM ? ARRAYAN_EQUIPMENT_CONFIGURATIONS[1] : ARRAYAN_EQUIPMENT_CONFIGURATIONS[0];
  if (reference === '96322507118828') return date >= PUERTO_MONTT_CONFIGURATION_EFFECTIVE_FROM ? PUERTO_MONTT_EQUIPMENT_CONFIGURATIONS[1] : PUERTO_MONTT_EQUIPMENT_CONFIGURATIONS[0];
  return null;
}

export function configurationScaleForSample(deviceSn, sampleDate, targetDate = currentChileDate()) {
  const source = siteConfigurationForDate(deviceSn, sampleDate);
  const target = siteConfigurationForDate(deviceSn, targetDate);
  if (!source || !target) return 1;
  return (target.installedKwp / source.installedKwp) * (target.designFactor / source.designFactor);
}

export function automationSiteProfile(deviceSn, targetDate = currentChileDate()) {
  const reference = String(deviceSn);
  const base = PROFILES[reference] || { key: 'arrayan', label: reference, latitude: -33.3633868, longitude: -70.4935291, installedKwp: 10.54, configurationKey: 'arrayan-v2-10540' };
  const configuration = siteConfigurationForDate(reference, targetDate);
  if (!configuration) return base;
  const isArrayan = reference === '96342509120972';
  return {
    ...base,
    installedKwp: configuration.installedKwp,
    configurationKey: configuration.key,
    configurationEffectiveFrom: configuration.effectiveFrom,
    configuration: configuration,
    legacyConfiguration: isArrayan ? ARRAYAN_EQUIPMENT_CONFIGURATIONS[0] : null,
    legacyComparisonUntil: isArrayan ? ARRAYAN_LEGACY_COMPARISON_UNTIL : null
  };
}
