import { BatteryCharging,Bot,CircleDollarSign,Clock3,Droplets,Home,PlugZap,CloudSun,Users,WalletCards } from 'lucide-react';import type { PageKey } from '../types';
const items:[PageKey,string,any][]=[['home','Inicio',Home],['ai','Chat IA',Bot],['costs','Enel',CircleDollarSign],['water','Aguas',Droplets],['solar','Radiación',CloudSun],['programming','Automat.',Clock3],['integrations','Domótica',PlugZap],['equipment','Equipos',BatteryCharging],['family','Mis gastos',WalletCards],['users','Usuarios',Users]];

export default function MobileNav({page,setPage,waterEnabled,showUsers,showFamily,allowedMenus}:{page:PageKey;setPage:(p:PageKey)=>void;waterEnabled:boolean;showUsers:boolean;showFamily:boolean;allowedMenus?:Partial<Record<PageKey,boolean>>}){
  const visible=items.filter(([key])=>allowedMenus?.[key]!==false&&(key!=='water'||waterEnabled)&&(key!=='users'||showUsers)&&(key!=='family'||showFamily));
  return <nav className="mobile-nav" aria-label="Menú principal">{visible.map(([k,l,I])=><button type="button" key={k} className={page===k?'active':''} onClick={()=>setPage(k)}><I size={20}/><small>{l}</small></button>)}</nav>
}
