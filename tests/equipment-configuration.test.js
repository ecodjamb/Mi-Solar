import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ARRAYAN_CONFIGURATION_EFFECTIVE_FROM,
  ARRAYAN_LEGACY_COMPARISON_UNTIL,
  PUERTO_MONTT_CONFIGURATION_EFFECTIVE_FROM,
  PUERTO_MONTT_EQUIPMENT_CONFIGURATIONS,
  automationSiteProfile,
  configurationScaleForSample,
  siteConfigurationForDate
} from '../server/siteProfiles.js';

assert.equal(ARRAYAN_CONFIGURATION_EFFECTIVE_FROM, '2026-10-01');
assert.equal(ARRAYAN_LEGACY_COMPARISON_UNTIL, '2027-09-30');
assert.equal(PUERTO_MONTT_CONFIGURATION_EFFECTIVE_FROM, '2026-09-18');

const previous = siteConfigurationForDate('96342509120972', '2026-09-30');
const current = siteConfigurationForDate('96342509120972', '2026-10-01');
assert.equal(previous.installedKwp, 8.68);
assert.equal(previous.panelCount, 14);
assert.equal(current.installedKwp, 10.54);
assert.equal(current.panelCount, 17);
assert.deepEqual(current.strings.map(item => [item.panelCount, item.installedKwp, item.azimuthDeg, item.tiltDeg]), [
  [9, 5.58, 290, 38],
  [8, 4.96, 348, 20]
]);
assert.equal(current.strings[0].composition, '4 Ulica Solar + 5 OSDA Solar');
assert.equal(current.strings[1].composition, '8 OSDA Solar');

const profile = automationSiteProfile('96342509120972', '2026-10-02');
assert.equal(profile.configurationKey, 'arrayan-v2-10540');
assert.equal(profile.installedKwp, 10.54);
assert.equal(profile.legacyConfiguration.key, 'arrayan-v1-8680');
assert.equal(profile.legacyComparisonUntil, '2027-09-30');
assert.equal(configurationScaleForSample('96342509120972', '2026-10-01', '2026-10-02'), 1);
assert.ok(configurationScaleForSample('96342509120972', '2026-09-30', '2026-10-02') > 1.25);

const puertoPrevious = siteConfigurationForDate('96322507118828', '2026-09-17');
const puertoCurrent = siteConfigurationForDate('96322507118828', '2026-09-18');
assert.equal(puertoPrevious.installedKwp, 1.845);
assert.equal(puertoCurrent.installedKwp, 3.69);
assert.equal(puertoCurrent.panelCount, 6);
assert.equal(puertoCurrent.strings[0].composition, '6 paneles JA Solar de 615 W en serie');
assert.equal(PUERTO_MONTT_EQUIPMENT_CONFIGURATIONS.length, 2);
assert.equal(automationSiteProfile('96322507118828', '2026-10-08').configurationKey, 'puerto-montt-v2-3690');
assert.equal(configurationScaleForSample('96322507118828', '2026-09-17', '2026-09-18'), 3.69/1.845);

const equipmentUi = readFileSync(new URL('../src/components/EquipmentPage.tsx', import.meta.url), 'utf8');
assert.match(equipmentUi, /17 paneles · 10,54 kWp/);
assert.match(equipmentUi, /Pylontech \{ARRAYAN_BATTERY_BANK\.model\}/);
assert.match(equipmentUi, /ARRAYAN_INVERTER\.model/);
assert.match(equipmentUi, /Voc absoluto máximo/);
assert.match(equipmentUi, /−20 °C/);
assert.match(equipmentUi, /Historial de configuraciones/);
assert.match(equipmentUi, /6 paneles · 3,69 kWp/);

const electrical = readFileSync(new URL('../src/utils/equipmentElectrical.ts', import.meta.url), 'utf8');
assert.match(electrical, /model: 'UF5000'/);
assert.match(electrical, /nominalKwh: 20\.48/);
assert.match(electrical, /usableKwh: 19\.456/);
assert.match(electrical, /maxPvOpenCircuitVoltageV: 500/);
assert.match(electrical, /maxPvInputCurrentPerMpptA: 27/);
assert.match(electrical, /providerModel: 'VII PREMIUM PLUS Series'/);
assert.match(electrical, /firmwareMain: '69\.02'/);
assert.match(electrical, /firmwareSecondary: '02\.33'/);
assert.match(electrical, /ratedPowerVa: 12_000/);

