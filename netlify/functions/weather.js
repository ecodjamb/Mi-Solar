// Mi Solar V6 — clima actual para la ambientación del hogar.
exports.handler=async(event)=>{
 try{
  const lat=Number(event.queryStringParameters?.lat),lon=Number(event.queryStringParameters?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return {statusCode:400,body:JSON.stringify({error:'Coordenadas inválidas'})};
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude',String(lat));url.searchParams.set('longitude',String(lon));url.searchParams.set('current','temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day');url.searchParams.set('timezone','America/Santiago');
  const response=await fetch(url);if(!response.ok)throw new Error(`Weather ${response.status}`);const json=await response.json();const c=json.current||{};
  return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=600'},body:JSON.stringify({temperature:c.temperature_2m,humidity:c.relative_humidity_2m,weatherCode:c.weather_code,windSpeed:c.wind_speed_10m,isDay:c.is_day})};
 }catch(error){return {statusCode:500,body:JSON.stringify({error:error instanceof Error?error.message:'Error de clima'})};}
};
