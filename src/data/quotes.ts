export const DAILY_QUOTES = [
  'Cuando no tengas nada que decir, no digas nada.',
  'La perfección es enemiga de lo bueno.',
  'No amarres los perros con longanizas.',
  'Si quieres decir algo, dilo. No hagas música.',
  'Sigue caminando.',
  'Haz primero lo que evita problemas mañana.',
  'No todo necesita una reunión.',
  'Termina una cosa antes de abrir cinco más.',
  'Lo urgente hace ruido; lo importante avanza.',
  'Si no mejora la decisión, es solo otro dato.',
  'Hoy intenta complicarte un poco menos.',
  'Respira. Después responde.',
  'Una solución simple que funciona gana.',
  'Ordenar también es avanzar.',
  'No confundas movimiento con progreso.',
  'El mejor momento para revisar algo es antes de que falle.',
  'Hazlo claro; elegante viene después.',
  'No todo error merece una tragedia griega.',
  'Empieza por lo que sí depende de ti.',
  'Si el café no lo arregla, al menos ayuda a pensarlo.',
  'Las excusas también consumen energía.',
  'Lo que no se mide se discute eternamente.',
  'Menos promesas, más entregas.',
  'Hoy basta con avanzar un poco, pero de verdad.',
  'No arregles tres veces lo que puedes pensar una vez.',
  'Ser rápido sirve; ser claro sirve más.',
  'Lo perfecto llega tarde. Lo bueno llega y mejora.',
  'Escucha completo antes de preparar la respuesta.',
  'No todos los incendios necesitan bomberos.',
  'Haz espacio para lo que importa.'
];

export function quoteForToday(extraSeed = 0) {
  const now = new Date();
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);
  const seed = [...dateKey].reduce((sum, c) => sum + c.charCodeAt(0), 0) + extraSeed;
  return DAILY_QUOTES[Math.abs(seed) % DAILY_QUOTES.length];
}
