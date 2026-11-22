import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { DailyEnergy } from '../types';
import type { HistoryRow } from '../types';
import type { RadiationDay, WeatherData } from '../services/weather';
import HourlySolarForecastChart from './HourlySolarForecastChart';
import { api } from '../services/api';
import { ARRAYAN_CONFIGURATION_EFFECTIVE_FROM, ARRAYAN_LEGACY_COMPARISON_UNTIL, LEGACY_ARRAYAN_SEASON_PROFILES, seasonForDate, SEASON_PROFILES, theoreticalSeries, theoreticalDayKwh, type SolarModel } from '../utils/solarForecast';

const EChart=lazy(()=>import('./EChart'));

type SiteKey = 'arrayan' | 'puerto-montt';
type RangeDays = 7 | 15 | 30 | 90;
type AutomationSummary = { thresholdKwh: number };
type StoredForecast = { date: string; forecastKwh: number; legacyForecastKwh?: number | null; radiationKwhM2: number; locked: boolean; lockedAt: string | null; rawForecastKwh?: number; accuracyFactor?: number; accuracySampleDays?: number; sourceLabel?: string; calibrationMethod?: string; referenceDate?: string|null; referenceRadiationKwhM2?: number|null; referenceEnergyKwh?: number|null; cloudOpacityPct?:number|null; modelSpreadPct?:number|null; theoreticalPerformanceRatio?:number|null; cloudTransmissionPct?:number|null; dominantCloudLayer?:string|null };
type ForecastRevision = { date: string; forecastKwh: number; legacyForecastKwh?: number | null; radiationKwhM2: number; observedAt: string };
type StoredForecastResponse = { today: StoredForecast | null; tomorrow: StoredForecast | null; days?: StoredForecast[]; revisions?: Record<string, ForecastRevision[]>; lockTimeChile: string; revisionIntervalHours?: number } | null;

const RANGE_OPTIONS: Array<{ value: RangeDays; label: string }> = [
  { value: 7, label: '7 días' },
  { value: 15, label: '15 días' },
  { value: 30, label: '1 mes' },
  { value: 90, label: '3 meses' }
];

const SEASON_VISUALS = {
  winter: { icon: '❄️', position: '0% center' },
  spring: { icon: '🌸', position: '33.333% center' },
  summer: { icon: '☀️', position: '66.667% center' },
  autumn: { icon: '🍂', position: '100% center' }
} as const;

function chileDate(date: Date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

function subtractDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() - days);
  return chileDate(date);
}

