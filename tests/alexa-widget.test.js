import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authorizedAlexaWidgetRequest, readAlexaWidgetSnapshot } from '../server/alexaWidget.js';
import monitorSync from '../alexa/monitor-sync.cjs';

const {
  fetchMonitor,
  snapshotFromMonitor,
  syncMonitorToDataStore
} = monitorSync;

const manifest = JSON.parse(await readFile(new URL('../alexa/widget-manifest.json', import.meta.url)));
assert.equal(manifest.manifest.version, '1.0.3');
assert.equal(manifest.manifest.installStateChanges, 'INFORM');
assert.equal(manifest.manifest.updateStateChanges, 'INFORM');
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

const publicPayload = {
  refreshAfterSeconds: 90,
  sites: [{
    key: 'site:2', name: 'El Arrayán', available: true, provider: 'isolar',
    sampledAt: '2026-11-18T11:36:51+00:00',
    realtime: {
      pvInputPower1: 846, pvInputPower2: 1794,
      batteryCapacity: 39, acOutputActivePowerTotal: 2387,
      gridPowerInputActiveTotal: -25
    }
  }]
};
const compact = snapshotFromMonitor(publicPayload, new Date('2026-11-18T11:40:00Z'));
assert.equal(compact.generacion, '2,6 kW');
assert.equal(compact.bateria, '39 %');
assert.equal(compact.consumo, '2,4 kW');
assert.equal(compact.red, '0,0 kW');
assert.equal(compact.origen, 'isolar');
assert.equal(compact.disponible, true);
assert.equal(compact.estado, 'Actualizado');
assert.equal(snapshotFromMonitor(publicPayload, new Date('2026-11-18T12:00:00Z')).estado, 'Dato atrasado');

const fetched = await fetchMonitor({
  fetchImpl: async (_url, options) => {
    assert.equal(options.headers.Accept, 'application/json');
    return { ok: true, json: async () => publicPayload };
  },
  now: new Date('2026-11-18T11:40:00Z')
});
assert.equal(fetched.refreshAfterSeconds, 60);

const statePath = `/tmp/mi-solar-alexa-test-${process.pid}.json`;
let writes = 0;
const syncOptions = {
  targetId: 'amzn1.ask.device.test', statePath,
  fetchImpl: async () => ({ ok: true, json: async () => publicPayload }),
  writeDataStore: async (content, targetId) => {
    writes += 1;
    assert.match(targetId, /^amzn1\.ask\.device\.(test|second)$/);
    assert.equal(content.sampledAt, publicPayload.sites[0].sampledAt);
  },
  now: new Date('2026-11-18T11:40:00Z')
};
try {
  assert.equal((await syncMonitorToDataStore(syncOptions)).written, true);
  assert.equal((await syncMonitorToDataStore(syncOptions)).written, false);
  assert.equal(writes, 1);
  assert.equal((await syncMonitorToDataStore({
    ...syncOptions,
    targetId: 'amzn1.ask.device.second'
  })).written, true);
  assert.equal(writes, 2);
  const fallback = await syncMonitorToDataStore({
    ...syncOptions,
    fetchImpl: async () => { throw new Error('timeout'); }
  });
  assert.equal(fallback.written, false);
  assert.equal(fallback.snapshot.estado, 'Dato atrasado');
  assert.equal(fallback.snapshot.generacion, '2,6 kW');
} finally {
  await (await import('node:fs/promises')).unlink(statePath).catch(() => {});
}

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
