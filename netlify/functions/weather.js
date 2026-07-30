const json=(statusCode,body,cache='public,max-age=600')=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':cache,'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});

function normalizeOpenMeteo(payload){
 const c=payload.current||{};
 const hourly=(payload.hourly?.time||[]).map((time,i)=>({
  time,
  shortwaveWm2:Number(payload.hourly?.shortwave_radiation?.[i]||0),
  cloudCover:Number(payload.hourly?.cloud_cover?.[i]||0),
  precipitation:Number(payload.hourly?.precipitation?.[i]||0)
 }));
 const dailyRadiation=(payload.daily?.time||[]).map((date,i)=>({
  date,
  shortwaveKwhM2:Number(payload.daily?.shortwave_radiation_sum?.[i]||0),
  weatherCode:Number(payload.daily?.weather_code?.[i]||0)
 }));
 return {
  temperature:Number(c.temperature_2m),humidity:Number(c.relative_humidity_2m),weatherCode:Number(c.weather_code),
  windSpeed:Number(c.wind_speed_10m),isDay:Number(c.is_day),cloudCover:Number(c.cloud_cover),precipitation:Number(c.precipitation),
  sunrise:payload.daily?.sunrise?.[0],sunset:payload.daily?.sunset?.[0],hourly,dailyRadiation,
  provider:'Open-Meteo',updatedAt:c.time||new Date().toISOString()
 };
}

async function openMeteo(lat,lon){
 const url=new URL('https://api.open-meteo.com/v1/forecast');
 url.searchParams.set('latitude',String(lat));url.searchParams.set('longitude',String(lon));
 url.searchParams.set('current','temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day,cloud_cover,precipitation');
 url.searchParams.set('hourly','shortwave_radiation,cloud_cover,precipitation,weather_code');
 url.searchParams.set('daily','sunrise,sunset,shortwave_radiation_sum,weather_code');
 url.searchParams.set('past_days','31');url.searchParams.set('forecast_days','7');
 url.searchParams.set('timezone','America/Santiago');
 const response=await fetch(url,{headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error(`Open-Meteo HTTP ${response.status}`);
 return normalizeOpenMeteo(await response.json());
}

async function metNorway(lat,lon){
 const url=`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
 const response=await fetch(url,{headers:{'User-Agent':'MiSolar/6.2 contact: app-owner','Accept':'application/json'}});
 if(!response.ok)throw new Error(`MET Norway HTTP ${response.status}`);
 const payload=await response.json(); const row=payload.properties?.timeseries?.[0];
 const instant=row?.data?.instant?.details||{}; const next=row?.data?.next_1_hours||{};
 return {temperature:Number(instant.air_temperature),humidity:Number(instant.relative_humidity),windSpeed:Number(instant.wind_speed)*3.6,
  cloudCover:Number(instant.cloud_area_fraction),precipitation:Number(next.details?.precipitation_amount||0),weatherCode:0,isDay:undefined,
  provider:'MET Norway (respaldo)',updatedAt:row?.time||new Date().toISOString(),hourly:[],dailyRadiation:[]};
}

exports.handler=async(event)=>{
 const lat=Number(event.queryStringParameters?.lat),lon=Number(event.queryStringParameters?.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return json(400,{error:'Coordenadas inválidas'},'no-store');
 try{return json(200,await openMeteo(lat,lon));}
 catch(primaryError){
  try{const fallback=await metNorway(lat,lon);return json(200,{...fallback,error:`Open-Meteo no respondió: ${primaryError.message}`});}
  catch(fallbackError){return json(502,{error:`Clima no disponible. ${primaryError.message}; ${fallbackError.message}`},'no-store');}
 }
};