function weatherVisual(code = 0) {
  if (code === 0) return { icon: '☀️', label: 'Despejado' };
  if (code <= 2) return { icon: '🌤️', label: 'Sol y algunas nubes' };
  if (code === 3) return { icon: '☁️', label: 'Nublado' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Neblina' };
  if (code >= 95) return { icon: '⛈️', label: 'Tormentas' };
  if ((code >= 71 && code <= 77) || code >= 85) return { icon: '🌨️', label: 'Nieve o aguanieve' };
  if (code >= 51) return { icon: '🌧️', label: 'Lluvia' };
  return { icon: '🌥️', label: 'Nubosidad variable' };
}

function radiationForDate(radiation: RadiationDay[], date: string) {
  return radiation.find((item) => item.date === date);
}

function hourWeatherVisual(hour: NonNullable<WeatherData['hourly']>[number]) {
  const code = Number(hour.weatherCode || 0);
  const raining = Number(hour.precipitation || 0) > 0.1 || (code >= 51 && code <= 99);
  const daylight = hour.isDay == null ? Number(hour.shortwaveWm2 || 0) > 0 : Number(hour.isDay) === 1;
  if (raining) return { icon: '🌧️', className: 'weather-rain', label: `lluvia ${Number(hour.precipitation || 0).toFixed(1)} mm` };
  if (!daylight && (Number(hour.cloudCover || 0) >= 30 || code === 1 || code === 2 || code === 3 || code === 45 || code === 48)) return { icon: '☁️', className: 'weather-cloud', label: 'nublado durante la noche' };
  if (!daylight) return { icon: '🌙', className: 'weather-night', label: 'noche despejada' };
  if (Number(hour.cloudCover || 0) >= 65 || code === 3 || code === 45 || code === 48) return { icon: '☁️', className: 'weather-cloud', label: 'nublado' };
  if (Number(hour.cloudCover || 0) >= 30 || code === 1 || code === 2) return { icon: '🌤️', className: 'weather-mixed', label: 'sol y nubes' };
  return { icon: '☀️', className: 'weather-sun', label: 'soleado' };
}

function weatherClock(value?: string) {
  const match = String(value || '').match(/T(\d{2}:\d{2})/);
  return match?.[1] || '—';
}

function weatherDayPosition(value?: string) {
  const match = String(value || '').match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Math.max(0, Math.min(100, (minutes / (24 * 60)) * 100));
}

function DayWeatherTimeline({ weather, date }: { weather: WeatherData; date: string }) {
  const available = (weather.hourly || []).filter((hour) => hour.time.startsWith(date));
  const byHour = new Map(available.map((hour) => [Number(hour.time.slice(11, 13)), hour]));
  const hourSlots = Array.from({ length: 24 }, (_, hour) => byHour.get(hour));
  const hours = hourSlots.filter((hour): hour is NonNullable<typeof hour> => Boolean(hour));
  const day = radiationForDate(weather.dailyRadiation || [], date);
  const rainMm = day?.precipitationSumMm ?? hours.reduce((sum, hour) => sum + Number(hour.precipitation || 0), 0);
  const sunrisePosition = weatherDayPosition(day?.sunrise);
  const sunsetPosition = weatherDayPosition(day?.sunset);
  if (!hours.length) return <div className="day-weather-timeline is-unavailable"><span>La línea meteorológica por hora aún no está disponible.</span></div>;
  return <section className="day-weather-timeline" aria-label={`Pronóstico meteorológico por hora para ${date}`}>
    <header><span>00:00 → 24:00</span><strong>💧 {rainMm.toFixed(1)} mm en el día</strong></header>
    <div className="weather-hour-strip" role="list">{hourSlots.map((hour, index) => {
      if (!hour) return <span className="weather-missing" role="listitem" aria-label={`${String(index).padStart(2, '0')}:00: sin datos`} title="Sin datos para esta hora" key={`${date}-${index}`} />;
      const visual = hourWeatherVisual(hour);
      const hourLabel = hour.time.slice(11, 16);
      const description = `${hourLabel}: ${visual.label}; nubes ${Number(hour.cloudCover || 0).toFixed(0)}%; precipitación ${Number(hour.precipitation || 0).toFixed(1)} mm`;
      return <span className={visual.className} role="listitem" aria-label={description} title={description} key={hour.time}><b aria-hidden="true">{visual.icon}</b></span>;
    })}</div>
    <div className="weather-time-axis" aria-hidden="true">{[0, 6, 12, 18, 24].map((hour) => <time key={hour} style={{ left: `${(hour / 24) * 100}%` }}>{String(hour).padStart(2, '0')}</time>)}</div>
    <div className="weather-sun-track" aria-label={`Amanecer ${weatherClock(day?.sunrise)}; atardecer ${weatherClock(day?.sunset)}`}>
      {sunrisePosition == null ? null : <span className="sunrise" style={{ left: `${sunrisePosition}%` }}><b>🌅</b><time>{weatherClock(day?.sunrise)}</time></span>}
      {sunsetPosition == null ? null : <span className="sunset" style={{ left: `${sunsetPosition}%` }}><b>🌇</b><time>{weatherClock(day?.sunset)}</time></span>}
    </div>
    <footer>🌙 noche despejada · ☁️ nubes · 🌧️ lluvia · Open-Meteo</footer>
  </section>;
}

function ForecastRevisionList({ items = [], officialKwh }: { items?: ForecastRevision[]; officialKwh: number }) {
  if (!items.length) return <p className="forecast-revisions-empty">Aún no hay un corte posterior de dos horas. El valor oficial permanece sin cambios.</p>;
  return <div className="forecast-revisions"><small>Seguimiento persistente cada 2 horas · fuera del cálculo oficial</small>{items.slice(-12).reverse().map((item) => {
    const delta = item.forecastKwh - officialKwh;
    const time = new Date(item.observedAt).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return <span key={`${item.observedAt}-${item.forecastKwh}`}><time>{time}</time><b>{item.forecastKwh.toFixed(2)} kWh</b><em>{delta === 0 ? 'sin cambio' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)} kWh`} · anterior {item.legacyForecastKwh == null ? '—' : `${item.legacyForecastKwh.toFixed(2)} kWh`} · radiación {item.radiationKwhM2.toFixed(2)}</em></span>;
  })}</div>;
}

export default function SolarForecastPage({ actual, hourlyActual, liveData, weather, model, legacyModel, deviceSn, siteLabel = 'El Arrayán', siteKey = 'arrayan', storedForecast, energyProvider = 'isolar' }: {
  actual: DailyEnergy[];
  hourlyActual: HistoryRow[];
  liveData?: HistoryRow;
  weather: WeatherData;
  model: SolarModel;
  legacyModel?: SolarModel | null;
  deviceSn: string;
  siteLabel?: string;
  siteKey?: SiteKey;
  storedForecast?: StoredForecastResponse;
  energyProvider?: 'isolar' | 'watchpower';
}) {
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [thresholdKwh, setThresholdKwh] = useState(20);
  const [thresholdSynced, setThresholdSynced] = useState(false);
  const radiation = useMemo(() => weather.dailyRadiation || [], [weather.dailyRadiation]);
  const todayKey = chileDate(new Date());
  const theoretical = useMemo(() => theoreticalSeries(radiation, model), [radiation, model]);
  const storedByDate = useMemo(() => new Map([...(storedForecast?.days || []), storedForecast?.today, storedForecast?.tomorrow]
    .filter((item): item is StoredForecast => Boolean(item) && (Boolean(item?.locked) || String(item?.date) > todayKey || (siteKey === 'arrayan' && String(item?.date) === todayKey)))
    .map((item) => [item.date, item])), [siteKey, storedForecast, todayKey]);
  const displayedTheoretical = useMemo(() => {
    const series = theoretical.flatMap((item) => {
      const stored = storedByDate.get(item.date);
      if (stored) return [{ ...item, value: stored.forecastKwh }];
      // En El Arrayán no se muestra para hoy/futuro el antiguo cálculo local
      // basado en rendimiento histórico mientras llega la respuesta meteorológica.
      return siteKey === 'arrayan' && item.date >= todayKey ? [] : [item];
    });
    const present = new Set(series.map((item) => item.date));
    for (const stored of storedByDate.values()) {
      if (!present.has(stored.date)) series.push({ date: stored.date, value: stored.forecastKwh });
    }
    return series.sort((left, right) => left.date.localeCompare(right.date));
  }, [siteKey, storedByDate, theoretical, todayKey]);
  const current = displayedTheoretical.find((item) => item.date === todayKey);
  const currentRadiation = radiationForDate(radiation, todayKey);
  const legacyToday = currentRadiation && legacyModel && todayKey <= ARRAYAN_LEGACY_COMPARISON_UNTIL ? theoreticalDayKwh(currentRadiation.shortwaveKwhM2, legacyModel, false, todayKey) : null;
  const maximumDailyPotential = currentRadiation ? currentRadiation.shortwaveKwhM2 * model.installedKwp : null;
  const currentStored = storedForecast?.today?.date === todayKey ? storedForecast.today : null;
  const currentCutoff = currentStored?.lockedAt ? new Date(currentStored.lockedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : null;
  const configurationSummary=siteKey==='puerto-montt'?'6 paneles JA Solar × 615 W · 3,69 kWp desde el 18 de septiembre de 2026.':'17 paneles · 10,54 kWp desde el 1 de octubre de 2026.';
  const forecastCapturedAt=currentStored?.lockedAt?new Date(currentStored.lockedAt).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'}):weather.updatedAt?new Date(weather.updatedAt).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'}):'sin hora disponible';
  const forecastSource=currentStored?.sourceLabel||(siteKey==='arrayan'?'Open-Meteo · consenso ECMWF/GFS/GEM + radiación inclinada y opacidad por capas':'Open-Meteo · radiación de onda corta + histórico validado de Mi Solar');
  const currentSeason = seasonForDate(todayKey);
  const seasons = Object.values(SEASON_PROFILES[siteKey]);

  useEffect(() => {
    let active = true;
    setThresholdSynced(false);
    if (!deviceSn) return () => { active = false; };
    api<AutomationSummary>(`devices/${deviceSn}/automation`).then((value) => {
      if (!active) return;
      setThresholdKwh(Math.max(0, Math.min(60, Number(value.thresholdKwh) || 20)));
      setThresholdSynced(true);
    }).catch(() => active && setThresholdSynced(false));
    return () => { active = false; };
  }, [deviceSn]);

  const option = useMemo(() => {
    const startKey = subtractDays(todayKey, rangeDays - 1);
    const visibleDays = displayedTheoretical.filter((item) => item.date >= startKey);
    const labels = visibleDays.map((item) => item.date);
    const actualMap = new Map(actual.map((item) => [item.date, item.solar]));
    return {
      tooltip: {
        trigger: 'axis',
        triggerOn: 'mousemove|click',
        confine: true,
        enterable: false,
        hideDelay: 180,
        transitionDuration: 0.12,
        axisPointer: { type: 'shadow', snap: true },
        valueFormatter: (value: unknown) => value == null ? '—' : `${Number(value).toFixed(2)} kWh`
      },
      legend: { textStyle: { color: '#b8c8ce' } },
      grid: { left: 55, right: 24, top: 58, bottom: 48 },
      xAxis: {
        type: 'category',
        data: labels.map((date) => new Date(`${date}T12:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })),
        axisLabel: { color: '#8298a1' },
        axisLine: { lineStyle: { color: '#29444e' } }
      },
      yAxis: { type: 'value', name: 'kWh', nameTextStyle: { color: '#8298a1' }, axisLabel: { color: '#8298a1' }, splitLine: { lineStyle: { color: 'rgba(110,150,160,.12)' } } },
      series: [
        { name: 'Producción real', type: 'bar', data: labels.map((date) => actualMap.has(date) ? Number(actualMap.get(date)?.toFixed(2)) : null), itemStyle: { color: '#4dd58a', borderRadius: [5, 5, 0, 0] }, emphasis: { focus: 'series' } },
        { name: siteKey==='puerto-montt'?'Proyección actual · 6 paneles':'Proyección actual · 17 paneles', type: 'line', smooth: true, connectNulls: true, data: labels.map((date) => { const stored = storedByDate.get(date); if (stored) return stored.forecastKwh; const day = radiationForDate(radiation, date); return day ? Number(theoreticalDayKwh(day.shortwaveKwhM2, model, date === todayKey, date).toFixed(2)) : null; }), lineStyle: { width: 3, type: 'dashed', color: '#efbd34' }, itemStyle: { color: '#efbd34' }, emphasis: { focus: 'series' } },
        ...(legacyModel ? [{ name: 'Proyección anterior · 8,68 kWp', type: 'line', smooth: true, connectNulls: true, data: labels.map((date) => { const stored = storedByDate.get(date); if (stored?.legacyForecastKwh != null) return stored.legacyForecastKwh; const day = radiationForDate(radiation, date); return date >= ARRAYAN_CONFIGURATION_EFFECTIVE_FROM && date <= ARRAYAN_LEGACY_COMPARISON_UNTIL && day ? Number(theoreticalDayKwh(day.shortwaveKwhM2, legacyModel, false, date).toFixed(2)) : null; }), lineStyle: { width: 2, type: 'dotted', color: '#a78bfa' }, itemStyle: { color: '#a78bfa' }, emphasis: { focus: 'series' } }] : [])
      ]
    };
  }, [actual, displayedTheoretical, legacyModel, model, radiation, rangeDays, siteKey, storedByDate, todayKey]);

  return <section className="solar-forecast-page">
    <header className="page-heading"><div><small>Radiación y rendimiento · {siteLabel}</small><h1>Histórico y proyección solar</h1><p>{siteKey==='arrayan'?'La proyección oficial es meteorológica y teórica: combina la capacidad instalada, la inclinación y orientación de cada string, radiación inclinada, nubosidad por capas, opacidad, lluvia, temperatura y viento. La producción histórica y la lectura viva se muestran para comparar, pero no modifican el pronóstico.':`El modelo usa la radiación meteorológica local y el día patrón de Puerto Montt. Aquí se muestra la generación solar bruta; el aporte efectivo a la casa separa paneles, batería y generador de respaldo.`}</p></div><div className="provider-chip">Energía: {energyProvider==='watchpower'?'WatchPower':'i.Solar'} · clima: {weather.provider || 'sin conexión'}</div></header>

    <section className="forecast-kpis">
      <article className="panel stat forecast-today-primary"><small>Producción prevista para hoy · configuración actual</small><strong>{current ? `${current.value.toFixed(2)} kWh` : '—'}</strong><p>{configurationSummary}</p><span className="forecast-capture-source"><b>Captura:</b> {forecastCapturedAt}<br/><b>Fuente:</b> {forecastSource}</span><DayWeatherTimeline weather={weather} date={todayKey}/>{(currentStored?.legacyForecastKwh??legacyToday)!=null?<span className="legacy-projection-note">Con la configuración anterior: <b>{(currentStored?.legacyForecastKwh??legacyToday)?.toFixed(2)} kWh</b></span>:null}<em>{currentCutoff ? `🔒 Pronóstico oficial inmutable · fijado el ${currentCutoff} h` : `Cálculo vigente · corte programado el día anterior a las ${storedForecast?.lockTimeChile || '22:00'} h`}</em><ForecastRevisionList items={storedForecast?.revisions?.[todayKey]} officialKwh={currentStored?.forecastKwh ?? current?.value ?? 0}/></article>
      <article className="panel stat"><small>Potencial máximo solar de hoy</small><strong>{maximumDailyPotential == null ? '—' : `${maximumDailyPotential.toFixed(2)} kWh`}</strong><p>Horas solares equivalentes previstas × potencia nominal: referencia ideal, sin sombras ni pérdidas históricas.</p></article>
      <article className="panel stat"><small>{siteKey==='arrayan'?'Opacidad nubosa del corte':'Factor histórico real'}</small><strong>{siteKey==='arrayan'?(currentStored?.cloudOpacityPct==null?'—':`${currentStored.cloudOpacityPct.toFixed(0)}%`):`${Math.round(model.factor * 100)}%`}</strong><p>{siteKey==='arrayan'?'Calculada con nubes bajas, medias y altas, precipitación y código meteorológico. Las nubes bajas tienen mayor peso óptico.':`Compara la energía realmente producida con la radiación disponible y la potencia instalada. Usa ${model.sampleDays} días completos.`}</p></article>
      <article className="panel stat"><small>{siteKey==='arrayan'?'Dispersión entre modelos':'Ajuste por rendimiento de hoy'}</small><strong>{siteKey==='arrayan'?(currentStored?.modelSpreadPct==null?'—':`${currentStored.modelSpreadPct.toFixed(0)}%`):`${Math.round(model.liveCorrection * 100)}%`}</strong><p>{siteKey==='arrayan'?'Diferencia entre ECMWF, GFS y GEM. Es incertidumbre meteorológica; nunca se corrige con la producción real del día.':'Corrige solo la estimación de hoy según su producción observada, incluyendo nubosidad, orientación y sombras.'}</p></article>
      <article className="panel stat"><small>Error histórico mediano</small><strong>{model.sampleDays ? `${model.medianErrorPct.toFixed(1)}%` : '—'}</strong><p>Diferencia típica entre lo proyectado y lo realmente generado; mientras más bajo, más preciso es el modelo.</p></article>
    </section>

    <HourlySolarForecastChart weather={weather} rows={hourlyActual} liveRow={liveData} date={todayKey} forecastKwh={current?.value || 0}/>

    <section className="panel forecast-chart"><header className="forecast-chart-heading"><div><small>Pasado real y modelos meteorológicos</small><h2>Producción diaria: real vs. ambas configuraciones</h2><p>{siteKey==='puerto-montt'?'Desde el 18 de septiembre, la línea amarilla usa 6 paneles JA Solar de 615 W en serie (3,69 kWp). La referencia del 8 de octubre calibra la relación entre radiación y generación sin recorte por batería llena.':'Desde el 1 de octubre, la línea amarilla usa 17 paneles y la geometría de ambos strings. La línea violeta conserva la proyección anterior para medir la mejora real.'}</p></div><span>{siteKey==='puerto-montt'?'La configuración vigente queda identificada desde el 18 de septiembre de 2026.':'La comparación anterior se mantiene hasta el 30 de septiembre de 2027.'}</span></header>
      <nav className="period-selector radiation-period-selector" aria-label="Período histórico visible">{RANGE_OPTIONS.map((period) => <button type="button" className={rangeDays === period.value ? 'active' : ''} aria-pressed={rangeDays === period.value} onClick={() => setRangeDays(period.value)} key={period.value}>{period.label}</button>)}</nav>
      <p className="radiation-range-note">Se muestran {rangeDays} días históricos hasta hoy y, a continuación, el pronóstico meteorológico disponible.</p>
      <Suspense fallback={<div className="cost-chart-loading">Preparando gráfico…</div>}><EChart option={option}/></Suspense>
    </section>

    <section className="panel projection-formula"><small>Cálculo usado en esta proyección</small>{siteKey==='puerto-montt'?<><strong>Generación estimada = radiación prevista a las 22:00 × 3,69 kWp × rendimiento observado el 08-10-2026</strong><p>El 8 de octubre es el día patrón porque hubo consumo durante toda la jornada y los paneles no quedaron limitados por baterías llenas. {model.referenceEnergyKwh!=null&&model.referenceRadiationKwhM2!=null?`Referencia observada: ${model.referenceEnergyKwh.toFixed(2)} kWh producidos con ${model.referenceRadiationKwhM2.toFixed(2)} kWh/m² de radiación.`:'Mi Solar incorporará automáticamente el cierre completo del 8 de octubre en cuanto quede consolidado en el histórico.'} Para cada día futuro sólo cambia la radiación meteorológica capturada la noche anterior.</p></>:<><strong>Generación teórica = Σ hora y string (radiación inclinada efectiva × kWp instalado × pérdidas de diseño × factor térmico)</strong><p>La radiación inclinada se calcula por separado para PV1 (5,58 kWp, 290°/38°) y PV2 (4,96 kWp, 348°/20°). Mi Solar toma el consenso de ECMWF, GFS y GEM y limita la radiación según la opacidad combinada de nubes bajas, medias y altas, niebla, lluvia y tormenta. No intervienen la producción histórica, los kWh acumulados del día ni correcciones en vivo.</p><small className="legacy-method-fineprint">La configuración anterior de 8,68 kWp se conserva sólo como comparación visual hasta el 30-09-2027.</small></>}</section>

    <section className="forecast-section-heading"><div><small>Pronóstico solar y decisión automática</small><h2>Los próximos días</h2><p>Cada estimación conversa con el umbral guardado en Programación: sobre {thresholdKwh} kWh se prepara “día soleado”; con {thresholdKwh} kWh o menos, “día nublado”.</p></div><span className={thresholdSynced ? 'threshold-synced' : 'threshold-default'}>{thresholdSynced ? 'Sincronizado con Programación' : 'Umbral predeterminado'} · {thresholdKwh} kWh</span></section>
    <section className="forecast-days">{displayedTheoretical.filter((item) => item.date > todayKey).map((day) => {
      const radiationDay = radiationForDate(radiation, day.date);
      const stored = storedByDate.get(day.date);
      const weatherMood = weatherVisual(radiationDay?.weatherCode);
      const sunny = day.value > thresholdKwh;
      return <article className={`panel forecast-day-card ${sunny ? 'sunny' : 'cloudy'}`} key={day.date}><div className="forecast-weather-icon" role="img" aria-label={weatherMood.label}>{weatherMood.icon}</div><div><small>{new Date(`${day.date}T12:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</small><b>{weatherMood.label}</b></div><strong>{day.value.toFixed(2)} kWh</strong><p>Radiación Open-Meteo: {(stored?.radiationKwhM2 ?? radiationDay?.shortwaveKwhM2)?.toFixed(2) ?? '—'} kWh/m²</p><DayWeatherTimeline weather={weather} date={day.date}/><em>{stored?.locked ? `🔒 Proyección y configuración fijadas a las ${new Date(stored.lockedAt || '').toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' })}` : sunny ? '☀️ Configuración prevista: día soleado' : '☁️ Configuración prevista: día nublado'}</em>{stored?.locked?<ForecastRevisionList items={storedForecast?.revisions?.[day.date]} officialKwh={stored.forecastKwh}/>:null}</article>;
    })}</section>

    <section className="season-information"><header className="forecast-section-heading"><div><small>Referencia anual</small><h2>Cómo cambia el sistema durante el año</h2><p>Estos cuadros son informativos. Resumen el comportamiento típico de la instalación por estación; {siteKey==='arrayan'?'la proyección diaria oficial usa exclusivamente meteorología y configuración física.':'la proyección diaria utiliza radiación y el día patrón configurado.'}</p></div><span>🌦️ Modelo de cuatro estaciones</span></header>
      <section className="season-model-grid" aria-label={`Modelo estacional informativo de ${siteLabel}`}>{seasons.map((season) => {
        const visual = SEASON_VISUALS[season.key];
        const legacy=siteKey==='arrayan'?LEGACY_ARRAYAN_SEASON_PROFILES[season.key]:null;
        return <article className={`panel season-model-card ${season.key === currentSeason ? 'active' : ''}`} key={season.key}><div className="season-photo" role="img" aria-label={`Paisaje solar de ${season.name}`} style={{ backgroundPosition: visual.position }}><span>{visual.icon}</span></div><div className="season-card-content"><small>{season.months}</small><h2>{visual.icon} {season.name}</h2><strong>{season.generation[0] === season.generation[1] ? season.generation[0].toFixed(1) : `${season.generation[0]}–${season.generation[1]}`} kWh/día</strong>{legacy?<small className="legacy-season-value">Anterior: {legacy.generation[0]===legacy.generation[1]?legacy.generation[0].toFixed(1):`${legacy.generation[0]}–${legacy.generation[1]}`} kWh/día</small>:null}{season.generationNote ? <p>{season.generationNote}</p> : null}<dl><div><dt>Horas de sol</dt><dd>{season.sunHours[0] === season.sunHours[1] ? season.sunHours[0] : `${season.sunHours[0]}–${season.sunHours[1]}`} h</dd></div><div><dt>Radiación</dt><dd>{season.radiation[0]}–{season.radiation[1]} kWh/m²/día</dd></div><div><dt>Consumo nocturno</dt><dd>{season.nightLoad[0] === season.nightLoad[1] ? season.nightLoad[0] : `${season.nightLoad[0]}–${season.nightLoad[1]}`} kWh</dd></div>{season.balance ? <div><dt>Balance diario referencial</dt><dd>{season.balance[0] === season.balance[1] ? season.balance[0] : `${season.balance[0]} a ${season.balance[1]}`} kWh</dd></div> : null}</dl><p>{season.summary}</p><em>{season.battery}</em>{season.key === currentSeason ? <b>Estación actual</b> : null}</div></article>;
      })}</section>
    </section>
  </section>;
}
