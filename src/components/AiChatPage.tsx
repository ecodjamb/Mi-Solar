import { useMemo, useRef, useState } from 'react';
import { Bot, Check, Clipboard, Database, Eraser, Lightbulb, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { apiSingle } from '../services/api';

type ChatMessage={id:string;role:'user'|'assistant';content:string;sources?:Source[];model?:string};
type Source={dominio:string;sitio_id?:number;desde?:string|null;hasta?:string|null;proveedor?:string|null};
type ChatResponse={message:string;sources:Source[];model:string;readOnly:boolean};

const suggestions=[
  {label:'Analizar hoy',prompt:'Analiza el desempeño energético de hoy. Revisa producción solar, consumo, red, batería y calidad de los datos. Dame conclusiones y anomalías concretas.'},
  {label:'Detectar vacíos',prompt:'Revisa la calidad de los datos de los últimos 3 días. Identifica vacíos, fuentes utilizadas y si los gráficos tienen cobertura suficiente.'},
  {label:'Comparar fuentes',prompt:'Compara el estado reciente de i.Solar y WatchPower: última lectura, sincronizaciones, errores y coherencia. Indica cuál fuente parece más confiable ahora.'},
  {label:'Cuenta Enel',prompt:'Analiza el período actual de Enel, las lecturas, la proyección Mi Solar y la proyección del medidor. Explica cualquier diferencia y qué revisar.'},
  {label:'Automatización piscina',prompt:'Revisa la configuración, estado y eventos recientes de la automatización solar de la piscina. Indica bloqueos o mejoras recomendadas.'},
  {label:'Plan de mejoras',prompt:'Usando datos recientes y el estado del sistema, propón las 5 mejoras más valiosas para Mi Solar, ordenadas por impacto y facilidad de verificación.'}
];

const capabilityCards=[
  ['Energía','Producción, consumo, red, batería e históricos'],['Costos','Enel, Aguas, lecturas y proyecciones'],
  ['Calidad','Vacíos, atrasos, fuentes y sincronización'],['Operación','Equipos, domótica, piscina y alarmas'],
  ['Familia','Cuentas y préstamos según tus permisos'],['Decisiones','Conclusiones, hipótesis y mejoras verificables']
];

const makeId=()=>`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function AiChatPage({siteId,siteLabel,provider}:{siteId?:number;siteLabel:string;provider:'isolar'|'watchpower'}){
  const [messages,setMessages]=useState<ChatMessage[]>([{id:'welcome',role:'assistant',content:`Hola. Soy el analista IA de Mi Solar. Puedo consultar la base histórica de ${siteLabel}, comparar fuentes, revisar cuentas, automatizaciones y calidad de datos. Mi acceso es únicamente de lectura: no puedo cambiar configuraciones ni borrar información.`}]);
  const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState('');
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const conversation=useMemo(()=>messages.filter(message=>message.id!=='welcome').map(({role,content})=>({role,content})),[messages]);

  async function ask(text=draft){
    const question=text.trim();if(!question||busy||!siteId)return;
    const userMessage:ChatMessage={id:makeId(),role:'user',content:question};
    const next=[...conversation,{role:'user' as const,content:question}];
    setMessages(value=>[...value,userMessage]);setDraft('');setBusy(true);setError('');
    try{
      const result=await apiSingle<ChatResponse>('ai/chat',{method:'POST',body:JSON.stringify({messages:next,siteId,siteLabel,provider})},90_000);
      setMessages(value=>[...value,{id:makeId(),role:'assistant',content:result.message,sources:result.sources,model:result.model}]);
    }catch(cause){setError(cause instanceof Error?cause.message:'No fue posible consultar el Chat IA.');}
    finally{setBusy(false);window.setTimeout(()=>inputRef.current?.focus(),50)}
  }

  function clear(){setMessages([{id:'welcome',role:'assistant',content:`Conversación nueva. Pregúntame lo que quieras analizar de ${siteLabel}. Consultaré la base de datos antes de responder.`}]);setError('');setDraft('')}
  async function copy(message:ChatMessage){try{await navigator.clipboard.writeText(message.content);setCopied(message.id);window.setTimeout(()=>setCopied(''),1600)}catch{setError('No fue posible copiar la respuesta.')};}

  return <section className="ai-chat-page">
    <header className="ai-chat-hero panel"><div className="ai-chat-orb"><Bot/></div><div><small>ANALISTA DE DATOS · SOLO LECTURA</small><h1>Chat IA</h1><p>Pregunta, compara y toma decisiones usando los datos reales guardados en Mi Solar.</p></div><span className="ai-readonly-badge"><ShieldCheck/>Protegido</span></header>
    <section className="ai-capability-grid">{capabilityCards.map(([title,description])=><article className="panel" key={title}><Sparkles/><span><b>{title}</b><small>{description}</small></span></article>)}</section>
    <section className="ai-chat-shell panel">
      <header className="ai-chat-context"><span><Database/><span><b>{siteLabel}</b><small>Contexto actual · {provider==='isolar'?'i.Solar':'WatchPower'} · base permanente</small></span></span><button type="button" onClick={clear} disabled={busy}><Eraser/>Nueva conversación</button></header>
      <div className="ai-suggestions" aria-label="Preguntas sugeridas">{suggestions.map(item=><button type="button" key={item.label} onClick={()=>void ask(item.prompt)} disabled={busy||!siteId}><Lightbulb/>{item.label}</button>)}</div>
      <div className="ai-messages" aria-live="polite">{messages.map(message=><article className={`ai-message ${message.role}`} key={message.id}><div className="ai-avatar">{message.role==='assistant'?<Bot/>:<span>Tú</span>}</div><div className="ai-message-body"><pre>{message.content}</pre>{message.role==='assistant'&&message.id!=='welcome'&&<footer><span>{message.sources?.length?`${message.sources.length} consulta${message.sources.length===1?'':'s'} a la base`:'Análisis general'}{message.model?` · ${message.model}`:''}</span><button type="button" onClick={()=>void copy(message)}>{copied===message.id?<Check/>:<Clipboard/>}{copied===message.id?'Copiado':'Copiar'}</button></footer>}</div></article>)}{busy&&<article className="ai-message assistant is-thinking"><div className="ai-avatar"><Bot/></div><div className="ai-message-body"><span className="ai-thinking"><i/><i/><i/>Consultando la base y analizando…</span></div></article>}</div>
      {error&&<div className="ai-chat-error">{error}</div>}
      <form className="ai-composer" onSubmit={event=>{event.preventDefault();void ask()}}><textarea ref={inputRef} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void ask()}}} placeholder="Ej.: ¿Por qué aumentó el consumo de red esta semana?" maxLength={6000} rows={2}/><button type="submit" disabled={busy||!draft.trim()||!siteId} aria-label="Enviar pregunta"><Send/></button><small>Enter para enviar · Shift + Enter para otra línea. La IA puede equivocarse: verifica decisiones críticas.</small></form>
    </section>
  </section>
}
