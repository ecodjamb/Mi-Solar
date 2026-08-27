import { useEffect, useMemo, useState } from 'react';
import EChart from './EChart';
import type { DailyEnergy } from '../types';
import type { HistoryRow } from '../types';
import type { RadiationDay, WeatherData } from '../services/weather';
import HourlySolarForecastChart from './HourlySolarForecastChart';
import { api } from '../services/api';
import { projectionCoefficients, seasonForDate, SEASON_PROFILES, theoreticalSeries, theoreticalDayKwh, type SolarModel } from '../utils/solarForecast';

type SiteKey = 'arrayan' | 'puerto-montt';
type RangeDays = 7 | 15 | 30 | 90;
type AutomationSummary = { thresholdKwh: number };
type StoredForecast = { date: string; forecastKwh: number; radiationKwhM2: number; locked: boolean; lockedAt: string | null; rawForecastKwh?: number; accuracyFactor?: number; accuracySampleDays?: number };
type ForecastRevision = { date: string; forecastKwh: number; radiationKwhM2: number; observedAt: string };
type LiveForecast = { forecastKwh: number; radiationKwhM2: number; observedAt?: string };
type StoredForecastResponse = { today: StoredForecast; tomorrow: StoredForecast; days?: StoredForecast[]; revisions?: Record<string, ForecastRevision[]>; lockTimeChile: string } | null;

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

function ForecastRevisionList({ items = [], officialKwh, liveForecast }: { items?: ForecastRevision[]; officialKwh: number; liveForecast?: LiveForecast | null }) {
  if (!items.length && !liveForecast) return <p className="forecast-revisions-empty">Sin variaciones posteriores registradas todavía.</p>;
  return <div className="forecast-revisions"><small>Seguimiento informativo · fuera del cálculo</small>{liveForecast ? <span className="forecast-revision-live"><time>Ahora</time><b>{liveForecast.forecastKwh.toFixed(2)} kWh</b><em>Open‑Meteo en línea · radiación {liveForecast.radiationKwhM2.toFixed(2)} kWh/m²{liveForecast.observedAt ? ` · ${new Date(liveForecast.observedAt).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : ''}</em></span> : null}{items.slice(-5).reverse().map((item) => {
    const delta = item.forecastKwh - officialKwh;
    const time = new Date(item.observedAt).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return <span key={`${item.observedAt}-${item.forecastKwh}`}><time>{time}</time><b>{item.forecastKwh.toFixed(2)} kWh</b><em>{delta === 0 ? 'sin cambio' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)} kWh`} · radiación {item.radiationKwhM2.toFixed(2)}</em></span>;
  })}</div>;
}

