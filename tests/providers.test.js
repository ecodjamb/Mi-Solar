import assert from 'node:assert/strict';
import { normalizeWatchPower } from '../server/canonicalTelemetry.js';
import { looksLikeExpiredISolarSession, shouldRecordProviderFailure } from '../server/providerStore.js';
import { ISolarProvider } from '../server/providers/isolarProvider.js';
import { WatchPowerProvider, WATCHPOWER_WRITES_ENABLED } from '../server/providers/watchPowerProvider.js';

const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

assert.equal(shouldRecordProviderFailure({ code: 'CIRCUIT_OPEN', status: 423 }), false);
assert.equal(shouldRecordProviderFailure({ code: 'PROVIDER_DISABLED', status: 409 }), false);
assert.equal(shouldRecordProviderFailure({ code: 'RATE_LIMIT', status: 429 }), true);
assert.equal(looksLikeExpiredISolarSession({ status: 401 }), true);
assert.equal(looksLikeExpiredISolarSession({ message: 'Login required' }), true);
assert.equal(looksLikeExpiredISolarSession({ code: 'RATE_LIMIT', status: 429 }), false);

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
