export type WeatherMood = 'clear'|'partly-cloudy'|'cloudy'|'rain'|'storm'|'snow'|'unknown';
export type DayPhase = 'dawn'|'day'|'sunset'|'night';
export type SeasonalTheme = 'summer'|'school'|'mateo-month'|'vichi-month'|'winter'|'caro-month'|'patriotic'|'tomas-month'|'halloween'|'christmas'|'neutral';
export type BirthdayKey = 'mateo'|'vichi'|'caro'|'tomas'|'papa'|null;

export function siteNow(){ return new Date(); }
export function chileParts(date = siteNow()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0);
  return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute')};
}
export function dayPhase(date = siteNow()):DayPhase{
  const {hour}=chileParts(date);
  if(hour>=6&&hour<9)return 'dawn';
  if(hour>=9&&hour<17)return 'day';
  if(hour>=17&&hour<20)return 'sunset';
  return 'night';
}
export function seasonalTheme(date=siteNow()):SeasonalTheme{
  const {month}=chileParts(date);
  if(month===1||month===2)return 'summer';
  if(month===3)return 'school';
  if(month===4)return 'mateo-month';
  if(month===5)return 'vichi-month';
  if(month===6||month===7)return 'winter';
  if(month===8)return 'caro-month';
  if(month===9)return 'patriotic';
  if(month===10)return 'tomas-month';
  if(month===11)return 'halloween';
  if(month===12)return 'christmas';
  return 'neutral';
}
export function birthdayToday(date=siteNow()):BirthdayKey{
  const {month,day}=chileParts(date);
  if(month===4&&day===12)return 'mateo';
  if(month===5&&day===16)return 'vichi';
  if(month===8&&day===24)return 'caro';
  if(month===10&&day===14)return 'tomas';
  if(month===12&&day===22)return 'papa';
  return null;
}
export function birthdayMessage(key:BirthdayKey){
  if(key==='mateo')return '¡Feliz cumpleaños, Mateo! 18 años, moto y buen camino.';
  if(key==='vichi')return '¡Feliz cumpleaños, Vichi! Que hoy encestes todo.';
  if(key==='caro')return '¡Feliz cumpleaños, Caro! Hoy la casa celebra contigo.';
  if(key==='tomas')return '¡Feliz cumpleaños, Tomás! Celebración con fútbol incluida.';
  if(key==='papa')return '¡Feliz cumpleaños, Papá! Hoy la energía viene con celebración.';
  return '';
}
export function panelMood(percent:number, isDay:boolean){
  if(!isDay)return {icon:'🌙',label:'Descansando'};
  if(percent<10)return {icon:'😭',label:'Muy bajo'};
  if(percent<20)return {icon:'😟',label:'Bajo'};
  if(percent<30)return {icon:'😐',label:'Moderado'};
  if(percent<50)return {icon:'🙂',label:'Bien'};
  if(percent<70)return {icon:'😄',label:'Muy bien'};
  return {icon:'🚀',label:'To the moon'};
}
export function weatherCodeToMood(code?:number):WeatherMood{
  if(code===undefined||Number.isNaN(code))return 'unknown';
  if(code===0)return 'clear';
  if([1,2].includes(code))return 'partly-cloudy';
  if(code===3||[45,48].includes(code))return 'cloudy';
  if((code>=51&&code<=67)||(code>=80&&code<=82))return 'rain';
  if(code>=95)return 'storm';
  if((code>=71&&code<=77)||(code>=85&&code<=86))return 'snow';
  return 'cloudy';
}

export function moonPhase(date=siteNow()){
  const knownNewMoon=Date.UTC(2000,0,6,18,14,0);
  const synodic=29.53058867;
  const age=((date.getTime()-knownNewMoon)/86400000%synodic+synodic)%synodic;
  if(age<1.85||age>=27.68)return {icon:'🌑',label:'Luna nueva'};
  if(age<5.54)return {icon:'🌒',label:'Creciente'};
  if(age<9.23)return {icon:'🌓',label:'Cuarto creciente'};
  if(age<12.92)return {icon:'🌔',label:'Gibosa creciente'};
  if(age<16.61)return {icon:'🌕',label:'Luna llena'};
  if(age<20.30)return {icon:'🌖',label:'Gibosa menguante'};
  if(age<23.99)return {icon:'🌗',label:'Cuarto menguante'};
  return {icon:'🌘',label:'Menguante'};
}
