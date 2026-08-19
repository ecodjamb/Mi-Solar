import assert from 'node:assert/strict';
import { assessGridOutage } from '../server/notificationMonitor.js';

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

console.log('notification monitor tests: ok');
