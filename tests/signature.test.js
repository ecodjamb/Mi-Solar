// Mi Solar V6 — pruebas de firma Tumcapp.
// Mi Solar V5.3 — archivo actualizado para reemplazo completo del repositorio.
import assert from 'node:assert/strict';
import { calculateVrt, md5 } from '../api/lib/tumcapp.js';
import { canonicalQuery, selectEnergyCode, signTuyaRequest } from '../api/lib/tuya.js';

assert.equal(md5('demo-password'), '4b4d9529148d8d9440d7e20c78287f69');

// Synthetic, non-sensitive vectors generated from the algorithm extracted from i.Solar 2.4.0.
assert.equal(
  calculateVrt({ username: 'demo-user', password: md5('demo-password') }, ''),
  'a4fa1bf4334b2b6a9e4952b320e671832ab08f0c324e2c14eb47317850180f59'
);
assert.equal(canonicalQuery({source_type:'tuyaUser',source_id:'abc 123'}),'source_id=abc%20123&source_type=tuyaUser');
assert.equal(selectEnergyCode([{code:'cur_power'},{code:'add_ele'}]),'add_ele');
assert.equal(selectEnergyCode([{code:'switch_1'}]),'');
assert.equal(signTuyaRequest({clientId:'demo-client',clientSecret:'demo-secret',accessToken:'demo-token',method:'GET',path:'/v1.0/devices/demo',timestamp:'1700000000000',nonce:'demo-nonce'}),'F1D87D3459A8FAB29A67D1BA8265DF720A8F5A7E94CC5F3909CC43CD0326BEF2');
assert.equal(
  calculateVrt({ openPage: '1', pageNum: '1', pageSize: '20', groupId: '0' }, 'demo-vrt-key'),
  '64db9ad32aebfeadc65fe1c233d17a3b93456934914b029e137298f364f8dc36'
);
assert.equal(
  calculateVrt({ deviceSn: '12345678901234' }, 'demo-vrt-key'),
  'b61ee9802eb0fbf21c01809308ba670734bac624e83c3d536accd0d586c406c7'
);
console.log('✓ MD5 y VRT: pruebas locales superadas.');