const flowUi = readFileSync(new URL('../src/components/SimpleEnergyFlow.tsx', import.meta.url), 'utf8');
assert.match(flowUi, /inverterProfile\?:InverterProfile\|null/);
assert.match(flowUi, /Temperatura del disipador/);
assert.match(flowUi, /Capacidad de sobretensión/);
assert.match(flowUi, /Ventana de seguimiento MPPT/);
assert.ok(flowUi.indexOf("label: 'Potencia nominal'") < flowUi.indexOf("label: 'Prioridad de salida'"), 'la ficha nominal debe quedar visible antes de los valores operacionales');

const radiationUi = readFileSync(new URL('../src/components/SolarForecastPage.tsx', import.meta.url), 'utf8');
assert.match(radiationUi, /Proyección anterior · 8,68 kWp/);
assert.match(radiationUi, /30 de septiembre de 2027/);
assert.match(radiationUi, /290°\/38°/);
assert.match(radiationUi, /348°\/20°/);

const store = readFileSync(new URL('../server/automationStore.js', import.meta.url), 'utf8');
assert.match(store, /model: 'UF5000', quantity: 4, unit_power_w: null, capacity_kwh: 5\.12/);
assert.match(store, /connection: '4 baterías en paralelo'/);
assert.match(store, /model: 'Axpert VM II Premium Plus 12K 48V'/);
assert.match(store, /recordType: 'configuration-history'/);
assert.match(store, /quantity: 6, unit_power_w: 615/);

const yieldUi = readFileSync(new URL('../src/components/SpecificYieldCard.tsx', import.meta.url), 'utf8');
assert.match(yieldUi, /kWh\/kWp/);
assert.match(yieldUi, /Instalación completa/);
assert.match(yieldUi, /Referencia y fuentes/);
assert.match(yieldUi, /promedio anual que incluye días soleados y nublados/);
assert.match(yieldUi, /La predicción meteorológica permanece separada en Radiación/);
assert.match(yieldUi, /assessSpecificYield/);
const appUi = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.match(appUi, /inverterProfile=\{profile\.key==='arrayan'\?ARRAYAN_INVERTER:null\}/);
assert.match(appUi, /specificYieldReferenceForDate\(profile\.key,homeDate\)/);
assert.match(appUi, /expectedAccumulatedFromDay\(benchmarkDayKwh/);
const yieldReferenceUi = readFileSync(new URL('../src/utils/specificYield.ts', import.meta.url), 'utf8');
assert.match(yieldReferenceUi, /dailyKwhPerKwp:3\.58/);
assert.match(yieldReferenceUi, /annualKwhPerKwp:1305/);
assert.match(yieldReferenceUi, /dailyKwhPerKwp:4\.21/);
assert.match(yieldReferenceUi, /annualKwhPerKwp:1535/);
assert.match(yieldReferenceUi, /deviationPercent<-30\?-3:deviationPercent<-20\?-2:deviationPercent<-10\?-1:deviationPercent<=10\?0:deviationPercent<=20\?1:deviationPercent<=30\?2:3/);
for (const emoji of ['😭','😢','🙁','😐','🙂','😄','🤩']) assert.ok(yieldReferenceUi.includes(`'${emoji}'`), `incluye la cara ${emoji}`);
const dailyYieldUi = readFileSync(new URL('../src/components/DailyConsumptionChart.tsx', import.meta.url), 'utf8');
assert.match(dailyYieldUi, /Producción específica diaria/);
assert.match(dailyYieldUi, /specificYieldReference\(siteKey\)/);
assert.doesNotMatch(dailyYieldUi, /Referencia Chile · 4,5/);
assert.match(dailyYieldUi, /isReliableSolarAnalysisDay/);

console.log('equipment configuration history tests: ok');
