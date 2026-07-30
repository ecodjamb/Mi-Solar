import { useState } from 'react';
import { Quote, RefreshCcw } from 'lucide-react';
import { quoteForToday } from '../data/quotes';
export default function DailyQuote(){const [turn,setTurn]=useState(()=>Math.floor(Math.random()*10000));return <section className="panel quote-card"><Quote size={24}/><div><small>Idea práctica del día</small><strong>{quoteForToday(turn)}</strong></div><button onClick={()=>setTurn(v=>v+1)} title="Otra frase"><RefreshCcw size={17}/></button></section>}
