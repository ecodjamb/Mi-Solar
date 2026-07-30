import type { LucideIcon } from 'lucide-react';
export default function KpiCard({icon:Icon,label,value,detail,tone='blue'}:{icon:LucideIcon;label:string;value:string;detail:string;tone?:string}){return <article className={`kpi tone-${tone}`}><span className="kpi-icon"><Icon size={22}/></span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>}
