# Mi Solar V6.2 — Precision Analytics

Versión enfocada en precisión de acumulados, legibilidad de gráficos, clima redundante y proyección fotovoltaica.

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node: 20+

## Proveedores meteorológicos

1. Open-Meteo: clima, nubosidad, precipitación y radiación solar.
2. MET Norway: respaldo de clima cuando el proveedor principal no responde.

## Modelo solar

La app calibra un factor histórico usando producción real diaria y radiación diaria. Luego calcula potencia esperada actual, producción teórica acumulada del día y proyección de días futuros.
