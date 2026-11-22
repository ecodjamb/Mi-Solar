import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeMonitorHistory, sanitizeMonitorRealtime } from '../server/publicMonitor.js';

const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
const monitorEntry=readFileSync(new URL('../src/monitor.tsx',import.meta.url),'utf8');
const monitorHtml=readFileSync(new URL('../monitor.html',import.meta.url),'utf8');
const vercel=readFileSync(new URL('../vercel.json',import.meta.url),'utf8');
const publicApp=readFileSync(new URL('../src/components/PublicMonitorApp.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/index.js',import.meta.url),'utf8');
const publicServer=readFileSync(new URL('../server/publicMonitor.js',import.meta.url),'utf8');

assert.match(main,/window\.location\.pathname/);
assert.match(main,/Silk\\\//);
assert.match(main,/window\.location\.replace\(['"]\/monitor['"]\)/);
assert.match(main,/get\(['"]app['"]\)===['"]1['"]/);
assert.match(main,/===['"]\/monitor['"]/);
assert.match(main,/import\(['"]\.\/components\/PublicMonitorApp['"]\)/);
assert.match(main,/React\.lazy/);
assert.match(monitorEntry,/PublicMonitorApp/);
assert.doesNotMatch(monitorEntry,/\.\/App['"]/);
assert.match(monitorHtml,/src="\/src\/monitor\.tsx"/);
assert.match(vercel,/"source": "\/monitor"[\s\S]*?"destination": "\/monitor\.html"/);
assert.match(vercel,/"source": "\/monitor\/"[\s\S]*?"destination": "\/monitor\.html"/);
assert.match(publicApp,/fetch\(['"]\/api\/public\/monitor['"]/);
assert.match(publicApp,/credentials:['"]omit['"]/);
assert.match(publicApp,/setInterval\(\(\)=>void load\(\),60_000\)/);
assert.match(publicApp,/15\*60_000/);
assert.doesNotMatch(publicApp,/fetchWeather/);
assert.doesNotMatch(publicApp,/peerSummary/);
assert.doesNotMatch(publicApp,/app-auth|loginApp|force-transmit|history-day|\/sync/);

const publicRouteIndex=api.indexOf("route === 'public/monitor'");
const sessionRouteIndex=api.indexOf("route === 'app-auth/session'");
assert.ok(publicRouteIndex>0&&publicRouteIndex<sessionRouteIndex,'la ruta pública debe resolverse antes del flujo de autenticación');
assert.match(api,/public, s-maxage=60, stale-while-revalidate=240/);
assert.match(publicServer,/latestCanonical/);
assert.match(publicServer,/providerHistorySeries/);
assert.match(publicServer,/storedForecastForDate/);
assert.doesNotMatch(publicServer,/monitorUtilityEconomics|last30SavingsClp/);
assert.doesNotMatch(publicServer,/forecastForDate\(|syncProvider|forceISolar|tumRequest|authenticate\(/);

const realtime=sanitizeMonitorRealtime({
  time:{sampled_at_utc:'2026-11-16T15:00:00.000Z'},
  pv:{mppt1_power:1200,mppt2_power:900},
  load:{active_power:650},grid:{power:0,active:false},
  battery:{power:-1200,soc:72},
  quality:{provider:'isolar'},
  password:'no-publicar',token:'no-publicar'
});
assert.equal(realtime.pvInputPower1,1200);
assert.equal(realtime.batteryCapacity,72);
assert.equal('canonical' in realtime,false);
assert.equal('password' in realtime,false);
assert.equal('token' in realtime,false);

const history=sanitizeMonitorHistory({currentTime:'2026-11-16T15:00:00.000Z',pvInputPower1:1000,aggregateHours:1,secret:'no-publicar'});
assert.equal(history.pvInputPower1,1000);
assert.equal('secret' in history,false);

console.log('public monitor tests: ok');
