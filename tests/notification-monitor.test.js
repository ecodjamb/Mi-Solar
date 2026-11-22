import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessBatteryAfterSunset, assessGridOutage, chooseFreshestProviderSample } from '../server/notificationMonitor.js';

const normalNight = assessGridOutage({
  statusGrid: 1, gridVoltageR: 220, gridFrequency: 50,
  statusLoad: 1, acOutputActivePowerTotal: 1800,
  batteryDischargingPower: 500, pvInputPower1: 0, pvInputPower2: 0
});
assert.equal(normalNight.outage, false, 'Una noche normal con red activa no es un corte');
assert.equal(normalNight.gridHealthy, true);

const confirmedOutage = assessGridOutage({
  statusGrid: 0, gridVoltageR: 0, gridFrequency: 0,
  statusLoad: 1, acOutputActivePowerTotal: 1400,
  batteryDischargingPower: 1350, statusSolar1: 0, statusSolar2: 0,
  pvInputPower1: 0, pvInputPower2: 0
});
assert.equal(confirmedOutage.outage, true);
assert.equal(confirmedOutage.highConfidence, true);
assert.equal(confirmedOutage.gridHealthy, false);
assert.equal(confirmedOutage.solarDisconnectedOrIdle, true);

const daytimeOutage = assessGridOutage({
  statusGrid: 0, gridVoltageR: 0, gridFrequency: 0,
  statusLoad: 1, acOutputActivePowerTotal: 2100,
  batteryDischargingPower: 600, pvInputPower1: 900, pvInputPower2: 700
});
assert.equal(daytimeOutage.outage, true, 'Un corte también puede ocurrir mientras los paneles producen');
assert.equal(daytimeOutage.solarDisconnectedOrIdle, false);

const noBackupLoad = assessGridOutage({
  statusGrid: 0, gridVoltageR: 0, gridFrequency: 0,
  statusLoad: 0, acOutputActivePowerTotal: 0, batteryDischargingPower: 0
});
assert.equal(noBackupLoad.outage, false, 'Sin descarga ni consumo no se afirma que la casa esté respaldada');

const batteryEvening = assessBatteryAfterSunset({
  pvInputPower1: 40, pvInputPower2: 20,
  acOutputActivePowerTotal: 900, batteryDischargingPower: 840
}, new Date('2026-09-01T20:00:00Z'));
assert.equal(batteryEvening.active, true, 'Después de las 16:00, con solar bajo y descarga, corresponde avisar');

const batteryBeforeFour = assessBatteryAfterSunset({
  pvInputPower1: 0, pvInputPower2: 0,
  acOutputActivePowerTotal: 900, batteryDischargingPower: 840
}, new Date('2026-09-01T18:00:00Z'));
assert.equal(batteryBeforeFour.active, false, 'Antes de las 16:00 no se envía el aviso nocturno');

const solarStillActive = assessBatteryAfterSunset({
  pvInputPower1: 500, pvInputPower2: 400,
  acOutputActivePowerTotal: 1200, batteryDischargingPower: 300
}, new Date('2026-09-01T20:00:00Z'));
assert.equal(solarStillActive.active, false, 'No se afirma que se fue el sol mientras los paneles siguen produciendo');

const freshest = chooseFreshestProviderSample([
  { provider: 'isolar', received_at: '2026-09-01T19:50:00Z', canonical: { quality: { provider: 'isolar' } } },
  { provider: 'watchpower', received_at: '2026-09-01T19:58:00Z', canonical: { quality: { provider: 'watchpower' } } }
], new Date('2026-09-01T20:00:00Z'));
assert.equal(freshest.sample.provider, 'watchpower', 'El monitor elige el proveedor con la muestra más reciente');
assert.equal(freshest.stale, false);

const monitorSource = readFileSync(new URL('../server/notificationMonitor.js', import.meta.url), 'utf8');
assert.doesNotMatch(monitorSource, /loginOrigin|readInverterRealtime|logoutOrigin/, 'El monitor no debe abrir sesiones adicionales en i.Solar');
assert.match(monitorSource, /battery-after-sunset/);
assert.match(monitorSource, /latestCanonical\(site\.siteId, provider\)/);
assert.match(monitorSource, /provider === 'isolar'[\s\S]*evaluateGridOutage/, 'WatchPower no debe convertir 0 W de intercambio en un supuesto corte');

console.log('notification monitor tests: ok');
