# Mi Solar V6 — Living Dashboard

Versión completa para reemplazar la aplicación anterior en el mismo repositorio.

## Incluye

- React + TypeScript + Vite.
- Backend Netlify Functions para Tumcapp/i.Solar.
- Día calendario completo filtrado en `America/Santiago`.
- PV1, PV2 y Total Solar.
- Flujo energético direccional.
- Dashboard responsive para escritorio, tablet y teléfono.
- Casa dinámica por hora local y clima.
- Decoraciones mensuales sorpresa y celebraciones familiares.
- Cumpleaños: Mateo 12/04, Vichi 16/05, Caro 24/08, Tomás 14/10 y Papá 22/12.
- Modo entretenido activable/desactivable.
- Frase práctica diaria con humor ligero.
- Mejor día, calidad de cobertura, costos, gráficos y sección técnica.
- Clima mediante Open-Meteo, sin exponer credenciales.

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Base directory: vacío
- Node: 20

## Implementación

Sube todo el contenido de este proyecto a la raíz de GitHub y haz commit en `main`. Netlify desplegará automáticamente. Para evitar caché antigua: **Deploys → Trigger deploy → Clear cache and deploy site**.
