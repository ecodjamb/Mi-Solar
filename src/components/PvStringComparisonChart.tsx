import { useEffect, useMemo, useState } from 'react';
import EChart from './EChart';
import { api } from '../services/api';
import type { HistoryRow } from '../types';
import { dailyEnergy, groupDailyEnergy, integrate, pvPower } from '../utils/energy';

type Period = '1d' | '7d' | '14d' | '1m' | '6m' | '1y';
const PERIODS: Array<{ key: Period; label: string; days: number }> = [
  { key: '1d', label: '1 día', days: 1 }, { key: '7d', label: '7 días', days: 7 },
  { key: '14d', label: '14 días', days: 14 }, { key: '1m', label: '1 mes', days: 31 },
  { key: '6m', label: '6 meses', days: 183 }, { key: '1y', label: '1 año', days: 366 }
];

export default function PvStringComparisonChart({ deviceSn, siteLabel }: { deviceSn: string; siteLabel: string }) {
  const [period, setPeriod] = useState<Period>('1d');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const selected = PERIODS.find((item) => item.key === period) || PERIODS[0];

  useEffect(() => {
    if (!deviceSn) return;
    const end = new Date();
    const start = new Date(end.getTime() - selected.days * 86400000);
    const resolution = period === '1d' ? 'hour' : 'day';
    setLoading(true); setMessage('');
    api<{ list: HistoryRow[] }>(`devices/${deviceSn}/archive-series?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&resolution=${resolution}`)
      .then((result) => { setRows(result.list || []); if (!result.list?.length) setMessage('Este período aún no tiene datos respaldados.'); })
      .catch((error) => { setRows([]); setMessage(error instanceof Error ? error.message : 'No fue posible cargar este período.'); })
      .finally(() => setLoading(false));
  }, [deviceSn, period, selected.days]);

  const data = useMemo(() => {
    if (period === '1d') return rows.map((row, index) => ({
      label: String(row.currentTime || row.createTime || row.collectTime || row.dataTime || row.time || index).slice(11, 16),
      pv1: integrate([row], (item) => pvPower(item, 1)), pv2: integrate([row], (item) => pvPower(item, 2))
    }));
    return groupDailyEnergy(rows).map((day) => ({ label: day.date.slice(5), pv1: day.pv1, pv2: day.pv2 }));
  }, [period, rows]);
  const totals = useMemo(() => dailyEnergy(rows), [rows]);
  const option = useMemo(() => ({
    animationDuration: 300,
    tooltip: { trigger: 'axis', confine: true, valueFormatter: (value: unknown) => `${Number(value).toFixed(2)} kWh` },
    legend: { top: 2, textStyle: { color: '#b8c8ce' } },
    grid: { left: 52, right: 22, top: 50, bottom: 68 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 12, borderColor: '#29444e', backgroundColor: '#07171d', fillerColor: 'rgba(58,144,255,.2)', textStyle: { color: '#8ba0a8' } }],
    xAxis: { type: 'category', data: data.map((item) => item.label), axisLabel: { color: '#8298a1', hideOverlap: true }, axisLine: { lineStyle: { color: '#29444e' } } },
    yAxis: { type: 'value', name: 'kWh', nameTextStyle: { color: '#8298a1' }, axisLabel: { color: '#8298a1' }, splitLine: { lineStyle: { color: 'rgba(110,150,160,.12)' } } },
    series: [
      { name: 'PV1', type: 'line', smooth: true, showSymbol: data.length < 40, data: data.map((item) => Number(item.pv1.toFixed(3))), lineStyle: { width: 3, color: '#ffd43b' }, itemStyle: { color: '#ffd43b' } },
      { name: 'PV2', type: 'line', smooth: true, showSymbol: data.length < 40, data: data.map((item) => Number(item.pv2.toFixed(3))), lineStyle: { width: 3, color: '#38a8ff' }, itemStyle: { color: '#38a8ff' } }
    ]
  }), [data]);

  return <section className="panel pv-string-comparison"><header><div><small>Comparación de strings · {siteLabel}</small><h2>Producción PV1 vs. PV2</h2><p>Energía producida por cada entrada fotovoltaica en el período seleccionado.</p></div><div className="pv-string-totals"><span><i className="pv1"/>PV1 <b>{totals.pv1.toFixed(2)} kWh</b></span><span><i className="pv2"/>PV2 <b>{totals.pv2.toFixed(2)} kWh</b></span></div></header>
    <nav className="period-selector" aria-label="Período de comparación PV1 y PV2">{PERIODS.map((item) => <button type="button" key={item.key} className={period === item.key ? 'active' : ''} onClick={() => setPeriod(item.key)}>{item.label}</button>)}</nav>
    {loading ? <div className="chart-loading compact">Cargando {selected.label}…</div> : message ? <div className="chart-loading compact">{message}</div> : <EChart className="pv-string-chart" option={option}/>}
  </section>;
}
