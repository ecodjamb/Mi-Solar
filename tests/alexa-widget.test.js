import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authorizedAlexaWidgetRequest, readAlexaWidgetSnapshot } from '../server/alexaWidget.js';
import monitorSync from '../alexa/monitor-sync.cjs';
import datastoreClient from '../alexa/datastore-client.cjs';

const {
  fetchMonitor,
  snapshotFromMonitor,
  syncMonitorToDataStore
} = monitorSync;
const { failedDeliveries, isAlexaDeviceId, writeDataStore } = datastoreClient;
const previousWidgetDataToken = process.env.ALEXA_WIDGET_DATA_TOKEN;
const previousWidgetToken = process.env.ALEXA_WIDGET_TOKEN;
process.env.ALEXA_WIDGET_TOKEN = 'test-widget-token';

const manifest = JSON.parse(await readFile(new URL('../alexa/widget-manifest.json', import.meta.url)));
assert.equal(manifest.manifest.version, '1.0.9');
assert.equal(manifest.manifest.installStateChanges, 'INFORM');
assert.equal(manifest.manifest.updateStateChanges, 'INFORM');
assert.deepEqual(Object.keys(manifest.publishingInformation.locales).sort(), ['es-ES', 'es-MX', 'es-US']);
for (const locale of Object.values(manifest.publishingInformation.locales)) {
  const metadata = locale[0].metadata;
  assert.equal(locale[0].targetViewport, 'WIDGET_M');
  assert.equal(metadata.name, 'mi solar v1.0.9');
  assert.match(metadata.iconUri, /mi-solar-widget-icon-v1\.0\.9\.png$/);
  assert.match(metadata.previews[0], /mi-solar-widget-preview-v2\.png$/);
  assert.doesNotMatch(metadata.iconUri, /default_icon/);
}

const widgetText = await readFile(new URL('../alexa/widget-show5.json', import.meta.url), 'utf8');
const widget = JSON.parse(widgetText);
assert.equal(widget.type, 'APL');
assert.match(widgetText, /mi solar · El Arrayán/);
assert.match(widgetText, /v1\.0\.9/);
assert.match(widgetText, /PRODUCCIÓN SOLAR/);
assert.doesNotMatch(widgetText, /PB1 \+ PB2/);
assert.doesNotMatch(widgetText, /"width":"49%"/);
assert.match(widgetText, /"grow":1/);
const hostedLambda = await readFile(new URL('../alexa/alexa-hosted-index.cjs', import.meta.url), 'utf8');
assert.match(hostedLambda, /type: 'USER', id: userId/);
assert.match(hostedLambda, /targetFromEnvelope/);
assert.match(hostedLambda, /Mi Solar actualizó el widget/);

// Límites oficiales de @hubWidgetMedium: 134–425 dp × 222–711 dp.
for (const [width, height] of [[134, 222], [240, 350], [320, 480], [425, 711]]) {
  const horizontalPadding = width >= 350 ? 44 : width >= 240 ? 28 : 18;
  const cardGap = width >= 350 ? 12 : 7;
  const verticalPadding = height >= 550 ? 28 : height >= 350 ? 18 : 11;
  const verticalGap = height >= 550 ? 44 : height >= 350 ? 28 : 16;
  const header = height >= 550 ? 48 : height >= 350 ? 36 : 34;
  const summary = height >= 550 ? 94 : height >= 350 ? 70 : 50;
  const footer = height >= 550 ? 19 : 13;
  const cardWidth = (width - horizontalPadding - cardGap) / 2;
  const rowHeight = (height - verticalPadding - verticalGap - header - summary - footer) / 2;
  assert.ok(cardWidth >= 50, `ancho insuficiente ${width}×${height}`);
  assert.ok(rowHeight >= 40, `alto insuficiente ${width}×${height}`);
}

assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer abc' }, 'abc'), true);
assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer abc' }, 'abcd'), false);
assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer abcX' }, 'abc'), false);
assert.equal(authorizedAlexaWidgetRequest({}, 'abc'), false);
assert.equal(authorizedAlexaWidgetRequest({ authorization: 'Bearer abc' }, ''), false);
assert.equal(isAlexaDeviceId('amzn1.ask.device.echoCocina'), true);
assert.equal(isAlexaDeviceId('1234567890123'), false);

const publicPayload = {
  refreshAfterSeconds: 90,
  sites: [{
    key: 'site:2', name: 'El Arrayán', available: true, provider: 'isolar',
    sampledAt: '2026-11-18T11:36:51+00:00',
    forecastTodayKwh: 20,
    history: [
      { pvInputPower1: 1000, pvInputPower2: 500, aggregateHours: 2 },
      { pvInputPower1: 600, pvInputPower2: 400, aggregateHours: 1 }
    ],
    realtime: {
      pvInputPower1: 846, pvInputPower2: 1794,
      batteryCapacity: 39, acOutputActivePowerTotal: 2387,
      gridPowerInputActiveTotal: -25
    }
  }]
};
const compact = snapshotFromMonitor(publicPayload, new Date('2026-11-18T11:40:00Z'));
assert.equal(compact.generacion, '2,6 kW');
assert.equal(compact.pv1, '0,8 kW');
assert.equal(compact.pv2, '1,8 kW');
assert.equal(compact.bateria, '39 %');
assert.equal(compact.consumo, '2,4 kW');
assert.equal(compact.red, '0,0 kW');
assert.equal(compact.origen, 'isolar');
assert.equal(compact.generadoHoy, '4,0 kWh');
assert.equal(compact.esperadoHoy, '20,0 kWh');
assert.equal(compact.progresoSolar, '20%');
assert.equal(compact.progresoSolarValor, 20);
assert.equal(compact.tienePronostico, true);
assert.equal(compact.disponible, true);
assert.equal(compact.estado, 'Actualizado');
assert.equal(snapshotFromMonitor(publicPayload, new Date('2026-11-18T12:00:00Z')).estado, 'Dato atrasado');

