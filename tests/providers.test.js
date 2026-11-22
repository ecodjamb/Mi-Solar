import assert from 'node:assert/strict';
import { canonicalToLegacy, normalizeISolar, normalizeWatchPower } from '../server/canonicalTelemetry.js';
import { looksLikeExpiredISolarSession, shouldRecordProviderFailure } from '../server/providerStore.js';
import { ISolarProvider } from '../server/providers/isolarProvider.js';
import { WatchPowerProvider, WATCHPOWER_WRITES_ENABLED } from '../server/providers/watchPowerProvider.js';

const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

assert.equal(shouldRecordProviderFailure({ code: 'CIRCUIT_OPEN', status: 423 }), false);
assert.equal(shouldRecordProviderFailure({ code: 'PROVIDER_DISABLED', status: 409 }), false);
assert.equal(shouldRecordProviderFailure({ code: 'RATE_LIMIT', status: 429 }), true);
assert.equal(shouldRecordProviderFailure({ code: 'ARCHIVE_STORAGE_ERROR', status: 500, message: 'Archivo permanente HTTP 500' }), false);
assert.equal(shouldRecordProviderFailure({ message: 'Archivo permanente HTTP 500: canceling statement due to statement timeout' }), false);
assert.equal(looksLikeExpiredISolarSession({ status: 401 }), true);
assert.equal(looksLikeExpiredISolarSession({ message: 'Login required' }), true);
assert.equal(looksLikeExpiredISolarSession({ code: 'RATE_LIMIT', status: 429 }), false);

{
  const coherent = normalizeISolar({
    currentTime: '2026-08-30 20:00:00', statusGrid: 0,
    pvInputPower1: 2000, pvInputPower2: 1800,
    acOutputActivePowerTotal: 600, batteryChargingPower: 3000, batteryDischargingPower: 0
  });
  assert.equal(coherent.quality.energy_balance.status, 'coherent');
  const inconsistent = normalizeISolar({
    currentTime: '2026-08-30 20:00:00', statusGrid: 0,
    pvInputPower1: 1280, pvInputPower2: 1172,
    acOutputActivePowerTotal: 756, batteryChargingPower: 2703, batteryDischargingPower: 0
  });
  assert.equal(inconsistent.quality.energy_balance.status, 'inconsistent');
  assert.equal(inconsistent.quality.energy_balance.residual_w, -1007);
}

{
  const canonical = normalizeISolar({
    currentTime: '2026-10-02 12:00:00', statusGrid: 0,
    pvInputPower1: 1816, pvInputVoltage1: 307.4, pvInputCurrent1: 5.91,
    pvInputPower2: 1740, voltageInput2: 296.8, currentInput2: 5.86,
    batteryVoltage: 51.2, batteryDischargingPower: 1024, batteryChargingPower: 0,
    acOutputActivePowerTotal: 2500, acOutputApparentPowerTotal: 2700,
    acOutputVoltageR: 229.7, acOutputFrequency: 50,
    innerTemperature: 41.3, maxTemperature: 47.8, acOutputLoadTotal: 21,
    deviceModel: 'VII PREMIUM PLUS Series', mainCpuFirmware: '69.02', secondaryCpuFirmware: '02.33', loggerFirmware: 'FC41_R11',
    ratedOutputPowerW: 12000, ratedOutputPowerVa: 12000, mpptTrackerCount: 2, outputSourcePriority: 'SBU', fault1: 0, warning1: 0
  });
  const legacy = canonicalToLegacy(canonical);
  assert.equal(legacy.pvInputVoltage1, 307.4);
  assert.equal(legacy.pvInputCurrent1, 5.91);
  assert.equal(legacy.pvInputVoltage2, 296.8);
  assert.equal(legacy.pvInputCurrent2, 5.86);
  assert.equal(legacy.batteryCurrent, 20);
  assert.equal(legacy.acOutputVoltage, 229.7);
  assert.equal(legacy.inverterTemperature, 41.3);
  assert.equal(legacy.radiatorTemperature, 47.8);
  assert.equal(legacy.outputLoadPercent, 21);
  assert.equal(legacy.deviceModel, 'VII PREMIUM PLUS Series');
  assert.equal(legacy.mainCpuFirmware, '69.02');
  assert.equal(legacy.secondaryCpuFirmware, '02.33');
  assert.equal(legacy.loggerFirmware, 'FC41_R11');
  assert.equal(legacy.ratedOutputPowerW, 12000);
  assert.equal(legacy.mpptTrackerCount, 2);
  assert.equal(legacy.outputSourcePriority, 'SBU');
}

