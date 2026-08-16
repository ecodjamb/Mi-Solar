import { useMemo } from 'react';
import EChart from './EChart';
import type { HistoryRow } from '../types';
import type { WeatherData } from '../services/weather';
import { integrate, pvPower, rowTimestamp, siteDateKey } from '../utils/energy';

function clock(value?: string) {
  return value?.match(/T(\d{2}:\d{2})/)?.[1] || '—';
}

export default function HourlySolarForecastChart({ weather, rows, date, forecastKwh }: {
  weather: WeatherData;
  rows: HistoryRow[];
  date: string;
  forecastKwh: number;
}) {
  const sunrise = clock(weather.sunrise);
  const sunset = clock(weather.sunset);
  const points = useMemo(() => {
    const daylight = (weather.hourly || []).filter((item) => {
      if (!item.time.startsWith(date)) return false;
      const hour = item.time.slice(11, 16);
      return (sunrise === '—' || hour >= sunrise.slice(0, 2) + ':00') && (sunset === '—' || hour <= sunset.slice(0, 2) + ':00');
    });
    const totalRadiation = daylight.reduce((sum, item) => sum + Math.max(0, item.shortwaveWm2), 0);
    return daylight.map((item) => {
      const hour = item.time.slice(11, 13);
      const actualRows = rows.filter((row) => {
        const timestamp = rowTimestamp(row);
        return Boolean(timestamp) && siteDateKey(timestamp as Date) === date && (timestamp as Date).toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false }).slice(0, 2) === hour;
      });
      return {
        label: `${hour}:00`,
        radiation: item.shortwaveWm2,
        projected: totalRadiation > 0 ? forecastKwh * Math.max(0, item.shortwaveWm2) / totalRadiation : 0,
        actual: actualRows.length > 1 ? integrate(actualRows, (row) => pvPower(row, 1) + pvPower(row, 2)) : null
      };
    });
  }, [date, forecastKwh, rows, sunrise, sunset, weather.hourly]);

  const option = useMemo(() => ({
    animationDuration: 350,
    tooltip: { trigger: 'axis', confine: true },
    legend: { top: 2, textStyle: { color: '#b8c8ce' } },
    grid: { left: 54, right: 58, top: 56, bottom: 44 },
    xAxis: { type: 'category', data: points.map((point) => point.label), axisLabel: { color: '#8298a1' }, axisLine: { lineStyle: { color: '#29444e' } } },
    yAxis: [
      { type: 'value', name: 'kWh/h', nameTextStyle: { color: '#8298a1' }, axisLabel: { color: '#8298a1' }, splitLine: { lineStyle: { color: 'rgba(110,150,160,.12)' } } },
      { type: 'value', name: 'W/m²', nameTextStyle: { color: '#8298a1' }, axisLabel: { color: '#8298a1' }, splitLine: { show: false } }
    ],
    series: [
      { name: 'Producción prevista', type: 'line', smooth: true, data: points.map((point) => Number(point.projected.toFixed(3))), lineStyle: { width: 3, type: 'dashed', color: '#efbd34' }, itemStyle: { color: '#efbd34' }, areaStyle: { color: 'rgba(239,189,52,.12)' } },
      { name: 'Producción real PV1 + PV2', type: 'line', smooth: true, connectNulls: false, data: points.map((point) => point.actual == null ? null : Number(point.actual.toFixed(3))), lineStyle: { width: 3, color: '#4dd58a' }, itemStyle: { color: '#4dd58a' } },
      { name: 'Radiación proyectada', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, data: points.map((point) => point.radiation), lineStyle: { width: 2, color: '#54a8ff' }, itemStyle: { color: '#54a8ff' } }
    ]
  }), [points]);

  return <section className="panel forecast-chart hourly-forecast-chart">
    <header className="forecast-chart-heading"><div><small>Comportamiento de hoy por hora</small><h2>Radiación y producción: prevista vs. real</h2><p>La producción prevista se distribuye según la radiación horaria de Open-Meteo. La curva verde corresponde a la energía realmente medida por PV1 + PV2.</p></div><span>🌅 Amanecer {sunrise} · 🌇 Anochecer {sunset}</span></header>
    {points.length ? <EChart option={option}/> : <div className="chart-loading">Aún no hay pronóstico horario disponible para hoy.</div>}
    <p className="radiation-range-note">Mi Solar no dispone de un sensor físico de irradiancia: “radiación proyectada” es el pronóstico meteorológico en W/m²; “real” es la producción fotovoltaica medida en kWh durante cada hora.</p>
  </section>;
}
