/** Completed days are immutable for polling; today's totals are refreshed separately. */
export function needsMonthRefresh(siteDate:string, storedDates:string[], checkedAt:number|undefined, now=Date.now(), interval=12*60*60_000){
  if(checkedAt&&now-checkedAt<interval)return false;
  const dates=new Set(storedDates);
  if(!dates.size)return true;
  for(let day=1;day<Number(siteDate.slice(8));day++){
    if(!dates.has(`${siteDate.slice(0,7)}-${String(day).padStart(2,'0')}`))return true;
  }
  return false;
}

/** Replace today's aggregate, rather than adding it twice or mixing raw and hourly rows. */
export function withCurrentDay<T extends {date:string}>(days:T[],today:T,start:string,end:string){
  return [...days.filter(day=>day.date>=start&&day.date<end&&day.date!==today.date),today]
    .filter(day=>day.date>=start&&day.date<end).sort((a,b)=>a.date.localeCompare(b.date));
}

const ISOLAR_SOURCE_CADENCE_MS=5*60_000;
const ISOLAR_POST_SAMPLE_DELAY_MS=10_000;
const ISOLAR_SAVED_SAMPLE_RETRY_MS=2*60_000;

/**
 * i.Solar publica una nueva fotografía aproximadamente cada cinco minutos.
 * Cuando conocemos la hora real de la última muestra, la siguiente consulta
 * visible se ubica diez segundos después del próximo ciclo del proveedor.
 * Si la marca ya quedó atrás, la pantalla vuelve a leer la base propia a los
 * dos minutos. Esa lectura no consulta i.Solar: el lease distribuido del
 * backend conserva el único ciclo upstream de cinco minutos y evita solapes.
 */
export function nextProviderRefreshDelay(provider:string,sampledAt:number|null|undefined,now=Date.now()){
  if(provider!=='isolar'||!Number.isFinite(sampledAt))return ISOLAR_SOURCE_CADENCE_MS;
  const target=Number(sampledAt)+ISOLAR_SOURCE_CADENCE_MS+ISOLAR_POST_SAMPLE_DELAY_MS;
  const delay=target-now;
  return delay>=1_000&&delay<=ISOLAR_SOURCE_CADENCE_MS+ISOLAR_POST_SAMPLE_DELAY_MS?delay:ISOLAR_SAVED_SAMPLE_RETRY_MS;
}
