import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiChatToolDomains } from '../server/aiChat.js';

const server=readFileSync(new URL('../server/aiChat.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/components/AiChatPage.tsx',import.meta.url),'utf8');
const sidebar=readFileSync(new URL('../src/components/Sidebar.tsx',import.meta.url),'utf8');
const mobile=readFileSync(new URL('../src/components/MobileNav.tsx',import.meta.url),'utf8');

for(const domain of ['energia','calidad_datos','proveedores','enel','aguas','equipos','radiacion','domotica','piscina','notificaciones','familia'])assert.ok(aiChatToolDomains.includes(domain));
assert.match(server,/modo estrictamente de solo lectura/);
assert.match(server,/Nunca propongas que ejecutaste cambios/);
assert.match(server,/store: false/);
assert.doesNotMatch(server,/credentials_cipher|device_identifier_cipher|refresh_token_hash|password_hash/);
assert.match(server,/require.*site|ensureSiteAccess/);
assert.match(app,/page==='ai'.*<AiChatPage/);
assert.match(sidebar,/\['ai','Chat IA'/);
assert.match(mobile,/\['ai','Chat IA'/);
assert.match(page,/Nueva conversación/);
assert.match(page,/Analizar hoy/);
assert.match(page,/apiSingle<ChatResponse>\('ai\/chat'/);

console.log('ai chat tests: ok');
