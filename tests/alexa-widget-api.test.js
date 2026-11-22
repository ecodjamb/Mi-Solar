import assert from 'node:assert/strict';
import { authorizedAlexaWidgetRequest, readAlexaWidgetSnapshot } from '../server/alexaWidget.js';

assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer prueba' }, 'prueba'), true);
assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer pruebaX' }, 'prueba'), false);
assert.equal(authorizedAlexaWidgetRequest({}, 'prueba'), false);

const previous = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  MISOLAR_DB_KEY: process.env.MISOLAR_DB_KEY
};
process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test';
process.env.MISOLAR_DB_KEY = 'test';

try {
  let calls = 0;
  const snapshot = await readAlexaWidgetSnapshot({
    deviceSn: '1234567890',
    lookupSite: async () => 'site-arrayan',
    query: async (path) => {
      calls += 1;
      if (path.startsWith('energy_samples')) return [{
        sample_at: '2026-11-20T12:00:00.000Z', solar_w: 5210,
        pv1_w: 2410, pv2_w: 2800, load_w: 2310, grid_w: 0,
        battery_soc: 74, battery_charge_w: 2900, battery_discharge_w: 0
      }];
      return [{ pv1_w: 2000, pv2_w: 3000, coverage_hours: 2 }];
    },
    now: new Date('2026-11-20T12:05:00.000Z')
  });
  assert.equal(calls, 2);
  assert.equal(snapshot.sitio, 'El Arrayán');
  assert.equal(snapshot.generacion, '5,2 kW');
  assert.equal(snapshot.pv1, '2,4 kW');
  assert.equal(snapshot.pv2, '2,8 kW');
  assert.equal(snapshot.consumo, '2,3 kW');
  assert.equal(snapshot.bateria, '74 %');
  assert.equal(snapshot.carga, '2,9 kW');
  assert.equal(snapshot.generadoHoy, '10,0 kWh');
  assert.equal(snapshot.estado, 'Actualizado');
  assert.equal(snapshot.disponible, true);
  console.log('alexa widget api tests: ok');
} finally {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
