import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/services/api.ts',import.meta.url),'utf8');
const costs=readFileSync(new URL('../src/components/CostsPage.tsx',import.meta.url),'utf8');

test('el flujo instantáneo no espera la reparación histórica',()=>{
  const switchStart=app.indexOf('function switchDevice');
  const switchEnd=app.indexOf('async function refreshAll',switchStart);
  const body=app.slice(switchStart,switchEnd);
  assert.ok(body.indexOf("void refreshAll(sn,'if-stale')")>=0);
  assert.ok(body.indexOf("void refreshAll(sn,'if-stale')")<body.indexOf('repairTodaySilently(sn)'));
  assert.match(body,/setTimeout\(\(\)=>void repairTodaySilently\(sn\),10_000\)/);
});

test('solo las rutas del proveedor usan la cola regulada',()=>{
  assert.match(api,/function usesProviderLane/);
  assert.match(api,/return usesProviderLane\(path\) \? enqueue<T>\(path, options, false\) : executeInternal<T>\(path, options\)/);
  assert.match(api,/const inFlightInternalReads = new Map/);
});

test('las secciones secundarias y los gráficos pesados se cargan bajo demanda',()=>{
  assert.match(app,/const CostsPage=lazySection\(\(\)=>import\('\.\/components\/CostsPage'\)\)/);
  assert.match(app,/const RecentEnergyChart=lazySection\(\(\)=>import\('\.\/components\/RecentEnergyChart'\)\)/);
  assert.match(app,/homeAnalyticsReady&&<Suspense/);
});

test('Enel no atribuye el respaldo mensual a un proveedor',()=>{
  assert.doesNotMatch(costs,/respaldo permanente de (?:i\.Solar|Mi Solar)/i);
  assert.match(costs,/Actualizando datos del período/);
});

test('la identidad visible corresponde a la sesión autenticada',()=>{
  assert.match(app,/appIdentity\.user\?\.displayName/);
  assert.match(app,/@\{appIdentity\.user\?\.username\} · sesión activa/);
});
