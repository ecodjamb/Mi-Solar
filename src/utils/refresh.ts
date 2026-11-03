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
