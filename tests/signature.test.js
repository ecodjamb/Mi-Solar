// Mi Solar V6 — pruebas de firma Tumcapp.
// Mi Solar V5.3 — archivo actualizado para reemplazo completo del repositorio.
import assert from 'node:assert/strict';
import { calculateVrt, md5 } from '../api/lib/tumcapp.js';
import { canonicalQuery, signTuyaRequest } from '../api/lib/tuya.js';
import { buildSettingsCommands, parseInverterSettings, SETTINGS_PRESETS, settingCommandConfirmed, settingsConfirmed } from '../api/lib/isolarSettings.js';

assert.equal(md5('demo-password'), '4b4d9529148d8d9440d7e20c78287f69');

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
console.log('✓ MD5 y VRT: pruebas locales superadas.');
