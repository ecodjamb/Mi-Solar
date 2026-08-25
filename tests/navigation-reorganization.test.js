import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const users=readFileSync(new URL('../src/components/UsersPage.tsx',import.meta.url),'utf8');
const equipment=readFileSync(new URL('../src/components/EquipmentPage.tsx',import.meta.url),'utf8');
const sidebar=readFileSync(new URL('../src/components/Sidebar.tsx',import.meta.url),'utf8');
const mobile=readFileSync(new URL('../src/components/MobileNav.tsx',import.meta.url),'utf8');

assert.match(users,/mode="providers" embedded/);
assert.match(users,/Usuarios y credenciales/);
assert.match(app,/mode="domotics"/);
assert.match(sidebar,/\['integrations','Domótica'/);
assert.match(mobile,/\['integrations','Domótica'/);
assert.doesNotMatch(sidebar,/\['technical'/);
assert.doesNotMatch(mobile,/\['technical'/);
assert.match(equipment,/Información técnica/);
assert.match(equipment,/Auditoría completa en JSON/);

console.log('navigation reorganization tests: ok');
