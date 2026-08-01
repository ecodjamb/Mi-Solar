# Mi Solar V8.3

Aplicación Vite + React con backend nativo de Vercel para consultar Tumcapp/i.Solar.

## Mejoras de esta versión

- Datos independientes por instalación y número de serie.
- Caché resiliente de último dato válido, sin mezclar Arrayán y Puerto Montt.
- Actualizaciones separadas por sección para reducir errores del servidor.
- Sesión persistente de 24 horas de inactividad.
- Clima y radiación por coordenadas de la instalación seleccionada.

## Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: vacío
- Variable requerida: `SESSION_SECRET`

Prueba del backend: `/api/health`.
