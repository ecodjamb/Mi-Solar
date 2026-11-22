export const ARRAYAN_INVERTER = {
  model: 'Axpert VM II Premium Plus 12K 48V',
  providerModel: 'VII PREMIUM PLUS Series',
  firmwareMain: '69.02',
  firmwareSecondary: '02.33',
  loggerFirmware: 'FC41DAAR11A05_RYY_BETA0617.bin_202506172040',
  technicalProfileCapturedAt: '2026-11-04',
  ratedPowerW: 12_000,
  ratedPowerVa: 12_000,
  surgePowerVa: 24_000,
  peakEfficiencyPct: 93,
  batteryVoltageV: 48,
  mpptCount: 2,
  maxPvPowerW: 15_000,
  maxPvPowerPerMpptW: 7_500,
  maxPvOpenCircuitVoltageV: 500,
  mpptVoltageMinV: 90,
  mpptVoltageMaxV: 450,
  maxPvInputCurrentPerMpptA: 27,
  maximumChargeCurrentA: 180
} as const;

export const ARRAYAN_BATTERY_BANK = {
  brand: 'Pylontech',
  model: 'UF5000',
  units: 4,
  nominalVoltageV: 51.2,
  nominalKwhPerUnit: 5.12,
  usableKwhPerUnit: 4.864,
  depthOfDischargePct: 95,
  recommendedCurrentPerUnitA: 100,
  maximumParallelUnits: 20,
  nominalKwh: 20.48,
  usableKwh: 19.456
} as const;

export const ARRAYAN_PANEL_MODELS = {
  ulica: { model: 'UL-620M-132DDGN', pmaxW: 620, vmpV: 40.90, impA: 15.16, vocV: 49.08, iscA: 16.08, vocTemperatureCoefficientPctC: -0.25 },
  osda: { model: 'ODA620-33V-MHDRz', pmaxW: 620, vmpV: 41.46, impA: 14.96, vocV: 48.78, iscA: 15.89, vocTemperatureCoefficientPctC: -0.25 }
} as const;

export const ARRAYAN_STRING_DESIGN = [
  { key: 'pv1', label: 'String 1 · techo viejo', ulica: 4, osda: 5, nominalPowerW: 5_580, orientation: '290° oeste', tiltDeg: 38 },
  { key: 'pv2', label: 'String 2 · techo motos', ulica: 0, osda: 8, nominalPowerW: 4_960, orientation: '348° norte', tiltDeg: 20 }
] as const;

export const ARRAYAN_VOC_TEMPERATURES_C = [-20, -10, -2, 10, 20] as const;

function stringValue(string: typeof ARRAYAN_STRING_DESIGN[number], field: 'vocV' | 'vmpV') {
  return string.ulica * ARRAYAN_PANEL_MODELS.ulica[field] + string.osda * ARRAYAN_PANEL_MODELS.osda[field];
}

export function arrayanStringElectrical() {
  return ARRAYAN_STRING_DESIGN.map((string) => {
    const voc25V = stringValue(string, 'vocV');
    const vmp25V = stringValue(string, 'vmpV');
    const operatingCurrentA = Math.min(
      string.ulica ? ARRAYAN_PANEL_MODELS.ulica.impA : Number.POSITIVE_INFINITY,
      string.osda ? ARRAYAN_PANEL_MODELS.osda.impA : Number.POSITIVE_INFINITY
    );
    return {
      ...string,
      voc25V,
      vmp25V,
      operatingCurrentA,
      estimatedOperatingPowerW: vmp25V * operatingCurrentA,
      pvPowerUsePct: string.nominalPowerW / ARRAYAN_INVERTER.maxPvPowerPerMpptW * 100,
      currentUsePct: operatingCurrentA / ARRAYAN_INVERTER.maxPvInputCurrentPerMpptA * 100,
      temperatures: ARRAYAN_VOC_TEMPERATURES_C.map((temperatureC) => {
        const factor = 1 + Math.abs(ARRAYAN_PANEL_MODELS.osda.vocTemperatureCoefficientPctC / 100) * (25 - temperatureC);
        const vocV = voc25V * factor;
        const toleranceHighVocV = vocV * 1.03;
        return {
          temperatureC,
          vocV,
          marginV: ARRAYAN_INVERTER.maxPvOpenCircuitVoltageV - vocV,
          toleranceHighVocV,
          toleranceMarginV: ARRAYAN_INVERTER.maxPvOpenCircuitVoltageV - toleranceHighVocV
        };
      })
    };
  });
}
