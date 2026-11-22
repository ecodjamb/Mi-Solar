import { CircleGauge, Info } from 'lucide-react';
import type { DailyEnergy } from '../types';
import { assessSpecificYield, type SpecificYieldReference } from '../utils/specificYield';

type YieldString={key:'pv1'|'pv2';label:string;installedKwp:number};

function productionForString(energy:DailyEnergy,key:YieldString['key']){
  return Math.max(0,Number(energy[key]||0));
}

export default function SpecificYieldCard({energy,installedWp,strings,expectedKwh,reference,isHistorical=false,dateLabel}:{energy:DailyEnergy;installedWp:number;strings:YieldString[];expectedKwh:number;reference:SpecificYieldReference;isHistorical?:boolean;dateLabel:string}){
  const installedKwp=Math.max(0,installedWp/1000);
  const actualKwh=Math.max(0,energy.solar);
  const specificYield=installedKwp>0?actualKwh/installedKwp:0;
  const expectedSpecific=installedKwp>0?Math.max(0,expectedKwh)/installedKwp:0;
  const assessment=assessSpecificYield(actualKwh,expectedKwh);
  const comparisonLine=assessment?.line||'😐 La referencia proporcional aún no comienza.';
  const comparisonTone=assessment==null||assessment.note===0?'near':assessment.note>0?'above':'below';
  const rows=[{key:'total',label:'Instalación completa',energyKwh:actualKwh,installedKwp,specificYield},...strings.map(string=>({key:string.key,label:string.label,energyKwh:productionForString(energy,string.key),installedKwp:string.installedKwp,specificYield:string.installedKwp>0?productionForString(energy,string.key)/string.installedKwp:0}))];
  const max=Math.max(reference.dailyKwhPerKwp,expectedSpecific,...rows.map(row=>row.specificYield),.1);
  return <section className="panel specific-yield-card">
    <header><div><small>Producción específica · {dateLabel}</small><h2><CircleGauge/> Rendimiento por potencia instalada</h2>{reference.periodLabel?<p>Referencia teórica de {reference.periodLabel}: {reference.dailyKwhPerKwp.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})} kWh/kWp/día</p>:null}</div><div className={`specific-yield-verdict ${comparisonTone}`}><strong>{specificYield.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh/kWp</strong><span>{comparisonLine}</span></div></header>
    <div className="specific-yield-chart" role="img" aria-label={`Producción específica ${specificYield.toFixed(2)} kilowatt hora por kilowatt peak`}>
      {rows.map((row,index)=><div className="specific-yield-row" key={row.key}><span><b>{row.label}</b><small>{row.energyKwh.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh ÷ {row.installedKwp.toLocaleString('es-CL',{maximumFractionDigits:2})} kWp</small></span><div><i className={index===0?'total':row.key} style={{width:`${Math.min(100,row.specificYield/max*100)}%`}}/><em>{row.specificYield.toLocaleString('es-CL',{maximumFractionDigits:2})}</em><mark style={{left:`${Math.min(100,expectedSpecific/max*100)}%`}} title={`Referencia a esta hora: ${expectedSpecific.toFixed(2)} kWh/kWp`}/></div></div>)}
    </div>
    <details className="specific-yield-info">
      <summary aria-label="Ver explicación y fuentes del rendimiento"><Info/><span>Referencia y fuentes</span></summary>
      <div>
        <p><b>{isHistorical?'Referencia del día completo':'Referencia proporcional hasta esta hora'}:</b> {expectedKwh.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh · {expectedSpecific.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh/kWp.</p>
        <p>{reference.periodLabel?<>La referencia diaria de {reference.dailyKwhPerKwp.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})} kWh/kWp corresponde a <b>{reference.periodLabel}</b> en la tabla teórica mensual acordada. No utiliza la producción histórica de este inversor.</>:<>La referencia diaria de {reference.dailyKwhPerKwp.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})} kWh/kWp proviene de {reference.annualKwhPerKwp.toLocaleString('es-CL')} kWh/kWp/año. Es un promedio anual que incluye días soleados y nublados.</>}</p>
        <p>En días incompletos se distribuye según la hora dentro de la curva solar; al terminar el día se usa completa. La predicción meteorológica permanece separada en Radiación.</p>
        <a href={reference.sourceUrl} target="_blank" rel="noreferrer"><b>{reference.source}</b><small>{reference.sourceDetail}</small></a>
      </div>
    </details>
  </section>;
}
