import { useMemo } from 'react';
import EChart from './EChart';
import type { HistoryRow } from '../types';
import type { WeatherData } from '../services/weather';
import { pvPower, rowTimestamp, siteDateKey } from '../utils/energy';

function clock(value?: string) {
  return value?.match(/T(\d{2}:\d{2})/)?.[1] || '—';
}

function minuteOfDay(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function minuteLabel(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export default function HourlySolarForecastChart({ weather, rows, liveRow, date, forecastKwh }: {
  weather: WeatherData;
  rows: HistoryRow[];
  liveRow?: HistoryRow;
  date: string;
  forecastKwh: number;
}) {
  const sunrise = clock(weather.sunrise);
  const sunset = clock(weather.sunset);
  const chartData = useMemo(() => {
    const daylight = (weather.hourly || []).filter((item) => {
      if (!item.time.startsWith(date)) return false;
      const hour = item.time.slice(11, 16);
      return (sunrise === '—' || hour >= sunrise.slice(0, 2) + ':00') && (sunset === '—' || hour <= sunset.slice(0, 2) + ':00');
    });
    const totalRadiation = daylight.reduce((sum, item) => sum + Math.max(0, item.shortwaveWm2), 0);
    if (!daylight.length) return { points: [], lastSample: null as Date | null };
    const radiationByMinute = new Map(daylight.map((item) => [minuteOfDay(item.time.slice(11, 16)), Math.max(0, item.shortwaveWm2)]));
    const actualByMinute = new Map<number, number>();
    let lastSample: Date | null = null;
    [...rows, ...(liveRow ? [liveRow] : [])].forEach((row) => {
      const timestamp = rowTimestamp(row);
      if (!timestamp || siteDateKey(timestamp) !== date) return;
      const local = timestamp.toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false });
      const bucket = Math.floor(minuteOfDay(local) / 5) * 5;
      actualByMinute.set(bucket, Math.max(0, pvPower(row, 1) + pvPower(row, 2)) / 1000);
      if (!lastSample || timestamp > lastSample) lastSample = timestamp;
    });
    const start = Math.floor(minuteOfDay(sunrise === '—' ? daylight[0].time.slice(11, 16) : sunrise) / 5) * 5;
    const end = Math.ceil(minuteOfDay(sunset === '—' ? daylight[daylight.length - 1].time.slice(11, 16) : sunset) / 5) * 5;
    const points: Array<{ label: string; radiation: number; projected: number; actual: number | null }> = [];
    for (let minute = start; minute <= end; minute += 5) {
      const baseHour = Math.floor(minute / 60) * 60;
      const currentRadiation = radiationByMinute.get(baseHour) ?? 0;
      const nextRadiation = radiationByMinute.get(baseHour + 60) ?? currentRadiation;
      const radiation = currentRadiation + (nextRadiation - currentRadiation) * ((minute - baseHour) / 60);
      points.push({
        label: minuteLabel(minute),
        radiation,
        projected: totalRadiation > 0 ? forecastKwh * radiation / totalRadiation : 0,
        actual: actualByMinute.get(minute) ?? null
      });
    }
    return { points, lastSample };
  }, [date, forecastKwh, liveRow, rows, sunrise, sunset, weather.hourly]);
  const points = chartData.points;

  const option = useMemo(() => ({
    animationDuration: 350,
    tooltip: { trigger: 'axis', confine: true },
    legend: { top: 2, textStyle: { color: '#b8c8ce' } },
    grid: { left: 54, right: 58, top: 56, bottom: 44 },
    xAxis: { type: 'category', data: points.map((point) => point.label), axisLabel: { color: '#8298a1' }, axisLine: { lineStyle: { color: '#29444e' } } },
    yAxis: [
      { type: 'value', name: 'kW', nameTextStyle: { color: '#8298a1' }, axisLabel: { color: '#8298a1' }, splitLine: { lineStyle: { color: 'rgba(110,150,160,.12)' } } },
      { type: 'value', name: 'W/m²', nameTextStyle: { color: '#8298a1' }, axisLabel: { color: '#8298a1' }, splitLine: { show: false } }
    ],
    series: [
      { name: 'Producción prevista', type: 'line', smooth: true, data: points.map((point) => Number(point.projected.toFixed(3))), lineStyle: { width: 3, type: 'dashed', color: '#efbd34' }, itemStyle: { color: '#efbd34' }, areaStyle: { color: 'rgba(239,189,52,.12)' } },
      { name: 'Producción real PV1 + PV2', type: 'line', smooth: true, connectNulls: true, showSymbol: false, data: points.map((point) => point.actual == null ? null : Number(point.actual.toFixed(3))), lineStyle: { width: 3, color: '#4dd58a' }, itemStyle: { color: '#4dd58a' } },
      { name: 'Radiación proyectada', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, data: points.map((point) => point.radiation), lineStyle: { width: 2, color: '#54a8ff' }, itemStyle: { color: '#54a8ff' } }
    ]
  }), [points]);

  return <section className="panel forecast-chart hourly-forecast-chart">
    <header className="forecast-chart-heading"><div><small>Comportamiento de hoy · intervalos de cinco minutos</small><h2>Radiación y producción: prevista vs. real</h2><p>La curva verde usa la potencia real PV1 + PV2 y agrega la última lectura instantánea, sin comparar una hora incompleta con otra ya cerrada.</p></div><span>🌅 {sunrise} · 🌇 {sunset}{chartData.lastSample ? ` · Último PV ${chartData.lastSample.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : ''}</span></header>
    {points.length ? <EChart option={option}/> : <div className="chart-loading">Aún no hay pronóstico horario disponible para hoy.</div>}
    <p className="radiation-range-note">Actualización máxima cada cinco minutos; la lectura viva puede adelantar el último punto. “Radiación proyectada” proviene de Open‑Meteo en W/m² y “producción real” es la potencia conjunta medida en PV1 + PV2, expresada en kW.</p>
  </section>;
}
