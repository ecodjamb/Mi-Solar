import { Sparkles } from 'lucide-react';
export default function FunModeToggle({value,onChange}:{value:boolean;onChange:(v:boolean)=>void}){return <button className={`fun-toggle ${value?'on':''}`} onClick={()=>onChange(!value)}><Sparkles size={17}/><span>Modo entretenido</span><b>{value?'Activo':'Sobrio'}</b></button>}
