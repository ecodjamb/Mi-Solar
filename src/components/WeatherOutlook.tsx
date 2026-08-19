import type { WeatherData } from '../services/weather';

const SITE_TZ='America/Santiago';

function condition(code?:number){
  if(code==null)return 'Sin pronóstico';
  if(code>=95)return 'Tormentas';
  if(code>=71)return 'Nieve';
  if(code>=51)return 'Lluvia';
  if(code>=45)return 'Niebla';
  if(code>=2)return 'Parcialmente nublado';
  return 'Despejado';
}

export default function WeatherOutlook({weather}:{weather:WeatherData}){
  const now=Date.now();
  const next24=(weather.hourly||[]).filter(hour=>{const time=new Date(hour.time).getTime();return time>=now-60*60_000&&time<=now+24*60*60_000});
  const temperatures=next24.map(hour=>Number(hour.temperature)).filter(Number.isFinite);
  const rainHours=next24.filter(hour=>Number(hour.precipitation||0)>0.1);
  const rainTotal=rainHours.reduce((sum,hour)=>sum+Number(hour.precipitation||0),0);
  const minTemp=temperatures.length?Math.min(...temperatures):null;
  const maxTemp=temperatures.length?Math.max(...temperatures):null;
  const firstRain=rainHours[0]?new Date(rainHours[0].time):null;
  const rainText=rainTotal>0?`Sí: se estiman ${rainTotal.toFixed(1)} mm${firstRain?` desde aproximadamente las ${firstRain.toLocaleTimeString('es-CL',{timeZone:SITE_TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}`:''}.`:'No se pronostica lluvia significativa en las próximas 24 horas.';

  return <section className={`panel weather-card ${weather.error?'weather-warning':''}`}>
    <small>Condición actual · {weather.provider||'sin proveedor'}</small>
    <strong>{weather.temperature!=null?`${weather.temperature.toFixed(1)} °C`:'Sin dato climático'}</strong>
    <p>{weather.humidity!=null?`${condition(weather.weatherCode)} · Humedad ${weather.humidity}% · Nubes ${Number(weather.cloudCover||0).toFixed(0)}% · Viento ${Number(weather.windSpeed||0).toFixed(0)} km/h`:'No llegó información meteorológica.'}</p>
    <div className="weather-outlook"><h4>Próximas 24 horas</h4><p><b>Lluvia:</b> {rainText}</p><p><b>Temperatura:</b> {minTemp!=null&&maxTemp!=null?`entre ${minTemp.toFixed(1)} °C y ${maxTemp.toFixed(1)} °C.`:'pronóstico aún no disponible.'}</p></div>
    {weather.updatedAt&&<small>Actualizado: {new Date(weather.updatedAt).toLocaleString('es-CL',{timeZone:SITE_TZ})}</small>}{weather.error&&<small className="error-text">{weather.error}</small>}
  </section>;
}
