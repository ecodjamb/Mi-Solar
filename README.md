# Mi Solar V8 — Vercel Stable

Versión Vercel construida a partir de la última versión estable de Netlify (V6.10), conservando:

- login Tumcapp/i.Solar;
- sesión cifrada de 24 horas de inactividad;
- equipos múltiples;
- tiempo real e históricos;
- clima y radiación;
- dashboard, gráficos, costos, Casa Viva y modo técnico.

## Plataforma

- Frontend: React + Vite + TypeScript
- Backend: Vercel Functions en `/api`
- Build: `npm run build`
- Output: `dist`

## Variable obligatoria

Configura en Vercel:

`SESSION_SECRET` = cadena aleatoria larga (mínimo 32 caracteres).

## Verificación

Después del despliegue abre:

`/api/health`

Debe responder con `version: 8.0.0`.
