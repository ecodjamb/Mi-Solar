import { useEffect, useMemo, useState } from 'react';
import { birthdayMessage,birthdayToday,chileParts,dayPhase,moonPhase,seasonalTheme,weatherCodeToMood } from '../utils/living';
import type { WeatherData } from '../services/weather';
import arrayanDay from '../assets/scenes/arrayan-day.webp';
import arrayanDawn from '../assets/scenes/arrayan-dawn.webp';
import arrayanSunset from '../assets/scenes/arrayan-sunset.webp';
import arrayanNight from '../assets/scenes/arrayan-night.webp';
import puertoDay from '../assets/scenes/puerto-montt-day.webp';
import puertoDawn from '../assets/scenes/puerto-montt-dawn.webp';
import puertoSunset from '../assets/scenes/puerto-montt-sunset.webp';
import puertoNight from '../assets/scenes/puerto-montt-night.webp';

type SiteKey='arrayan'|'puerto-montt';
type SceneKey='dawn'|'day'|'sunset'|'night';

const SCENES:Record<SiteKey,Record<SceneKey,string>>={
  arrayan:{dawn:arrayanDawn,day:arrayanDay,sunset:arrayanSunset,night:arrayanNight},
  'puerto-montt':{dawn:puertoDawn,day:puertoDay,sunset:puertoSunset,night:puertoNight}
};

function siteFromName(name=''):SiteKey{
  const value=name.toLocaleLowerCase('es-CL');
  return value.includes('puerto')||value.includes('montt')?'puerto-montt':'arrayan';
}

function themeLabel(theme:string){
  if(theme==='summer')return 'Verano en familia';
  if(theme==='school')return 'Vuelta a clases';
  if(theme==='mateo-month')return 'Mes de Mateo';
  if(theme==='vichi-month')return 'Mes de Vichi';
  if(theme==='winter')return 'Invierno en casa';
  if(theme==='caro-month')return 'Mes de Caro';
  if(theme==='patriotic')return 'Fiestas Patrias';
  if(theme==='tomas-month')return 'Mes de Tomás';
  if(theme==='halloween')return 'Halloween';
  if(theme==='christmas')return 'Navidad';
  return 'Tu hogar hoy';
}

function DecorativeLayer({theme,birthday,site}:{theme:string;birthday:ReturnType<typeof birthdayToday>;site:SiteKey}){
  return <>
    {theme==='summer'&&<div className="living-props summer-props" aria-hidden><span>⛱️</span><span>🕶️</span><span>🏖️</span></div>}
    {theme==='school'&&<div className="living-props school-props" aria-hidden><span>🎒</span><span>📚</span></div>}
    {theme==='mateo-month'&&<div className="living-props mateo-props" aria-hidden><span>🏍️</span></div>}
    {theme==='vichi-month'&&<div className="living-props vichi-props" aria-hidden><span>🏀</span></div>}
    {theme==='caro-month'&&<div className="living-props caro-props" aria-hidden><span>💐</span></div>}
    {theme==='patriotic'&&<div className="living-props patriotic-props" aria-hidden><span>🇨🇱</span><span>🪁</span></div>}
    {theme==='tomas-month'&&<div className="living-props tomas-props" aria-hidden><span>⚽</span><span className="siu">SIUU</span></div>}
    {theme==='halloween'&&<div className="living-props halloween-props" aria-hidden><span>🎃</span><span>🕸️</span></div>}
    {theme==='christmas'&&<><div className="christmas-lights" aria-hidden>{Array.from({length:18},(_,i)=><i key={i}/>)}</div><div className="living-props christmas-props" aria-hidden><span>🎄</span><span>🎁</span></div></>}
    {site==='puerto-montt'&&<div className="living-props coastal-props" aria-hidden><span>🌊</span></div>}
    {birthday&&<div className="birthday-confetti" aria-hidden>{Array.from({length:18},(_,i)=><i key={i}/>)}</div>}
  </>;
}

export default function HouseIllustration({weather,funMode=true,siteName='Casa ECO Arrayán'}:{weather:WeatherData;funMode?:boolean;siteName?:string}){
  const phase=dayPhase();
  const scene:SceneKey=phase==='dawn'?'dawn':phase==='sunset'?'sunset':phase==='night'?'night':'day';
  const site=siteFromName(siteName);
  const mood=weatherCodeToMood(weather.weatherCode);
  const moon=moonPhase();
  const theme=seasonalTheme();
  const birthday=birthdayToday();
  const {month}=chileParts();
  const [imageOk,setImageOk]=useState(true);
  const image=SCENES[site][scene];
  const fallback=SCENES[site].day;

  useEffect(()=>{
    Object.values(SCENES).flatMap(set=>Object.values(set)).forEach(src=>{const img=new Image();img.src=src;});
  },[]);

  const phaseLabel=useMemo(()=>phase==='night'?moon.label:mood==='rain'?'Lluvia':mood==='storm'?'Tormenta':mood==='cloudy'?'Nublado':mood==='partly-cloudy'?'Parcialmente nublado':phase==='dawn'?'Amanecer':phase==='sunset'?'Atardecer':'Día', [phase,mood,moon.label]);
  const placeLabel=site==='puerto-montt'?'Casa Puerto Montt':'Casa ECO Arrayán';

  return <section className="panel house-illustration-card">
    <header className="section-head house-title-row"><div><small>Gemelo visual de tu hogar</small><h2>Casa viva · {placeLabel}</h2></div><div className="house-badges"><span className="status-dot">{phaseLabel}</span>{funMode&&<span className="season-badge">{themeLabel(theme)}</span>}</div></header>
    <div className={`house-illustration living-site-${site} scene-${scene} weather-${mood}`}>
      <img src={imageOk?image:fallback} onError={()=>setImageOk(false)} alt={`${placeLabel} durante ${phaseLabel.toLocaleLowerCase('es-CL')}`}/>
      <div className={`ambient-tint ambient-${scene}`}/>
      {(mood==='partly-cloudy'||mood==='cloudy'||mood==='rain'||mood==='storm')&&<div className="hi-clouds"><i/><i/><i/></div>}
      {(mood==='rain'||mood==='storm')&&<div className="hi-rain">{Array.from({length:34},(_,i)=><i key={i} style={{left:`${(i*17)%101}%`,animationDelay:`-${(i%9)*.11}s`}}/>)}</div>}
      {mood==='storm'&&<div className="hi-lightning">ϟ</div>}
      {phase==='night'&&<><div className="night-windows"/><div className="hi-moon" title={moon.label}>{moon.icon}</div></>}
      {(month>=5&&month<=9)&&<div className={`hi-smoke chimney-${site}`}><i/><i/><i/><i/></div>}
      {funMode&&<DecorativeLayer theme={theme} birthday={birthday} site={site}/>} 
      {birthday&&funMode&&<div className="hi-birthday">🎉 {birthdayMessage(birthday)}</div>}
      <div className="house-story"><strong>{placeLabel}</strong><span>{phaseLabel}{weather.temperature!=null?` · ${weather.temperature.toFixed(1)} °C`:''}</span></div>
      <div className="hi-weather-caption"><strong>{weather.temperature!=null?`${weather.temperature.toFixed(1)} °C`:'Clima local'}</strong><span>{weather.provider||'Hora local de Santiago'}</span></div>
    </div>
  </section>;
}
