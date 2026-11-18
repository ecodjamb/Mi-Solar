import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authorizedAlexaWidgetRequest, readAlexaWidgetSnapshot } from '../server/alexaWidget.js';

const manifest = JSON.parse(await readFile(new URL('../alexa/widget-manifest.json', import.meta.url)));
assert.equal(manifest.manifest.version, '1.0.3');
assert.equal(manifest.manifest.installStateChanges, 'INFORM');
assert.deepEqual(Object.keys(manifest.publishingInformation.locales).sort(), ['es-ES', 'es-MX', 'es-US']);
for (const locale of Object.values(manifest.publishingInformation.locales)) {
  const metadata = locale[0].metadata;
  assert.equal(locale[0].targetViewport, 'WIDGET_M');
  assert.match(metadata.iconUri, /\/3a2f6193b3363b756bd00ac325cf1fab7babfaf2\/.*450|mi-solar-widget-icon\.png$/);
  assert.match(metadata.previews[0], /mi-solar-widget-preview\.png$/);
  assert.doesNotMatch(metadata.iconUri, /default_icon/);
}

assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer abc' }, 'abc'), true);
assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer abc' }, 'abcd'), false);
assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer abcX' }, 'abc'), false);
assert.equal(authorizedAlexaWidgetRequest({}, 'abc'), false);
assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer abc' }, ''), false);

const before = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  MISOLAR_DB_KEY: process.env.MISOLAR_DB_KEY
};
process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test';
process.env.MISOLAR_DB_KEY = 'test';
try {
  let requestedPath = '';
  const now = new Date('2026-11-18T01:30:00.000Z');
  const result = await readAlexaWidgetSnapshot({
    deviceSn: '1234567890',
    lookupSite: async () => 'site-example',
    query: async (path) => {
      requestedPath = path;
      return [{
        sample_at: '2026-11-18T01:25:00.000Z', solar_w: 7560,
        load_w: 2420, grid_w: 0, battery_soc: 88.4,
        battery_charge_w: 1250, battery_discharge_w: 0
      }];
    },
    now
  });
  assert.ok(requestedPath.includes('site-example'));
  assert.equal(result.generacion, '7,6 kW');
  assert.equal(result.consumo, '2,4 kW');
  assert.equal(result.bateria, '88 %');
  assert.equal(result.estado, 'Actualizado');
  const stale = await readAlexaWidgetSnapshot({
    deviceSn: '1234567890', lookupSite: async () => 'site-example',
    query: async () => [{ sample_at: '2026-11-17T23:00:00.000Z', solar_w: 800 }],
    now
  });
  assert.equal(stale.estado, 'Dato atrasado');
  assert.equal(stale.bateria, '--');
  const empty = await readAlexaWidgetSnapshot({
    deviceSn: '1234567890', lookupSite: async () => null,
    now
  });
  assert.equal(empty.estado, 'Sin datos');
  console.log('Pruebas de widget Alexa: OK');
} finally {
  for (const [key, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
