// Mi Solar V6 — pruebas de firma Tumcapp.
// Mi Solar V5.3 — archivo actualizado para reemplazo completo del repositorio.
import assert from 'node:assert/strict';
import { calculateVrt, md5 } from '../server/tumcapp.js';
import { canonicalQuery, signTuyaRequest } from '../server/tuya.js';
import { buildSettingsCommands, parseInverterSettings, SETTINGS_PRESETS, settingCommandConfirmed, settingsConfirmed } from '../server/isolarSettings.js';
import { automationDueNow, automationNotificationMessage } from '../server/automationRunner.js';
import { validateBillImages } from '../server/utilityBillAi.js';
import { canonicalAutomationConditions } from '../server/automationStore.js';
import { billPeriodDays, calculateEnergyRate, estimateBillConsumption } from '../server/utilityBills.js';
import { archiveAggregateHours } from '../server/archive.js';

assert.equal(md5('demo-password'), '4b4d9529148d8d9440d7e20c78287f69');
const testBillImage = { name: 'pagina.jpg', dataUrl: 'data:image/jpeg;base64,YQ==' };
assert.equal(validateBillImages([testBillImage]).length, 1);
assert.throws(() => validateBillImages([]), /una y cuatro/);
assert.throws(() => validateBillImages(Array(5).fill(testBillImage)), /una y cuatro/);
assert.throws(() => validateBillImages([{ dataUrl: 'data:text/plain;base64,YQ==' }]), /formato válido/);

const requestedCondition = { id: 'rule-1', enabled: true, kind: 'between', minKwh: 15, maxKwh: 30, preset: 'sunny', runAtLocal: '21:35', dayOffset: -1 };
const postgresJsonbCondition = { preset: 'sunny', maxKwh: 30, id: 'rule-1', dayOffset: -1, minKwh: 15, kind: 'between', enabled: true, runAtLocal: '21:35' };
assert.deepEqual(canonicalAutomationConditions([postgresJsonbCondition]), canonicalAutomationConditions([requestedCondition]));
assert.deepEqual(canonicalAutomationConditions([{ ...requestedCondition, minKwh: '15', dayOffset: '-1', runAtLocal: '21:35:00' }]), [requestedCondition]);
assert.equal(calculateEnergyRate(18_600, 100), 186);
assert.equal(calculateEnergyRate(18_600, 100, 2_400), 210);
assert.notEqual(calculateEnergyRate(18_600, 100), 999.99);
assert.equal(calculateEnergyRate(null, 100), null);
assert.equal(billPeriodDays('2026-07-23', '2026-08-21'), 30);
assert.equal(billPeriodDays('2026-03-21', '2026-04-22'), 33);
assert.deepEqual(estimateBillConsumption({ reportedKwh: null, estimatedKwh: null, amountClp: 50_000, theoreticalKwh: 180 }), { kwh: 200, status: 'estimated', method: 'amount-divided-by-250' });
assert.deepEqual(estimateBillConsumption({ reportedKwh: null, estimatedKwh: null, amountClp: 0, theoreticalKwh: 180 }), { kwh: 180, status: 'estimated', method: 'misolar-archive' });
assert.deepEqual(estimateBillConsumption({ reportedKwh: null, estimatedKwh: null, amountClp: 0, theoreticalKwh: 0 }), { kwh: 1, status: 'estimated', method: 'minimum-fallback' });
assert.equal(archiveAggregateHours({ coverage_hours: 10.5 }, 'day'), 10.5);
assert.equal(archiveAggregateHours({ coverage_hours: 0.75 }, 'hour'), 0.75);
assert.equal(archiveAggregateHours({}, 'hour'), 1);
assert.equal(archiveAggregateHours({}, 'day'), 0);

