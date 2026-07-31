import EChart from './EChart';
import type { DailyEnergy } from '../types';
import type { WeatherData } from '../services/weather';
import { calibrateSolarModel,theoreticalSeries,theoreticalDayKwh } from '../utils/solarForecast';

export default function SolarForecastPage({actual,weather,installedWp=8680,today,siteLabel='El Arrayán'}:{actual:DailyEnergy[];weather:WeatherData;installedWp?:number;today?:DailyEnergy;siteLabel?:string}){
 const radiation=weather.dailyRadiation||[];
 const model=calibrateSolarModel(actual,radiation,installedWp,today);
 const theoretical=theoreticalSeries(radiation,model);
 const actualMap=new Map(actual.map(d=>[d.date,d.solar]));
 const labels=[...new Set(theoretical.map(x=>x.date))];
 const todayKey=new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
 const future=theoretical.filter(x=>x.date>todayKey);
 const current=theoretical.find(x=>x.date===todayKey);
 const option={
  tooltip:{trigger:'axis',valueFormatter:(v:any)=>v==null?'—':`${Number(v).toFixed(2)} kWh`},
  legend:{textStyle:{color:'#b8c8ce'}},
  grid:{left:55,right:24,top:58,bottom:48},
  xAxis:{type:'category',data:labels.map(d=>new Date(`${d}T12:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'short'})),axisLabel:{color:'#8298a1'},axisLine:{lineStyle:{color:'#29444e'}}},
  yAxis:{type:'value',name:'kWh',nameTextStyle:{color:'#8298a1'},axisLabel:{color:'#8298a1'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
  series:[
   {name:'Producción real',type:'bar',data:labels.map(d=>actualMap.has(d)?Number(actualMap.get(d)?.toFixed(2)):null),itemStyle:{color:'#4dd58a',borderRadius:[5,5,0,0]}},
   {name:'Modelo por radiación',type:'line',smooth:true,connectNulls:true,data:labels.map(d=>{const r=radiation.find(x=>x.date===d);return r?Number(theoreticalDayKwh(r.shortwaveKwhM2,model,d>=todayKey).toFixed(2)):null}),lineStyle:{width:3,type:'dashed',color:'#efbd34'},itemStyle:{color:'#efbd34'}}
  ]
 };
 return <section className="solar-forecast-page">
  <header className="page-heading"><div><small>Radiación y rendimiento · {siteLabel}</small><h1>Histórico y proyección solar</h1><p>El modelo se calibra únicamente con días completos de la instalación seleccionada y la radiación meteorológica de su ubicación. El día actual se corrige con el comportamiento observado hasta este minuto.</p></div><div className="provider-chip">Fuente: {weather.provider||'Sin conexión meteorológica'}</div></header>
  <section className="forecast-kpis">
   <article className="panel stat"><small>Potencia instalada</small><strong>{model.installedKwp.toFixed(2)} kWp</strong></article>
   <article className="panel stat"><small>Factor histórico real</small><strong>{Math.round(model.factor*100)}%</strong><p>{model.sampleDays} días completos usados</p></article>
   <article className="panel stat"><small>Ajuste por rendimiento de hoy</small><strong>{Math.round(model.liveCorrection*100)}%</strong><p>Corrige nubosidad local, orientación y comportamiento real.</p></article>
   <article className="panel stat"><small>Producción prevista hoy</small><strong>{current?`${current.value.toFixed(2)} kWh`:'—'}</strong><p>Modelo ajustado con la producción real del día.</p></article>
   <article className="panel stat"><small>Error histórico mediano</small><strong>{model.sampleDays?`${model.medianErrorPct.toFixed(1)}%`:'—'}</strong></article>
  </section>
  <section className="panel forecast-chart"><header><div><small>Pasado real y modelo meteorológico</small><h2>Producción diaria: real vs. radiación</h2></div></header><EChart option={option}/></section>
  <section className="forecast-days">{future.map(day=><article className="panel" key={day.date}><small>{new Date(`${day.date}T12:00`).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})}</small><strong>{day.value.toFixed(2)} kWh</strong><p>Radiación: {radiation.find(r=>r.date===day.date)?.shortwaveKwhM2.toFixed(2)} kWh/m²</p></article>)}</section>
 </section>;
}
