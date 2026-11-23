import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const weather=readFileSync(new URL('../src/components/WeatherOutlook.tsx',import.meta.url),'utf8');
const chart=readFileSync(new URL('../src/components/DailyConsumptionChart.tsx',import.meta.url),'utf8');
const flow=readFileSync(new URL('../src/components/SimpleEnergyFlow.tsx',import.meta.url),'utf8');
const site=readFileSync(new URL('../src/utils/site.ts',import.meta.url),'utf8');
const serverSites=readFileSync(new URL('../server/siteProfiles.js',import.meta.url),'utf8');
const specificYield=readFileSync(new URL('../src/utils/specificYield.ts',import.meta.url),'utf8');
const yieldCard=readFileSync(new URL('../src/components/SpecificYieldCard.tsx',import.meta.url),'utf8');
const pvBar=readFileSync(new URL('../src/components/PvAccumulatedBar.tsx',import.meta.url),'utf8');

assert.doesNotMatch(app,/label="Producción solar"/,'Inicio no debe duplicar la potencia solar instantánea.');
assert.doesNotMatch(app,/label="Consumo" value=\{watts/,'Inicio no debe duplicar el consumo instantáneo.');
assert.match(app,/Ahorro del día/);
assert.match(app,/Ahorro de la semana/);
assert.match(app,/Ahorro últimos 30 días/);
assert.match(app,/Ahorro últimos 365 días/);
assert.match(app,/resolution:'day'/,'El acumulado anual debe usar el rollup diario y no descargar muestras instantáneas.');
assert.match(app,/EnergyPeriodCard label="Últimos 365 días"/);
assert.match(app,/last365Savings=last365\.solar\*tariff/,'El ahorro anual debe valorizar exactamente la producción solar real.');
assert.match(app,/dailyHistory=\{rollingDays\}/,'Las tarjetas y el gráfico deben compartir el mismo rollup diario permanente.');
assert.doesNotMatch(app,/systemEnergyToLoad/,'El ahorro solar no debe mezclarse con la descarga de batería.');
assert.doesNotMatch(app,/<HistoricalBackfill/,'La carga histórica manual debe permanecer oculta en Inicio.');

const bestIndex=app.indexOf('Mejor día del mes');
const weatherIndex=app.indexOf('<WeatherOutlook');
const healthIndex=app.indexOf('Estado del sistema');
assert.ok(bestIndex>0&&bestIndex<weatherIndex&&weatherIndex<healthIndex,'Los indicadores deben ordenar mejor día, clima y estado del sistema.');

assert.match(weather,/Lluvia desde las 00:00/);
assert.match(weather,/Lluvia próximas 24 h/);
assert.match(weather,/Pronóstico de mañana/);
assert.match(weather,/Mín\. \/ máx\. de hoy/);
assert.match(site,/Lo Barnechea · sector Plaza San Enrique/);
assert.match(site,/Quillaipe · Casa ECO Quillaipe/);
assert.match(site,/-33\.3633868/);
assert.match(site,/-41\.573491/);
assert.match(serverSites,/-33\.3633868/);
assert.match(serverSites,/-41\.573491/);

assert.match(chart,/label:'365 días',days:365/);
assert.match(chart,/Ahorro solar valorizado/);
assert.match(chart,/totals\.solar\*tariff/,'El pie del gráfico debe usar la misma producción solar que su total.');
assert.match(flow,/Math\.min\(520, Math\.max\(340, viewportWidth \* \.42\)/);
assert.match(flow,/readableLoggerFirmware/);
assert.match(specificYield,/arrayan:\[5\.98,5\.84,5\.42,4\.54,3\.47,2\.99,3\.30,3\.89,4\.69,5\.25,5\.69,6\.01\]/);
assert.match(specificYield,/'puerto-montt':\[5\.38,5\.02,4\.19,3\.07,2\.17,1\.77,2\.01,2\.57,3\.70,4\.30,4\.70,5\.07\]/);
assert.match(app,/specificYieldReferenceForDate\(profile\.key,homeDate\)/);
assert.match(app,/daySolarPotentialKwh/);
assert.match(app,/officialTodayForecast/);
assert.match(app,/officialTodayForecast\?\?liveTodayForecast/,'Inicio debe preferir el mismo pronóstico oficial que Radiación aunque aún sea provisional.');
assert.match(app,/theoreticalDayKwh\(todayRadiationKwhM2,solarModel,true,siteDate\)/);
assert.doesNotMatch(app,/todayRadiationKwhM2\*\(installedWp\/1000\)/,'Inicio no debe confundir potencial máximo ideal con producción prevista calibrada.');
assert.match(flow,/Producción prevista para hoy · configuración actual/);
assert.match(pvBar,/Producción prevista hoy · configuración actual/);
assert.match(yieldCard,/Referencia teórica de \{reference\.periodLabel\}/);

console.log('home summary and local weather tests: ok');