{
  const provider = new ISolarProvider({ request: async () => { const error = new Error('limited'); error.status = 429; throw error; } });
  await assert.rejects(() => provider.authenticate({ username: 'fixture', password: 'fixture' }), (error) => error.code === 'RATE_LIMIT' && error.status === 429);
}

{
  const provider = new ISolarProvider({ request: async () => { const error = new Error('blocked'); error.status = 403; throw error; } });
  await assert.rejects(() => provider.authenticate({ username: 'fixture', password: 'fixture' }), (error) => error.code === 'ACCOUNT_BLOCKED' && error.status === 403);
}

{
  const calls = [];
  const provider = new ISolarProvider({ request: async (path, options = {}) => {
    calls.push({ path, token: options.token || '', params: options.params || {} });
    if (path === 'user/login') return { payload: { data: { token: 'token-a', vrtKey: 'vrt-a' } }, token: 'token-a' };
    if (path === 'deviceUser/getMyDevice') return { payload: { data: { list: [{ deviceSn: '12345678' }], total: 1 } }, token: 'token-b' };
    if (path === 'realData/getRealByDeviceSn') return { payload: { code: 0, data: { currentTime: '2026-08-21 21:00:00' } }, token: 'token-c' };
    throw new Error(`Endpoint inesperado: ${path}`);
  } });
  const session = await provider.authenticate({ username: 'fixture', password: 'fixture' });
  const listed = await provider.listDevices(session);
  const realtime = await provider.getRealtimeData(listed.session, listed.devices[0]);
  assert.equal(calls[1].token, 'token-a');
  assert.equal(calls[1].params.pageSize, '20');
  assert.equal(calls[2].token, 'token-b');
  assert.equal(calls[2].path, 'realData/getRealByDeviceSn');
  assert.equal(realtime.currentTime, '2026-08-21 21:00:00');
  assert.equal(session.token, 'token-c');
}

{
  let requested = '';
  const provider = new WatchPowerProvider({ fetchImpl: async (url) => {
    requested = String(url);
    return response({ err: 0, dat: { token: 'test-token', secret: 'test-secret', expire: 600 } });
  } });
  const session = await provider.authenticate({ username: 'fixture-user', password: 'fixture-password' });
  assert.equal(session.token, 'test-token');
  assert.match(requested, /action=authSource/);
  assert.match(requested, /_app_id_=wifiapp\.volfw\.watchpower/);
  assert.doesNotMatch(requested, /fixture-password/);
}

{
  const provider = new WatchPowerProvider({ fetchImpl: async () => response({ err: 0x0010, desc: 'fixture' }) });
  await assert.rejects(() => provider.authenticate({ username: 'fixture', password: 'wrong' }), (error) => error.code === 'INVALID_CREDENTIALS' && error.status === 401);
}

{
  const provider = new WatchPowerProvider({ fetchImpl: async () => response({ error: 'limited' }, 429) });
  await assert.rejects(() => provider.authenticate({ username: 'fixture', password: 'fixture' }), (error) => error.code === 'RATE_LIMIT' && error.retryable === true);
}

