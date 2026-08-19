# Mi Solar V8.5

Aplicación Vite + React con backend nativo de Vercel para consultar Tumcapp/i.Solar.

## Mejoras de esta versión

- Datos independientes por instalación y número de serie.
- Caché resiliente de último dato válido, sin mezclar Arrayán y Puerto Montt.
- Actualizaciones separadas por sección para reducir errores del servidor.
- Sesión persistente de 24 horas de inactividad.
- Clima y radiación por coordenadas de la instalación seleccionada.
- Línea de tiempo horaria sobre las muestras reales del día.
- Uso instantáneo de red validado con `statusGrid`/`gridStatus`; el acumulado diario conserva la medición bruta.
- Perfil horario de sombra de El Arrayán aislado en el modelo para recalibrarlo con evidencia futura.
- Respaldo permanente de muestras en Supabase y búsqueda por día, semana, mes o rango.

## Incorporación de nuevos antecedentes

Los perfiles propios del sitio viven en `src/utils/site.ts` y la calibración solar en `src/utils/solarForecast.ts`. Un informe futuro de sombras, azimut o pérdidas puede incorporarse allí sin modificar la interfaz ni la integración de Tumcapp.

## Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: vacío
- Variable requerida: `SESSION_SECRET`
- Variables del archivo permanente: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `MISOLAR_DB_KEY`
- Automatización autónoma: `CRON_SECRET`, `AUTOMATION_CREDENTIALS_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
- Supabase Cron llama cada cinco minutos al backend; cada regla compara la hora guardada en `America/Santiago` y se ejecuta una sola vez por fecha proyectada.
- Integración Tuya: `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET`, `TUYA_API_REGION` (`us`, `eu`, `cn` o `in`) y `TUYA_USER_UID`

Prueba del backend: `/api/health`.
