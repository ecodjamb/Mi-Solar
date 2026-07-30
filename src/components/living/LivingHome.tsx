import { Battery, House, PanelsTopLeft, RadioTower, Server } from 'lucide-react';
import type { HistoryRow, Realtime } from '../../types';
import { batteryChargePower,batteryDischargePower,batterySoc,detectPvCount,gridPower,loadPower,pvCurrent,pvPower,pvVoltage,watts } from '../../utils/energy';
import { birthdayMessage,birthdayToday,dayPhase,panelMood,seasonalTheme,type WeatherMood } from '../../utils/living';

function FlowCard({className,title,value,sub,icon:Icon}:{className:string;title:string;value:string;sub:string;icon:any}){
 return <article className={`living-card ${className}`}><Icon size={27}/><div><small>{title}</small><strong>{value}</strong><em>{sub}</em></div></article>;
}
function Decor({theme,birthday}:{theme:string;birthday:string|null}){
 const map:Record<string,string>={summer:'🏖️ ☀️',school:'🎒 📚','mateo-month':'🏍️','vichi-month':'🏀',winter:'🔥 ❄️','caro-month':'🎈',patriotic:'🇨🇱 🪁','tomas-month':'⚽',halloween:'🎃 👻',christmas:'🎄 ✨'};
 return <div className="seasonal-decor" aria-label="Decoración sorpresa">{map[theme]||''}{birthday&&<span className="birthday-decor">🎂 🎉</span>}</div>;
}
export default function LivingHome({data,history,weather,funMode=true}:{data:Realtime;history:HistoryRow[];weather:WeatherMood;funMode?:boolean}){
 const p1=pvPower(data,1),p2=pvPower(data,2),total=p1+p2,grid=gridPower(data),load=loadPower(data),charge=batteryChargePower(data),discharge=batteryDischargePower(data),soc=batterySoc(data),count=detectPvCount(data,history);
 const phase=dayPhase(),theme=seasonalTheme(),birthday=birthdayToday(),isDay=phase!=='night';
 const nominalTotal=Number(localStorage.getItem('installedWp'))||8680;
 const share1=nominalTotal?Math.max(0,p1/(nominalTotal/Math.max(1,count))*100):0;
 const share2=nominalTotal?Math.max(0,p2/(nominalTotal/Math.max(1,count))*100):0;
 const mood1=panelMood(share1,isDay),mood2=panelMood(share2,isDay);
 return <section className="panel living-panel"><header className="section-head"><div><small>Tu hogar en tiempo real</small><h2>Flujo de energía</h2></div><span className="status-dot">{phase==='night'?'Noche':phase==='dawn'?'Amaneciendo':phase==='sunset'?'Atardeciendo':'Día'}</span></header>
  <div className={`living-stage phase-${phase} weather-${weather} theme-${funMode?theme:'neutral'}`}>
   <div className="sky-layer"><span className="sun-or-moon">{phase==='night'?'🌙':'☀️'}</span>{['partly-cloudy','cloudy','rain','storm'].includes(weather)&&<span className="clouds">☁️ ☁️</span>}{(weather==='rain'||weather==='storm')&&<span className="rain">│ │ │ │ │</span>}</div>
   {funMode&&<Decor theme={theme} birthday={birthday}/>} 
   <div className="house-visual"><div className="roof">▰▰▰</div><House size={120}/><div className="windows"><i/><i/><i/><i/></div></div>
   <div className="pv-cards">
    <article className="pv-living-card"><PanelsTopLeft/><div><small>{count===2?'PV1 · MPPT 1':'Paneles'}</small><strong>{watts(p1)}</strong><em>{pvVoltage(data,1).toFixed(0)} V · {pvCurrent(data,1).toFixed(1)} A</em></div>{funMode&&<b title={mood1.label}>{mood1.icon}</b>}</article>
    {count===2&&<article className="pv-living-card"><PanelsTopLeft/><div><small>PV2 · MPPT 2</small><strong>{watts(p2)}</strong><em>{pvVoltage(data,2).toFixed(0)} V · {pvCurrent(data,2).toFixed(1)} A</em></div>{funMode&&<b title={mood2.label}>{mood2.icon}</b>}</article>}
    {count===2&&<article className="total-solar-living"><small>Total solar · PV1 + PV2</small><strong>{watts(total)}</strong><span>PV1 {total?Math.round(p1/total*100):0}% · PV2 {total?Math.round(p2/total*100):0}%</span></article>}
   </div>
   <FlowCard className="grid-live" title="Red" value={watts(Math.abs(grid))} sub={grid<0?'Exportando':'Importando'} icon={RadioTower}/>
   <FlowCard className="battery-live" title={`Batería · ${soc.toFixed(0)}%`} value={watts(Math.max(charge,discharge))} sub={charge>discharge?'Cargando':'Entregando'} icon={Battery}/>
   <FlowCard className="inverter-live" title="Inversor" value={watts(Math.max(load,total+Math.max(grid,0)+discharge))} sub="Operando" icon={Server}/>
   <FlowCard className="load-live" title="Consumo casa" value={watts(load)} sub="Ahora" icon={House}/>
   <svg className="living-lines" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
    <path className={`energy-line solar-path ${total>5?'active':''}`} d="M 250 150 C 390 150 410 245 500 245"/>
    <path className={`energy-line grid-path ${Math.abs(grid)>5?'active':''} ${grid<0?'reverse':''}`} d="M 225 410 C 360 410 395 330 500 330"/>
    <path className={`energy-line battery-path ${Math.max(charge,discharge)>5?'active':''} ${charge>discharge?'reverse':''}`} d="M 775 410 C 650 410 620 330 545 330"/>
    <path className={`energy-line home-path ${load>5?'active':''}`} d="M 520 360 C 520 420 520 465 520 515"/>
   </svg>
   {birthday&&funMode&&<div className="birthday-banner">{birthdayMessage(birthday)}</div>}
  </div>
 </section>;
}