{
  const canonical = normalizeWatchPower({ dat: { gts: '2026-08-21 12:00:00', pars: { a: [
    { id: 'bt_voltage_1', val: '80' }, { id: 'pv_input_current', val: '10' },
    { id: 'bt_battery_voltage', val: '50' }, { id: 'bt_battery_discharge_current', val: '4' }, { id: 'bt_battery_charging_current', val: '0' },
    { id: 'bt_ac_output_apparent_power', val: '2500' }, { id: 'bt_load_active_power_sole', val: '2000' }
  ] } } });
  assert.equal(canonical.pv.total_power, 800);
  assert.equal(canonical.battery.power, 200);
  assert.equal(canonical.battery.direction, 'discharging');
  assert.equal(canonical.load.reactive_power, 1500);
  assert.ok(canonical.quality.derived.includes('battery.power=voltage×current'));
  assert.equal(canonical.time.sampled_at_utc, '2026-08-21T16:00:00.000Z');
}

{
  const summer = normalizeWatchPower({ dat: { gts: '2026-01-15 12:00:00', pars: {} } });
  assert.equal(summer.time.sampled_at_utc, '2026-01-15T15:00:00.000Z');
  const missing = normalizeWatchPower({ dat: { gts: '2026-01-15 12:00:00', pars: { a: [{ id: 'bt_voltage_1', val: '100' }] } } });
  assert.equal(missing.pv.total_power, null);
  assert.equal(missing.load.reactive_power, null);
}

{
  const canonical = normalizeWatchPower({ dat: { gts: '2026-08-30 12:51:43', pars: { a: [
    { id: 'bc_model', val: 'Battery Mode' },
    { id: 'bt_output_power_1', val: '3215' }, { id: 'bt_input_power_1', val: '2061' },
    { id: 'bt_voltage_1', val: '268' }, { id: 'pv_input_current', val: '11' },
    { id: 'bt_voltage_2', val: '293' }, { id: 'pv_input_current2', val: '7' },
    { id: 'bt_battery_voltage', val: '54' }, { id: 'bt_battery_charging_current', val: '87' }, { id: 'bt_battery_discharge_current', val: '0' },
    { id: 'bt_load_active_power_sole', val: '315' }
  ] } } });
  assert.equal(canonical.pv.mppt1_power, 3215);
  assert.equal(canonical.pv.mppt2_power, 2061);
  assert.equal(canonical.pv.total_power, 5276);
  assert.equal(canonical.quality.pv_power_mapping, 'mppt1=bt_output_power_1;mppt2=bt_input_power_1');
  assert.equal(canonical.quality.energy_balance.status, 'coherent');
  const legacy = canonicalToLegacy(canonical);
  assert.equal(legacy.pvInputVoltage1, 268);
  assert.equal(legacy.pvInputCurrent1, 11);
  assert.equal(legacy.pvInputVoltage2, 293);
  assert.equal(legacy.pvInputCurrent2, 7);
  assert.equal(legacy.batteryCurrent, -87);
}

{
  const delayedEpoch = Date.now() - 12 * 60 * 60 * 1000;
  const canonical = normalizeWatchPower({ dat: { gts: delayedEpoch, pars: { a: [
    { id: 'bc_model', val: 'Battery Mode' }, { id: 'bt_input_power_1', val: '725' },
    { id: 'bt_voltage_2', val: '80' }, { id: 'pv_input_current2', val: '5' },
    { id: 'bt_load_active_power_sole', val: '1000' }, { id: 'bt_grid_ac_frequency', val: '50' }
  ] } } });
  assert.equal(canonical.pv.mppt1_power, 725);
  assert.equal(canonical.pv.mppt2_power, 400);
  assert.equal(canonical.pv.total_power, 1125);
  assert.equal(canonical.grid.active, false);
  assert.equal(canonical.grid.power, 0);
  assert.equal(canonical.output.frequency, 50);
  assert.equal(canonical.inverter.mode, 'Battery Mode');
  assert.equal(canonical.quality.timestamp_correction_seconds, 43200);
  assert.ok(Math.abs(Date.parse(canonical.time.sampled_at_utc) - Date.now()) < 5000);
}

assert.equal(WATCHPOWER_WRITES_ENABLED, false);
const methodNames = Object.getOwnPropertyNames(WatchPowerProvider.prototype);
assert.equal(methodNames.some((name) => /^(write|sendCommand|control|setParameter|updateSetting)/i.test(name)), false);

console.log('provider adapter and canonical telemetry tests: ok');
