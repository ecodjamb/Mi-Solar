import EChart from './EChart';
import type { DailyEnergy } from '../types';
import type { WeatherData } from '../services/weather';
import { calibrateSolarModel,theoreticalSeries,theoreticalDayKwh } from '../utils/solarForecast';

export default function SolarForecastPage({actual,weather,installedWp=8680}:{actual:DailyEnergy[];weather:WeatherData;installedWp?:number}){
 const radiation=weather.dailyRadiation||[]; const model=calibrateSolarModel(actual,radiation,installedWp);
 const theoretical=theoreticalSeries(radiation,model); const actualMap=new Map(actual.map(d=>[d.date,d.solar]));
 const history=theoretical.filter(x=>actualMap.has(x.date)); const future=theoretical.filter(x=>!actualMap.has(x.date));
 const labels=[...new Set([...history.map(x=>x.date),...future.map(x=>x.date)])];
 const option={tooltip:{trigger:'axis'},legend:{textStyle:{color:'#b8c8ce'}},grid:{left:55,right:24,top:58,bottom:48},xAxis:{type:'category',data:labels.map(d=>new Date(`${d}T12:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'short'})),axisLabel:{color:'#8298a1'},axisLine:{lineStyle:{color:'#29444e'}}},yAxis:{type:'value',name:'kWh',nameTextStyle:{color:'#8298a1'},axisLabel:{color:'#8298a1'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},series:[{name:'Producción real',type:'line',smooth:true,connectNulls:false,data:labels.map(d=>actualMap.has(d)?Number(actualMap.get(d)?.toFixed(2)):null),lineStyle:{width:3,color:'#4dd58a'},itemStyle:{color:'#4dd58a'}},{name:'Producción teórica',type:'line',smooth:true,data:labels.map(d=>{const r=radiation.find(x=>x.date===d);return r?Number(theoreticalDayKwh(r.shortwaveKwhM2,model).toFixed(2)):null}),lineStyle:{width:3,type:'dashed',color:'#efbd34'},itemStyle:{color:'#efbd34'}}]};
 return <section className="solar-forecast-page">
  <header className="page-heading"><div><small>Radiación y rendimiento</small><h1>Histórico y proyección solar</h1><p>Compara la producción real del inversor con la producción calculada desde la radiación meteorológica para El Arrayán.</p></div><div className="provider-chip">Fuente: {weather.provider||'Sin conexión meteorológica'}</div></header>
  <section className="forecast-kpis">
   <article className="panel stat"><small>Potencia instalada</small><strong>{model.installedKwp.toFixed(2)} kWp</strong></article>
   <article className="panel stat"><small>Factor histórico calibrado</small><strong>{Math.round(model.factor*100)}%</strong><p>{model.sampleDays} días útiles</p></article>
   <article className="panel stat"><small>Radiación pronosticada próxima</small><strong>{future[0]?`${radiation.find(r=>r.date===future[0].date)?.shortwaveKwhM2.toFixed(2)} kWh/m²`:'—'}</strong></article>
   <article className="panel stat"><small>Producción teórica próxima</small><strong>{future[0]?`${future[0].value.toFixed(2)} kWh`:'—'}</strong></article>
  </section>
  <section className="panel forecast-chart"><header><div><small>Histórico real vs. modelo</small><h2>Producción diaria</h2></div></header><EChart option={option}/></section>
  <section className="forecast-days">{future.map(day=><article className="panel" key={day.date}><small>{new Date(`${day.date}T12:00`).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})}</small><strong>{day.value.toFixed(2)} kWh</strong><p>Radiación: {radiation.find(r=>r.date===day.date)?.shortwaveKwhM2.toFixed(2)} kWh/m²</p></article>)}</section>
 </section>;
}
