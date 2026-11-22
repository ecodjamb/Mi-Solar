import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forecastAttainmentCorrection, forecastLockDue, forecastRevisionDue, forecastRevisionSlot, officialForecastRepair, validLockForProfile } from '../server/solarProjection.js';
import { cloudOpticalOpacity, theoreticalPvHour, toOpenMeteoAzimuth } from '../server/arrayanMeteorologicalProjection.js';

assert.equal(forecastLockDue(new Date('2026-08-14T01:59:00Z')), false, '21:59 de Chile todavía permite ajustar');
assert.equal(forecastLockDue(new Date('2026-08-14T02:00:00Z')), true, '22:00 de Chile fija la proyección');
assert.equal(forecastLockDue(new Date('2026-08-14T03:30:00Z')), true, 'La proyección permanece fija hasta medianoche');
assert.equal(forecastLockDue(new Date('2026-08-14T04:01:00Z')), false, 'Tras medianoche comienza la ventana del día siguiente');
assert.equal(forecastRevisionDue(new Date('2026-10-08T15:05:00Z')), true, '12:05 de Chile pertenece a un corte par');
assert.equal(forecastRevisionDue(new Date('2026-10-08T16:05:00Z')), false, '13:05 de Chile no genera un corte');
assert.equal(forecastRevisionSlot(new Date('2026-10-08T15:05:00Z')), '2026-10-08T12', 'el slot queda expresado en hora local de Chile');
assert.deepEqual(officialForecastRepair('96342509120972', '2026-10-08'), { forecastKwh: 17.08, radiationKwhM2: 4.89, lockedAt: '2026-10-08T01:00:00.000Z' }, 'reemplaza el valor manual de referencia por el cálculo algorítmico del corte del 7 de octubre a las 22:00');
assert.deepEqual(officialForecastRepair('site:2', '2026-10-08', { key: 'arrayan' }), { forecastKwh: 17.08, radiationKwhM2: 4.89, lockedAt: '2026-10-08T01:00:00.000Z' }, 'recupera el corte algorítmico aunque la pantalla use una referencia lógica de instalación');
assert.deepEqual(officialForecastRepair('96322507118828', '2026-10-08'), { forecastKwh: 7.98, radiationKwhM2: 5.57, lockedAt: '2026-10-08T01:00:00.000Z' }, 'Puerto Montt conserva el valor 7,98 kWh confirmado en pantalla');
assert.deepEqual(officialForecastRepair('site:3', '2026-10-08', { key: 'puerto-montt' }), { forecastKwh: 7.98, radiationKwhM2: 5.57, lockedAt: '2026-10-08T01:00:00.000Z' }, 'la reparación de Puerto Montt también funciona con referencia lógica');
const arrayanProfile = { key: 'arrayan', configurationKey: 'arrayan-v2-10540' };
assert.equal(validLockForProfile({ locked_at: '2026-11-16T15:00:00.258Z', sample_days: 20, slope: 8.1 }, '2026-11-17', arrayanProfile), false, 'el corte legado de 50,56 kWh no gobierna el nuevo modelo');
assert.equal(validLockForProfile({ locked_at: '2026-11-17T22:00:00.000Z', sample_days: 0, slope: 0.895 }, '2026-11-18', arrayanProfile), true, 'acepta cortes creados por el modelo meteorológico teórico');
assert.equal(validLockForProfile({ locked_at: '2026-11-16T15:00:00.258Z', sample_days: 20, slope: 8.1 }, '2026-11-16', arrayanProfile), true, 'los cortes históricos previos permanecen disponibles para trazabilidad');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(appSource, /!weather\.dailyRadiation\?\.length\)\{setStoredForecast/, 'la lectura del corte oficial no depende de Open-Meteo');
assert.match(appSource, /specificYieldReferenceForDate\(profile\.key,homeDate\)/, 'Inicio usa la referencia mensual específica de cada instalación y del día mostrado');
assert.match(appSource, /benchmarkAccumulatedToday=expectedAccumulatedFromDay/, 'el esperado a la hora actual prorratea el benchmark por las horas solares');
assert.match(appSource, /expectedKwh=\{specificYieldExpectedKwh\}/, 'la tarjeta de rendimiento recibe la referencia promedio y no el pronóstico meteorológico');
assert.match(appSource, /setStoredForecast\(null\);[\s\S]*?setRealtime/, 'al cambiar de instalación se limpia el pronóstico anterior antes de mostrar datos nuevos');
assert.match(appSource, /setStoredForecast\(value\)[\s\S]*?\},\[auth,selected\]\)/, 'el corte oficial se consulta una sola vez por instalación y no compite con el refresco meteorológico');
assert.doesNotMatch(appSource, /setStoredForecast\(value\)[\s\S]{0,180}weather\.updatedAt/, 'el clima no cancela la respuesta del corte oficial');
const forecastUi = readFileSync(new URL('../src/components/SolarForecastPage.tsx', import.meta.url), 'utf8');
const weatherService = readFileSync(new URL('../src/services/weather.ts', import.meta.url), 'utf8');
assert.match(forecastUi, /6 paneles JA Solar × 615 W · 3,69 kWp desde el 18 de septiembre de 2026/);
assert.match(forecastUi, /Captura:/);
assert.match(forecastUi, /día patrón/i);
assert.match(forecastUi, /consenso de ECMWF, GFS y GEM/);
assert.match(forecastUi, /No intervienen la producción histórica/);
assert.match(forecastUi, /no se muestra para hoy\/futuro el antiguo cálculo local/, 'El Arrayán no debe caer visualmente al modelo histórico mientras carga el pronóstico meteorológico');
assert.match(forecastUi, /DayWeatherTimeline/);
assert.match(forecastUi, /mm en el día/);
assert.match(forecastUi, /00:00 → 24:00/);
assert.match(forecastUi, /weatherDayPosition\(day\?\.sunrise\)/, 'El amanecer se posiciona proporcionalmente en la escala de 24 horas.');
assert.match(forecastUi, /weatherDayPosition\(day\?\.sunset\)/, 'El atardecer se posiciona proporcionalmente en la escala de 24 horas.');
assert.match(forecastUi, /\(hour \/ 24\) \* 100/, 'Las etiquetas horarias comparten la misma escala proporcional que los 24 bloques.');
assert.match(forecastUi, /Array\.from\(\{ length: 24 \}/, 'La línea conserva siempre sus 24 posiciones aunque falte una muestra meteorológica.');
assert.doesNotMatch(forecastUi, /className: 'rain'/, 'La lluvia horaria no debe heredar la animación global de la casa virtual.');
assert.match(weatherService, /shortwave_radiation,cloud_cover,precipitation,temperature_2m,wind_speed_10m,weather_code,is_day/);
assert.match(weatherService, /sunrise,sunset,shortwave_radiation_sum,weather_code,precipitation_sum/);
assert.match(weatherService, /shortwave_radiation_sum\?\.\[i\]\|\|0\)\/3\.6/, 'La radiación oficial de Open-Meteo se convierte de MJ/m² a kWh/m².');
assert.equal(toOpenMeteoAzimuth(290), 110, 'convierte el azimut PV1 desde norte horario al convenio de Open-Meteo');
assert.equal(toOpenMeteoAzimuth(348), 168, 'convierte el azimut PV2 cercano al norte al convenio de Open-Meteo');
const clearOpacity = cloudOpticalOpacity({ total: 5, low: 0, mid: 5, high: 5, weatherCode: 0 });
const overcastOpacity = cloudOpticalOpacity({ total: 100, low: 95, mid: 80, high: 40, weatherCode: 61, precipitation: 0.6 });
assert.ok(overcastOpacity > clearOpacity + 0.65, 'las nubes densas y bajas elevan materialmente la opacidad teórica');
const clearHour = theoreticalPvHour({ gti: 800, ghi: 760, terrestrial: 1050, totalCloud: 5, lowCloud: 0, midCloud: 5, highCloud: 5, temperature: 20, windSpeed: 8, installedKwp: 5.58 });
const cloudyHour = theoreticalPvHour({ gti: 800, ghi: 760, terrestrial: 1050, totalCloud: 100, lowCloud: 95, midCloud: 80, highCloud: 40, temperature: 20, windSpeed: 8, precipitation: 0.6, weatherCode: 61, installedKwp: 5.58 });
assert.ok(cloudyHour.energyKwh < clearHour.energyKwh * 0.45, 'la opacidad limita una GTI excesivamente optimista en un día cubierto');
assert.deepEqual(forecastAttainmentCorrection([{ date: '2026-08-01', actualKwh: 5, forecastKwh: 10, coverageHours: 24 }]), { factor: 1, sampleDays: 1 }, 'no corrige con evidencia insuficiente');
assert.deepEqual(forecastAttainmentCorrection([
  { date: '2026-08-01', actualKwh: 8, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-02', actualKwh: 9, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-03', actualKwh: 7, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-04', actualKwh: 8, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-05', actualKwh: 6, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-06', actualKwh: 0.1, forecastKwh: 10, coverageHours: 8 }
]), { factor: 0.8, sampleDays: 5 }, 'usa la mediana y descarta días incompletos');

console.log('solar projection lock tests: ok');
