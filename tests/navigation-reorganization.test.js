import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const users=readFileSync(new URL('../src/components/UsersPage.tsx',import.meta.url),'utf8');
const equipment=readFileSync(new URL('../src/components/EquipmentPage.tsx',import.meta.url),'utf8');
const sidebar=readFileSync(new URL('../src/components/Sidebar.tsx',import.meta.url),'utf8');
const mobile=readFileSync(new URL('../src/components/MobileNav.tsx',import.meta.url),'utf8');
const integrations=readFileSync(new URL('../src/components/IntegrationsPage.tsx',import.meta.url),'utf8');

assert.match(users,/mode="providers" embedded/);
assert.match(users,/Usuarios y credenciales/);
assert.match(app,/mode="domotics"/);
assert.match(sidebar,/\['integrations','Domótica'/);
assert.match(mobile,/\['integrations','Domótica'/);
assert.doesNotMatch(sidebar,/\['technical'/);
assert.doesNotMatch(mobile,/\['technical'/);
assert.match(equipment,/Información técnica/);
assert.match(equipment,/Auditoría completa en JSON/);
assert.match(integrations,/apiFast/);
assert.match(integrations,/provider-inline-feedback/);
assert.match(integrations,/provider-disconnect-confirm/);
assert.match(integrations,/Sincronización terminada:/);
assert.doesNotMatch(integrations,/window\.confirm\(`¿Confirmas desconectar/);
assert.match(users,/Editar usuario y permisos/);
assert.match(users,/Instalaciones asignadas/);
assert.match(users,/Cerrar sesión en dispositivos/);
assert.match(users,/La contraseña no cambiará/);
assert.match(users,/siteIds/);
assert.match(app,/allowedMenus/);
assert.match(sidebar,/Cuenta Enel/);
assert.match(sidebar,/Cuenta Aguas Cordillera/);

const appAuth=readFileSync(new URL('../server/appAuth.js',import.meta.url),'utf8');
assert.match(appAuth,/explicit === undefined \? appSession\.access\.permissions\.includes\(permission\) : explicit === true/);

console.log('navigation reorganization tests: ok');
