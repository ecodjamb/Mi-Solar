import { useState } from 'react';
import type { DailyEnergy } from '../types';
import { kwh } from '../utils/energy';

type Period = 'day' | 'month';

export default function LoadCoverageBar({today,month,lastUpdate}:{today:DailyEnergy;month:DailyEnergy;lastUpdate:Date|null}){
  const [period,setPeriod]=useState<Period>('day');
  const energy=period==='day'?today:month;
  const total=Math.max(0,energy.load);
  const grid=Math.min(total,Math.max(0,energy.gridImport));
  const local=Math.max(0,total-grid);
  const gridPercent=total>0?grid/total*100:0;
  const localPercent=total>0?100-gridPercent:0;
  const updatedAt=lastUpdate?lastUpdate.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}):'sin dato';

  return <section className="panel load-coverage-panel" aria-labelledby="load-coverage-title">
    <header>
      <div><small>Balance del consumo de la casa</small><h2 id="load-coverage-title">Consumo cubierto por origen</h2><p>{period==='day'?'Acumulado de hoy':'Acumulado del mes'} · última muestra {updatedAt}</p></div>
      <div className="load-period-selector" role="group" aria-label="Periodo del consumo">
        <button type="button" className={period==='day'?'active':''} aria-pressed={period==='day'} onClick={()=>setPeriod('day')}>Diario</button>
        <button type="button" className={period==='month'?'active':''} aria-pressed={period==='month'} onClick={()=>setPeriod('month')}>Mensual</button>
      </div>
    </header>
    <div className="load-equation" aria-label="Cálculo del aporte local"><span><small>Consumo total</small><strong>{kwh(total)}</strong></span><b>−</b><span><small>Consumo de red</small><strong>{kwh(grid)}</strong></span><b>=</b><span><small>Saldo solar/batería</small><strong>{kwh(local)}</strong></span></div>
    <div className="load-coverage-bar" role="img" aria-label={`${localPercent.toFixed(1)}% solar o batería y ${gridPercent.toFixed(1)}% red`}>
      <i className="local-share" style={{width:`${localPercent}%`}}/><i className="grid-share" style={{width:`${gridPercent}%`}}/>
    </div>
    <div className="load-coverage-values">
      <article><span className="coverage-swatch local"/><div><small>Solar/batería al consumo</small><strong>{kwh(local)}</strong><b>{localPercent.toFixed(1)}%</b></div></article>
      <article><span className="coverage-swatch grid-source"/><div><small>Consumo de red</small><strong>{kwh(grid)}</strong><b>{gridPercent.toFixed(1)}%</b></div></article>
      <article className="coverage-total"><div><small>Consumo total</small><strong>{kwh(total)}</strong><b>{total>0?'100%':'0%'}</b></div></article>
    </div>
    <p className="load-coverage-note"><strong>Producción solar total del periodo: {kwh(energy.solar)}.</strong> El saldo solar/batería es solamente la parte usada por la casa; el resto pudo cargar la batería o exportarse.</p>
  </section>;
}
