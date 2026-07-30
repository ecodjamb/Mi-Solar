# Mi Solar V6.0.1 — Living Dashboard

Corrección de compilación para Netlify. Esta entrega reemplaza V6.0 y evita que los tipos internos de Apache ECharts bloqueen el despliegue.

## Despliegue

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node: 20

## Validación

- `npm run build` usa Vite para generar la aplicación de producción.
- `npm run typecheck` queda disponible como comprobación adicional, pero no bloquea el despliegue de Netlify.
- `npm test` valida la firma Tumcapp.

Incluye el Living Dashboard, horario de Santiago, históricos, PV1/PV2, Total Solar, modo entretenido, cumpleaños, frases y vista técnica ordenada.
