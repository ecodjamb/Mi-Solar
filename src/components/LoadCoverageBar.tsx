import { useState } from 'react';
import type { DailyEnergy } from '../types';
import { kwh } from '../utils/energy';

type Period = 'day' | 'month';

export default function LoadCoverageBar({today,month}:{today:DailyEnergy;month:DailyEnergy}){
  const [period,setPeriod]=useState<Period>('day');
  const energy=period==='day'?today:month;
  const total=Math.max(0,energy.load);
  const grid=Math.min(total,Math.max(0,energy.gridImport));
  const local=Math.max(0,total-grid);
  const gridPercent=total>0?grid/total*100:0;
  const localPercent=total>0?100-gridPercent:0;

  return <section className="panel load-coverage-panel" aria-labelledby="load-coverage-title">
    <header>
      <div><small>Origen del consumo de la casa</small><h2 id="load-coverage-title">Cobertura del consumo</h2><p>{period==='day'?'Acumulado de hoy':'Acumulado del mes'} · total {kwh(total)}</p></div>
      <div className="load-period-selector" role="group" aria-label="Periodo del consumo">
        <button type="button" className={period==='day'?'active':''} aria-pressed={period==='day'} onClick={()=>setPeriod('day')}>Diario</button>
        <button type="button" className={period==='month'?'active':''} aria-pressed={period==='month'} onClick={()=>setPeriod('month')}>Mensual</button>
      </div>
    </header>
    <div className="load-coverage-bar" role="img" aria-label={`${localPercent.toFixed(1)}% solar o batería y ${gridPercent.toFixed(1)}% red`}>
      <i className="local-share" style={{width:`${localPercent}%`}}/><i className="grid-share" style={{width:`${gridPercent}%`}}/>
    </div>
    <div className="load-coverage-values">
      <article><span className="coverage-swatch local"/><div><small>Solar o batería</small><strong>{kwh(local)}</strong><b>{localPercent.toFixed(1)}%</b></div></article>
      <article><span className="coverage-swatch grid-source"/><div><small>Red eléctrica</small><strong>{kwh(grid)}</strong><b>{gridPercent.toFixed(1)}%</b></div></article>
      <article className="coverage-total"><div><small>Consumo total</small><strong>{kwh(total)}</strong><b>{total>0?'100%':'0%'}</b></div></article>
    </div>
    <p className="load-coverage-note">Solar o batería corresponde al consumo que no fue cubierto por importación de red.</p>
  </section>;
}