const withoutForecast = snapshotFromMonitor({
  ...publicPayload,
  sites: [{ ...publicPayload.sites[0], forecastTodayKwh: null }]
}, new Date('2026-11-18T11:40:00Z'));
assert.equal(withoutForecast.esperadoHoy, '--');
assert.equal(withoutForecast.progresoSolarValor, 0);
assert.equal(withoutForecast.tienePronostico, false);

const fetched = await fetchMonitor({
  fetchImpl: async (_url, options) => {
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.headers.Authorization, 'Bearer test-widget-token');
    return { ok: true, json: async () => publicPayload };
  },
  now: new Date('2026-11-18T11:40:00Z')
});
assert.equal(fetched.refreshAfterSeconds, 60);
assert.equal(fetched.source, 'protected');

let fallbackCalls = 0;
const publicFallback = await fetchMonitor({
  fetchImpl: async (url, options) => {
    fallbackCalls += 1;
    if (url.includes('/api/alexa/')) {
      assert.match(options.headers.Authorization, /^Bearer /);
      return { ok: false, status: 404, json: async () => ({}) };
    }
    assert.equal(options.headers.Authorization, undefined);
    return { ok: true, status: 200, json: async () => publicPayload };
  },
  now: new Date('2026-11-18T11:40:00Z')
});
assert.equal(fallbackCalls, 2);
assert.equal(publicFallback.source, 'public-fallback');
assert.equal(publicFallback.snapshot.generacion, '2,6 kW');
assert.equal(publicFallback.protectedError.status, 404);

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
  assert.equal(fallback.written, true);
  assert.equal(fallback.snapshot.estado, 'Dato atrasado');
  assert.equal(fallback.snapshot.generacion, '2,6 kW');
  assert.equal(writes, 3);
  assert.equal((await syncMonitorToDataStore({
    ...syncOptions,
    fetchImpl: async () => { throw new Error('timeout'); }
  })).written, false);
  await assert.rejects(() => syncMonitorToDataStore({
    ...syncOptions,
    targetId: '1234567890123'
  }), /deviceId válido/);
} finally {
  await (await import('node:fs/promises')).unlink(statePath).catch(() => {});
}

assert.deepEqual(failedDeliveries({ results: [{ type: 'SUCCESS' }] }), []);
assert.equal(failedDeliveries({ items: [{ type: 'DEVICE_UNAVAILABLE' }] }).length, 1);
const datastoreEnv = {
  ALEXA_LWA_CLIENT_ID: process.env.ALEXA_LWA_CLIENT_ID,
  ALEXA_LWA_CLIENT_SECRET: process.env.ALEXA_LWA_CLIENT_SECRET,
  ALEXA_API_REGION: process.env.ALEXA_API_REGION
};
process.env.ALEXA_LWA_CLIENT_ID = 'client-test';
process.env.ALEXA_LWA_CLIENT_SECRET = 'secret-test';
process.env.ALEXA_API_REGION = 'na';
let datastoreCalls = 0;
let datastoreRequest;
try {
  const delivery = await writeDataStore({ estado: 'Actualizado' }, 'amzn1.ask.device.echoCocina', {
    now: new Date('2026-11-18T12:00:00Z'),
    fetchImpl: async (url, options) => {
      datastoreCalls += 1;
      if (url.includes('/auth/o2/token')) {
        assert.doesNotMatch(String(options.body), /secret-test.*secret-test/);
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'lwa-test' }) };
      }
      datastoreRequest = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer lwa-test');
      return { ok: true, status: 200, text: async () => '' };
    }
  });
  assert.equal(delivery.accepted, true);
  assert.equal(datastoreCalls, 2);
  assert.deepEqual(datastoreRequest.target.items, ['amzn1.ask.device.echoCocina']);
  assert.equal(datastoreRequest.commands[0].namespace, 'MiSolar');
  assert.equal(datastoreRequest.commands[0].key, 'Indicadores');
} finally {
  for (const [key, value] of Object.entries(datastoreEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
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
        sample_at: '2026-11-18T01:25:00.000Z', solar_w: 7560, pv1_w: 3200, pv2_w: 4360,
        load_w: 2420, grid_w: 0, battery_soc: 88.4,
        battery_charge_w: 1250, battery_discharge_w: 0
      }];
    },
    now
  });
  assert.ok(requestedPath.includes('site-example'));
  assert.equal(result.generacion, '7,6 kW');
  assert.equal(result.pv1, '3,2 kW');
  assert.equal(result.pv2, '4,4 kW');
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
  if (previousWidgetDataToken === undefined) delete process.env.ALEXA_WIDGET_DATA_TOKEN;
  else process.env.ALEXA_WIDGET_DATA_TOKEN = previousWidgetDataToken;
  if (previousWidgetToken === undefined) delete process.env.ALEXA_WIDGET_TOKEN;
  else process.env.ALEXA_WIDGET_TOKEN = previousWidgetToken;
}
