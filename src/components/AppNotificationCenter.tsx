import {useEffect,useRef,useState} from 'react';
import {Bell,CheckCircle2,RefreshCw,X} from 'lucide-react';
import {api} from '../services/api';

type NotificationItem={id:string;source:'solar'|'family';siteLabel:string;type:string;title:string;body:string;createdAt:string;readAt?:string|null};
type NotificationResponse={notifications:NotificationItem[];updatedAt:string};
const LAST_SEEN_KEY='misolar.notifications.lastSeenAt';

export default function AppNotificationCenter(){
  const rootRef=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[items,setItems]=useState<NotificationItem[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const lastSeen=Number(localStorage.getItem(LAST_SEEN_KEY)||0);
  const unseen=items.filter(item=>Date.parse(item.createdAt)>lastSeen).length;
  const load=async()=>{
    setLoading(true);setError('');
    try{const response=await api<NotificationResponse>('notifications');setItems(response.notifications||[])}
    catch(cause){setError(cause instanceof Error?cause.message:'No se pudieron cargar las notificaciones.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),300_000);return()=>window.clearInterval(timer)},[]);
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(open&&!rootRef.current?.contains(event.target as Node))setOpen(false)};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)};
  },[open]);
  const toggle=()=>{
    setOpen(current=>{
      const next=!current;
      if(next){localStorage.setItem(LAST_SEEN_KEY,String(Date.now()));if(!items.length)void load()}
      return next;
    });
  };
  return <div className="app-notification-center" ref={rootRef}>
    <button type="button" className="notification-bell-button" aria-label="Abrir notificaciones" aria-expanded={open} onClick={toggle}><Bell/>{unseen>0?<b>{Math.min(99,unseen)}</b>:null}</button>
    {open?<section className="notification-popover" aria-label="Notificaciones de Mi Solar">
      <header><div><small>CENTRO ÚNICO</small><h2>Notificaciones</h2></div><button type="button" aria-label="Cerrar notificaciones" onClick={()=>setOpen(false)}><X/></button></header>
      <div className="notification-popover-actions"><span>{items.length} avisos</span><button type="button" disabled={loading} onClick={()=>void load()}><RefreshCw className={loading?'spin':''}/>{loading?'Actualizando…':'Actualizar'}</button></div>
      {error?<p className="notification-popover-error">{error}</p>:null}
      {!loading&&!items.length&&!error?<p className="notification-popover-empty"><CheckCircle2/>Todavía no hay notificaciones registradas.</p>:null}
      <div className="notification-popover-list">{items.map(item=><article key={item.id}><span className={`notification-source source-${item.source}`}>{item.siteLabel}</span><time>{new Date(item.createdAt).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'})}</time><b>{item.title}</b><p>{item.body}</p></article>)}</div>
    </section>:null}
  </div>;
}
