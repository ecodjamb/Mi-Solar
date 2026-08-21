import assert from 'node:assert/strict';
import { normalizeWatchPower } from '../server/canonicalTelemetry.js';
import { WatchPowerProvider, WATCHPOWER_WRITES_ENABLED } from '../server/providers/watchPowerProvider.js';

const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

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

assert.equal(WATCHPOWER_WRITES_ENABLED, false);
const methodNames = Object.getOwnPropertyNames(WatchPowerProvider.prototype);
assert.equal(methodNames.some((name) => /^(write|sendCommand|control|setParameter|updateSetting)/i.test(name)), false);

console.log('provider adapter and canonical telemetry tests: ok');
