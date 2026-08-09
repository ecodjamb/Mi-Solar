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
  const batteryToLoad=Math.min(local,Math.max(0,energy.batteryToLoad));
  const solarToLoad=Math.max(0,local-batteryToLoad);
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
    <div className="load-equation" aria-label="Cálculo del aporte local"><span><small>Consumo total</small><strong>{kwh(total)}</strong></span><b>−</b><span><small>Red activa (estado 1)</small><strong>{kwh(grid)}</strong></span><b>=</b><span><small>Saldo local</small><strong>{kwh(local)}</strong></span></div>
    <div className="load-coverage-bar" role="img" aria-label={`${localPercent.toFixed(1)}% solar o batería y ${gridPercent.toFixed(1)}% red`}>
      <i className="local-share" style={{width:`${localPercent}%`}}/><i className="grid-share" style={{width:`${gridPercent}%`}}/>
    </div>
    <div className="load-coverage-values">
      <article><span className="coverage-swatch local"/><div><small>Solar directo estimado</small><strong>{kwh(solarToLoad)}</strong><b>{total>0?(solarToLoad/total*100).toFixed(1):'0.0'}%</b></div></article>
      <article><span className="coverage-swatch battery-source"/><div><small>Batería hacia la casa</small><strong>{kwh(batteryToLoad)}</strong><b>{total>0?(batteryToLoad/total*100).toFixed(1):'0.0'}%</b></div></article>
      <article><span className="coverage-swatch grid-source"/><div><small>Red activa hacia la casa</small><strong>{kwh(grid)}</strong><b>{gridPercent.toFixed(1)}%</b></div></article>
      <article className="coverage-total"><div><small>Consumo total</small><strong>{kwh(total)}</strong><b>{total>0?'100%':'0%'}</b></div></article>
    </div>
    <div className="load-energy-destinations"><span><small>Producción solar total</small><strong>{kwh(energy.solar)}</strong></span><span><small>Solar estimado hacia batería</small><strong>{kwh(energy.solarToBattery)}</strong></span><span><small>Carga total de batería</small><strong>{kwh(energy.charge)}</strong></span></div>
    <p className="load-coverage-note">La red solo se integra cuando <strong>statusGrid = 1</strong>. El aporte solar directo se obtiene del saldo local después de descontar la descarga de batería; el destino de carga solar se estima muestra por muestra.</p>
  </section>;
}