// Synthetic, non-sensitive vectors generated from the algorithm extracted from i.Solar 2.4.0.
assert.equal(
  calculateVrt({ username: 'demo-user', password: md5('demo-password') }, ''),
  'a4fa1bf4334b2b6a9e4952b320e671832ab08f0c324e2c14eb47317850180f59'
);
assert.equal(canonicalQuery({source_type:'tuyaUser',source_id:'abc 123'}),'source_id=abc%20123&source_type=tuyaUser');
assert.equal(canonicalQuery({device_ids:'alpha,beta'}),'device_ids=alpha,beta');
assert.equal(signTuyaRequest({clientId:'demo-client',clientSecret:'demo-secret',accessToken:'demo-token',method:'GET',path:'/v1.0/devices/demo',timestamp:'1700000000000',nonce:'demo-nonce'}),'F1D87D3459A8FAB29A67D1BA8265DF720A8F5A7E94CC5F3909CC43CD0326BEF2');
assert.equal(
  calculateVrt({ openPage: '1', pageNum: '1', pageSize: '20', groupId: '0' }, 'demo-vrt-key'),
  '64db9ad32aebfeadc65fe1c233d17a3b93456934914b029e137298f364f8dc36'
);
assert.equal(
  calculateVrt({ deviceSn: '12345678901234' }, 'demo-vrt-key'),
  'b61ee9802eb0fbf21c01809308ba670734bac624e83c3d536accd0d586c406c7'
);
assert.deepEqual(parseInverterSettings({ parameters: [{ code: 'S017', current: 'PBDC080' }, { code: 'S05', current: 'POP01' }] }), {
  redischarge: { percent: 80, command: 'PBDC080', status: 'recognized' },
  output: { mode: 'SOL', command: 'POP01', status: 'recognized' }
});
assert.deepEqual(parseInverterSettings({ name: 'Battery Capacity Redischarge', value: 25, outputSourcePriority: 'SBU' }), {
  redischarge: { percent: 25, command: null, status: 'recognized' },
  output: { mode: 'SBU', command: null, status: 'recognized' }
});
assert.deepEqual(parseInverterSettings({ BCRD: '50 10~100', PO: '1 0,1,2' }), {
  redischarge: { percent: 50, command: null, status: 'recognized' },
  output: { mode: 'SOL', command: null, status: 'recognized' }
});
const currentSettings=parseInverterSettings({ BCRD: '50 10~100', PO: '1 0,1,2' });
assert.deepEqual(buildSettingsCommands(currentSettings,SETTINGS_PRESETS.sunny),{S017:'PBDC025',S05:'POP02'});
assert.deepEqual(buildSettingsCommands(currentSettings,SETTINGS_PRESETS.cloudy),{});
assert.equal(settingsConfirmed(currentSettings,SETTINGS_PRESETS.cloudy),true);
assert.equal(settingsConfirmed(currentSettings,SETTINGS_PRESETS.sunny),false);
assert.equal(settingCommandConfirmed(parseInverterSettings({ BCRD: '25 10~100', PO: '1 0,1,2' }),'S017',SETTINGS_PRESETS.sunny),true);
assert.equal(settingCommandConfirmed(parseInverterSettings({ BCRD: '25 10~100', PO: '1 0,1,2' }),'S05',SETTINGS_PRESETS.sunny),false);
assert.equal(settingCommandConfirmed(parseInverterSettings({ BCRD: '25 10~100', PO: '2 0,1,2' }),'S05',SETTINGS_PRESETS.sunny),true);
assert.equal(automationDueNow({runAtLocal:'22:00'},{time:'22:04'}),true);
assert.equal(automationDueNow({runAtLocal:'22:00'},{time:'22:05'}),false);
assert.equal(automationDueNow({runAtLocal:'21:37'},{time:'21:40'}),true);
assert.equal(automationDueNow({runAtLocal:'21:37'},{time:'21:42'}),false);
assert.equal(automationNotificationMessage('sunny',true),'Se realizó cambio de configuración en inversor a día soleado para mañana.');
assert.equal(automationNotificationMessage('cloudy',false),'No se modificaron parámetros del inversor, ya que mañana estará nublado.');
process.env.AUTOMATION_CREDENTIALS_KEY='test-only-key';
const {encryptCredentials,decryptCredentials}=await import('../server/secretBox.js');
const encryptedCredentials=encryptCredentials({username:'demo',password:'secret'});
assert.deepEqual(decryptCredentials(encryptedCredentials),{username:'demo',password:'secret'});
console.log('✓ MD5 y VRT: pruebas locales superadas.');
