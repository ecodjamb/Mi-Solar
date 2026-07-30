# Mi Solar V6.7 — Casa Viva Real

Aplicación React/Vite para monitoreo Tumcapp con un gemelo visual de cada propiedad.

## Casa Viva

La app incluye escenas precargadas derivadas de las fotos reales de:

- Casa ECO Arrayán
- Casa Puerto Montt

Cada propiedad tiene escenas de amanecer, día, atardecer y noche. Las imágenes están importadas desde `src/assets`, por lo que Vite las incorpora a `dist` y Netlify no depende de rutas públicas antiguas.

También se aplican clima, fase lunar, decoraciones mensuales sorpresa y cumpleaños familiares.

## Netlify

- Build: `npm run build`
- Publish: `dist`
- Functions: `netlify/functions`
- Node: 20