export default function SolarForecastPage({ actual, hourlyActual, liveData, weather, model, deviceSn, siteLabel = 'El Arrayán', siteKey = 'arrayan', storedForecast }: {
  actual: DailyEnergy[];
  hourlyActual: HistoryRow[];
  liveData?: HistoryRow;
  weather: WeatherData;
  model: SolarModel;
  deviceSn: string;
  siteLabel?: string;
  siteKey?: SiteKey;
  storedForecast?: StoredForecastResponse;
}) {
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [thresholdKwh, setThresholdKwh] = useState(20);
  const [thresholdSynced, setThresholdSynced] = useState(false);
  const radiation = useMemo(() => weather.dailyRadiation || [], [weather.dailyRadiation]);
  const todayKey = chileDate(new Date());
  const theoretical = useMemo(() => theoreticalSeries(radiation, model), [radiation, model]);
  const storedByDate = useMemo(() => new Map([...(storedForecast?.days || []), storedForecast?.today, storedForecast?.tomorrow].filter((item): item is StoredForecast => Boolean(item) && (Boolean(item?.locked) || String(item?.date) > todayKey)).map((item) => [item.date, item])), [storedForecast, todayKey]);
  const displayedTheoretical = useMemo(() => theoretical.map((item) => {
    const stored = storedByDate.get(item.date);
    return stored ? { ...item, value: stored.forecastKwh } : item;
  }), [storedByDate, theoretical]);
  const current = displayedTheoretical.find((item) => item.date === todayKey);
  const currentRadiation = radiationForDate(radiation, todayKey);
  const currentLiveForecast = currentRadiation ? { forecastKwh: theoreticalDayKwh(currentRadiation.shortwaveKwhM2, model, true, todayKey), radiationKwhM2: currentRadiation.shortwaveKwhM2, observedAt: weather.updatedAt } : null;
  const maximumDailyPotential = currentRadiation ? currentRadiation.shortwaveKwhM2 * model.installedKwp : null;
  const currentStored = storedForecast?.today?.date === todayKey ? storedForecast.today : null;
  const currentCutoff = currentStored?.lockedAt ? new Date(currentStored.lockedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : null;
  const currentSeason = seasonForDate(todayKey);
  const seasons = Object.values(SEASON_PROFILES[siteKey]);
  const coefficients = projectionCoefficients(todayKey, model);

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
        { name: 'Modelo estacional por radiación', type: 'line', smooth: true, connectNulls: true, data: labels.map((date) => { const stored = storedByDate.get(date); if (stored) return stored.forecastKwh; const day = radiationForDate(radiation, date); return day ? Number(theoreticalDayKwh(day.shortwaveKwhM2, model, date === todayKey, date).toFixed(2)) : null; }), lineStyle: { width: 3, type: 'dashed', color: '#efbd34' }, itemStyle: { color: '#efbd34' }, emphasis: { focus: 'series' } }
      ]
    };
  }, [actual, displayedTheoretical, model, radiation, rangeDays, storedByDate, todayKey]);

  return <section className="solar-forecast-page">
    <header className="page-heading"><div><small>Radiación y rendimiento · {siteLabel}</small><h1>Histórico y proyección solar</h1><p>El modelo se calibra con días completos respaldados en Mi Solar, la radiación meteorológica local y la estación del año. Aquí se muestra la generación solar bruta; {siteKey === 'puerto-montt' ? 'el aporte efectivo a la casa separa paneles, batería y generador de respaldo.' : 'el aporte solar efectivo a la casa y los ahorros se calculan aparte usando solamente red activa (statusGrid = 1).'}</p></div><div className="provider-chip">Fuente: {weather.provider || 'Sin conexión meteorológica'}</div></header>

    <section className="forecast-kpis">
      <article className="panel stat forecast-today-primary"><small>Producción prevista para hoy</small><strong>{current ? `${current.value.toFixed(2)} kWh` : '—'}</strong><p>Estimación oficial usada en todos los cálculos.</p><em>{currentCutoff ? `🔒 Corte fijado el ${currentCutoff} h` : `Cálculo vigente · corte programado el día anterior a las ${storedForecast?.lockTimeChile || '21:35'} h`}</em><ForecastRevisionList items={storedForecast?.revisions?.[todayKey]} officialKwh={currentStored?.forecastKwh ?? current?.value ?? 0} liveForecast={currentLiveForecast}/></article>
      <article className="panel stat"><small>Potencial máximo solar de hoy</small><strong>{maximumDailyPotential == null ? '—' : `${maximumDailyPotential.toFixed(2)} kWh`}</strong><p>Horas solares equivalentes previstas × potencia nominal: referencia ideal, sin sombras ni pérdidas históricas.</p></article>
      <article className="panel stat"><small>Factor histórico real</small><strong>{Math.round(model.factor * 100)}%</strong><p>Compara la energía realmente producida con la radiación disponible y la potencia instalada. Usa {model.sampleDays} días completos.</p></article>
      <article className="panel stat"><small>Ajuste por rendimiento de hoy</small><strong>{Math.round(model.liveCorrection * 100)}%</strong><p>Corrige solo la estimación de hoy según su producción observada, incluyendo nubosidad, orientación y sombras.</p></article>
      <article className="panel stat"><small>Error histórico mediano</small><strong>{model.sampleDays ? `${model.medianErrorPct.toFixed(1)}%` : '—'}</strong><p>Diferencia típica entre lo proyectado y lo realmente generado; mientras más bajo, más preciso es el modelo.</p></article>
    </section>

    <HourlySolarForecastChart weather={weather} rows={hourlyActual} liveRow={liveData} date={todayKey} forecastKwh={current?.value || 0}/>

    <section className="panel forecast-chart"><header className="forecast-chart-heading"><div><small>Pasado real y modelo meteorológico estacional</small><h2>Producción diaria: real vs. radiación</h2><p>La proyección pondera con mayor fuerza los días históricos de la misma época del año y mantiene el ajuste horario por sombra.</p></div><span>El cuadro de detalle permanece visible mientras el cursor siga sobre la barra.</span></header>
      <nav className="period-selector radiation-period-selector" aria-label="Período histórico visible">{RANGE_OPTIONS.map((period) => <button type="button" className={rangeDays === period.value ? 'active' : ''} aria-pressed={rangeDays === period.value} onClick={() => setRangeDays(period.value)} key={period.value}>{period.label}</button>)}</nav>
      <p className="radiation-range-note">Se muestran {rangeDays} días históricos hasta hoy y, a continuación, el pronóstico meteorológico disponible.</p>
      <EChart option={option}/>
    </section>

    <section className="panel projection-formula"><small>Cálculo usado en esta proyección</small><strong>Generación estimada = máx(0; {coefficients.slope.toFixed(2)} × radiación {coefficients.intercept >= 0 ? '+' : '−'} {Math.abs(coefficients.intercept).toFixed(2)}) × precisión reciente</strong><p>Radiación en kWh/m²/día y resultado en kWh/día. La precisión reciente compara pronósticos fijados con producción real de días completos; actualmente aplica {Math.round((storedForecast?.days?.find((item)=>!item.locked)?.accuracyFactor || 1)*100)}%. La proyección de mañana puede ajustarse hasta las {storedForecast?.lockTimeChile || '21:35'} de Chile del día anterior; después queda guardada e inamovible.</p></section>

    <section className="forecast-section-heading"><div><small>Pronóstico solar y decisión automática</small><h2>Los próximos días</h2><p>Cada estimación conversa con el umbral guardado en Programación: sobre {thresholdKwh} kWh se prepara “día soleado”; con {thresholdKwh} kWh o menos, “día nublado”.</p></div><span className={thresholdSynced ? 'threshold-synced' : 'threshold-default'}>{thresholdSynced ? 'Sincronizado con Programación' : 'Umbral predeterminado'} · {thresholdKwh} kWh</span></section>
    <section className="forecast-days">{displayedTheoretical.filter((item) => item.date > todayKey).map((day) => {
      const radiationDay = radiationForDate(radiation, day.date);
      const stored = storedByDate.get(day.date);
      const weatherMood = weatherVisual(radiationDay?.weatherCode);
      const sunny = day.value > thresholdKwh;
      return <article className={`panel forecast-day-card ${sunny ? 'sunny' : 'cloudy'}`} key={day.date}><div className="forecast-weather-icon" role="img" aria-label={weatherMood.label}>{weatherMood.icon}</div><div><small>{new Date(`${day.date}T12:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</small><b>{weatherMood.label}</b></div><strong>{day.value.toFixed(2)} kWh</strong><p>Radiación: {(stored?.radiationKwhM2 ?? radiationDay?.shortwaveKwhM2)?.toFixed(2) ?? '—'} kWh/m²</p><em>{stored?.locked ? `🔒 Proyección y configuración fijadas a las ${new Date(stored.lockedAt || '').toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' })}` : sunny ? '☀️ Configuración prevista: día soleado' : '☁️ Configuración prevista: día nublado'}</em>{stored?.locked?<ForecastRevisionList items={storedForecast?.revisions?.[day.date]} officialKwh={stored.forecastKwh}/>:null}</article>;
    })}</section>

    <section className="season-information"><header className="forecast-section-heading"><div><small>Referencia anual</small><h2>Cómo cambia el sistema durante el año</h2><p>Estos cuadros son informativos. Resumen el comportamiento típico de la instalación por estación; la proyección diaria siempre utiliza radiación y datos reales.</p></div><span>🌦️ Modelo de cuatro estaciones</span></header>
      <section className="season-model-grid" aria-label={`Modelo estacional informativo de ${siteLabel}`}>{seasons.map((season) => {
        const visual = SEASON_VISUALS[season.key];
        return <article className={`panel season-model-card ${season.key === currentSeason ? 'active' : ''}`} key={season.key}><div className="season-photo" role="img" aria-label={`Paisaje solar de ${season.name}`} style={{ backgroundPosition: visual.position }}><span>{visual.icon}</span></div><div className="season-card-content"><small>{season.months}</small><h2>{visual.icon} {season.name}</h2><strong>{season.generation[0] === season.generation[1] ? season.generation[0].toFixed(1) : `${season.generation[0]}–${season.generation[1]}`} kWh/día</strong>{season.generationNote ? <p>{season.generationNote}</p> : null}<dl><div><dt>Horas de sol</dt><dd>{season.sunHours[0] === season.sunHours[1] ? season.sunHours[0] : `${season.sunHours[0]}–${season.sunHours[1]}`} h</dd></div><div><dt>Radiación</dt><dd>{season.radiation[0]}–{season.radiation[1]} kWh/m²/día</dd></div><div><dt>Consumo nocturno</dt><dd>{season.nightLoad[0] === season.nightLoad[1] ? season.nightLoad[0] : `${season.nightLoad[0]}–${season.nightLoad[1]}`} kWh</dd></div>{season.balance ? <div><dt>Balance diario referencial</dt><dd>{season.balance[0] === season.balance[1] ? season.balance[0] : `${season.balance[0]} a ${season.balance[1]}`} kWh</dd></div> : null}</dl><p>{season.summary}</p><em>{season.battery}</em>{season.key === currentSeason ? <b>Estación actual</b> : null}</div></article>;
      })}</section>
    </section>
  </section>;
}
