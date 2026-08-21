export const NORMALIZER_VERSION = '1.0.0';

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const read = (row, keys) => {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return number(row[key]);
  return null;
};

function dateInTimezone(raw, timeZone) {
  const match = String(raw).trim().replace(/\//g, '-').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const wallClockUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const zoneParts = Object.fromEntries(formatter.formatToParts(new Date(wallClockUtc)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const representedUtc = Date.UTC(zoneParts.year, zoneParts.month - 1, zoneParts.day, zoneParts.hour, zoneParts.minute, zoneParts.second);
  const first = new Date(wallClockUtc - (representedUtc - wallClockUtc));
  // Una segunda pasada resuelve correctamente el cambio de offset estacional.
  const checkParts = Object.fromEntries(formatter.formatToParts(first).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const checkUtc = Date.UTC(checkParts.year, checkParts.month - 1, checkParts.day, checkParts.hour, checkParts.minute, checkParts.second);
  return new Date(first.getTime() - (checkUtc - wallClockUtc));
}

function timestampInfo(rawTimestamp, assumedTimezone = 'America/Santiago') {
  const original = rawTimestamp == null ? null : String(rawTimestamp);
  let parsed = null;
  if (rawTimestamp instanceof Date) parsed = rawTimestamp;
  else if (typeof rawTimestamp === 'number' || /^\d{10,13}$/.test(String(rawTimestamp || ''))) {
    const numeric = Number(rawTimestamp);
    parsed = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  } else if (original) {
    const normalized = original.trim().replace(/\//g, '-').replace(' ', 'T');
    parsed = /(Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? new Date(normalized) : dateInTimezone(original, assumedTimezone);
  }
  if (!parsed || Number.isNaN(parsed.getTime())) parsed = new Date();
  const utc = parsed.toISOString();
  return {
    provider_timestamp: original,
    provider_timezone: assumedTimezone,
    sampled_at_utc: utc,
    sampled_at_local: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' }).format(parsed),
    received_at: new Date().toISOString(),
    data_age_seconds: Math.max(0, Math.round((Date.now() - parsed.getTime()) / 1000))
  };
}

export function normalizeISolar(row = {}, summary = {}) {
  const merged = { ...summary, ...row };
  const pv1Power = read(merged, ['pvInputPower1','pvPower1','powerPv1','solarPower1','pv1Power','pvPowerInput1']);
  const pv2Power = read(merged, ['pvInputPower2','pvPower2','powerPv2','solarPower2','pv2Power','pvPowerInput2']);
  const batteryVoltage = read(merged, ['batteryVoltage','batteryVolt']);
  const chargeCurrent = read(merged, ['batteryChargingCurrent','batteryChargeCurrent']);
  const dischargeCurrent = read(merged, ['batteryDischargingCurrent','batteryDischargeCurrent']);
  const chargePower = read(merged, ['batteryChargingPower','batteryChargePower','chargingPower']);
  const dischargePower = read(merged, ['batteryDischargingPower','batteryDischargePower','dischargingPower']);
  const batteryPower = chargePower != null || dischargePower != null ? (dischargePower || 0) - (chargePower || 0) : null;
  return {
    grid: {
      voltage: read(merged,['gridVoltage','acInputVoltage']), current: read(merged,['gridCurrent','acInputCurrent']),
      frequency: read(merged,['gridFrequency','acInputFrequency']), power: read(merged,['gridPowerInputActiveTotal','gridActivePower','acInputActivePower','gridPower']),
      energy_today: read(merged,['gridEnergyToday','gridInputEnergyToday']), energy_total: read(merged,['gridEnergyTotal','gridInputEnergyTotal'])
    },
    pv: {
      total_power: pv1Power == null && pv2Power == null ? null : (pv1Power || 0) + (pv2Power || 0),
      mppt1_voltage: read(merged,['pvInputVoltage1','pvVoltage1']), mppt1_current: read(merged,['pvInputCurrent1','pvCurrent1']), mppt1_power: pv1Power,
      mppt2_voltage: read(merged,['pvInputVoltage2','pvVoltage2']), mppt2_current: read(merged,['pvInputCurrent2','pvCurrent2']), mppt2_power: pv2Power,
      energy_today: read(merged,['pvEnergyToday','solarEnergyToday']), energy_month: read(merged,['pvEnergyMonth','solarEnergyMonth']), energy_total: read(merged,['pvEnergyTotal','solarEnergyTotal'])
    },
    battery: {
      voltage: batteryVoltage, current: batteryPower != null && batteryVoltage ? batteryPower / batteryVoltage : read(merged,['batteryCurrent']), power: batteryPower,
      soc: read(merged,['batteryCapacity','batterySoc','soc','batteryPercent']), direction: batteryPower == null ? null : batteryPower > 0 ? 'discharging' : batteryPower < 0 ? 'charging' : 'idle',
      charge_current: chargeCurrent, discharge_current: dischargeCurrent, temperature: read(merged,['batteryTemperature'])
    },
    output: { voltage: read(merged,['acOutputVoltage','outputVoltage']), frequency: read(merged,['acOutputFrequency','outputFrequency']) },
    load: {
      active_power: read(merged,['acOutputActivePowerTotal','loadPower','outputActivePower','acOutputPower']), apparent_power: read(merged,['acOutputApparentPowerTotal','outputApparentPower']),
      reactive_power: read(merged,['acOutputReactivePowerTotal','outputReactivePower']), percent: read(merged,['outputLoadPercent','loadPercent']),
      energy_today: read(merged,['loadEnergyToday','outputEnergyToday']), energy_total: read(merged,['loadEnergyTotal','outputEnergyTotal'])
    },
    inverter: {
      mode: merged.workMode ?? merged.inverterMode ?? null, output_priority: merged.outputSourcePriority ?? null, charging_priority: merged.chargerSourcePriority ?? null,
      status: merged.deviceStatus ?? merged.status ?? null, temperature: read(merged,['inverterTemperature','temperature']), warning_code: merged.warningCode ?? null, fault_code: merged.faultCode ?? null
    },
    device: { model: merged.deviceModel ?? merged.model ?? null, serial: merged.deviceSn ?? null, firmware_main: merged.mainCpuFirmware ?? null, firmware_secondary: merged.secondaryCpuFirmware ?? null },
    logger: { serial: merged.loggerSn ?? null, status: merged.loggerStatus ?? null, firmware: merged.loggerFirmware ?? null },
    time: timestampInfo(merged.currentTime ?? merged.createTime ?? merged.collectTime ?? merged.dataTime ?? merged.time, 'Asia/Shanghai'),
    quality: { derived: batteryPower == null ? [] : ['battery.current_when_missing'], provider: 'isolar', normalizer_version: NORMALIZER_VERSION }
  };
}

function fieldMap(payload) {
  const pars = payload?.dat?.pars || {};
  const entries = Object.values(pars).flatMap((items) => Array.isArray(items) ? items : []);
  return Object.fromEntries(entries.filter((item) => item?.id).map((item) => [item.id, item.val]));
}

export function normalizeWatchPower(payload = {}) {
  const values = fieldMap(payload);
  const batteryVoltage = read(values,['bt_battery_voltage']);
  const chargeCurrent = read(values,['bt_battery_charging_current']);
  const dischargeCurrent = read(values,['bt_battery_discharge_current']);
  const batteryCurrent = chargeCurrent != null || dischargeCurrent != null ? (dischargeCurrent || 0) - (chargeCurrent || 0) : null;
  const batteryPower = batteryVoltage != null && batteryCurrent != null ? batteryVoltage * batteryCurrent : null;
  const active = read(values,['bt_load_active_power_sole','bt_ac_output_active_power']);
  const apparent = read(values,['bt_ac_output_apparent_power']);
  const reactive = active != null && apparent != null && apparent >= Math.abs(active) ? Math.sqrt(apparent ** 2 - active ** 2) : null;
  const pv1Voltage = read(values,['bt_voltage_1','pv_input_voltage','pv1_voltage']);
  const pv1Current = read(values,['pv_input_current','bt_pv_input_current','pv1_current']);
  const pv1Power = read(values,['bt_input_power','pv_input_power','pv1_power']) ?? (pv1Voltage != null && pv1Current != null ? pv1Voltage * pv1Current : null);
  const pv2Voltage = read(values,['bt_voltage_2','pv2_voltage']);
  const pv2Current = read(values,['pv2_input_current','pv2_current']);
  const pv2Power = read(values,['pv2_input_power','pv2_power']) ?? (pv2Voltage != null && pv2Current != null ? pv2Voltage * pv2Current : null);
  return {
    grid: { voltage: read(values,['bt_grid_voltage']), current: read(values,['bt_grid_current']), frequency: read(values,['bt_grid_frequency']), power: read(values,['bt_grid_active_power']), energy_today: read(values,['gd_grid_energy_today']), energy_total: read(values,['gd_grid_energy_total']) },
    pv: { total_power: pv1Power == null && pv2Power == null ? null : (pv1Power || 0) + (pv2Power || 0), mppt1_voltage: pv1Voltage, mppt1_current: pv1Current, mppt1_power: pv1Power, mppt2_voltage: pv2Voltage, mppt2_current: pv2Current, mppt2_power: pv2Power, energy_today: read(values,['gd_pv_energy_today','pv_energy_today']), energy_month: read(values,['gd_pv_energy_month']), energy_total: read(values,['gd_pv_energy_total']) },
    battery: { voltage: batteryVoltage, current: batteryCurrent, power: batteryPower, soc: read(values,['bt_battery_capacity']), direction: batteryCurrent == null ? null : batteryCurrent > 0 ? 'discharging' : batteryCurrent < 0 ? 'charging' : 'idle', charge_current: chargeCurrent, discharge_current: dischargeCurrent, temperature: read(values,['bt_battery_temperature']) },
    output: { voltage: read(values,['bt_ac_output_voltage']), frequency: read(values,['bt_grid_AC_frequency','bt_ac_output_frequency']) },
    load: { active_power: active, apparent_power: apparent, reactive_power: reactive, percent: read(values,['bt_output_load_percent']), energy_today: read(values,['gd_load_energy_today']), energy_total: read(values,['gd_load_energy_total']) },
    inverter: { mode: values.sy_work_mode ?? values.bt_work_mode ?? null, output_priority: values.bse_output_source_priority ?? null, charging_priority: values.bse_charger_source_priority ?? null, status: values.sy_status ?? null, temperature: read(values,['bt_inverter_temperature']), warning_code: values.sy_warning_code ?? null, fault_code: values.sy_fault_code ?? null },
    device: { model: values.sy_model ?? null, serial: payload?.device?.sn ?? null, firmware_main: values.sy_main_cpu1_firmware_version ?? null, firmware_secondary: values.sy_main_cpu2_firmware_version ?? null },
    logger: { serial: payload?.device?.pn ?? null, status: values.logger_status ?? null, firmware: values.logger_firmware ?? null },
    time: timestampInfo(payload?.dat?.gts, 'America/Santiago'),
    quality: { derived: [batteryPower != null ? 'battery.power=voltage×current' : null, reactive != null ? 'load.reactive_power=sqrt(apparent²-active²)' : null].filter(Boolean), provider: 'watchpower', normalizer_version: NORMALIZER_VERSION, timestamp_assumption: 'America/Santiago assumed from the El Arrayán site; original provider timestamp is preserved for audit and comparison.' },
    provider_fields: values
  };
}

export function canonicalToLegacy(canonical = {}) {
  const batteryPower = Number(canonical.battery?.power || 0);
  return {
    currentTime: canonical.time?.sampled_at_utc,
    pvInputPower1: canonical.pv?.mppt1_power ?? 0,
    pvInputPower2: canonical.pv?.mppt2_power ?? 0,
    acOutputActivePowerTotal: canonical.load?.active_power ?? 0,
    acOutputApparentPowerTotal: canonical.load?.apparent_power ?? 0,
    acOutputReactivePowerTotal: canonical.load?.reactive_power ?? 0,
    gridPowerInputActiveTotal: canonical.grid?.power ?? 0,
    statusGrid: Math.abs(Number(canonical.grid?.power || 0)) > 10 ? 1 : 0,
    batteryChargingPower: batteryPower < 0 ? Math.abs(batteryPower) : 0,
    batteryDischargingPower: batteryPower > 0 ? batteryPower : 0,
    batteryCapacity: canonical.battery?.soc,
    batteryVoltage: canonical.battery?.voltage,
    acOutputVoltage: canonical.output?.voltage,
    acOutputFrequency: canonical.output?.frequency,
    inverterTemperature: canonical.inverter?.temperature,
    workMode: canonical.inverter?.mode,
    provider: canonical.quality?.provider,
    canonical
  };
}
