# Mi Solar v8.79.6

Mi Solar es la aplicación canónica. Alexa, el widget y cualquier otra integración son complementos de solo consumo y no pueden sustituir, versionar ni desplegar por separado la aplicación principal. La estructura, las versiones y el proceso automático de publicación se definen en [Arquitectura y publicación](docs/ARQUITECTURA-Y-PUBLICACION.md).

Aplicación Vite + React con backend nativo de Vercel para operar y analizar las instalaciones El Arrayán y Puerto Montt. Integra i.Solar, WatchPower, Supabase, Open-Meteo y Tuya sin mezclar datos entre instalaciones ni proveedores.

## Arquitectura actual

- `src/`: interfaz, cálculos energéticos, gráficos, clima, costos, Aguas, Enel, Equipos, Chat IA y Domótica.
- `api/index.js`: API única de Vercel, autenticación, lectura de proveedores, históricos, notificaciones y automatizaciones.
- `server/`: normalización canónica, regulador de consultas, modelos solares, automatizaciones y acceso privado a Supabase.
- `supabase/migrations/`: esquema permanente y funciones privadas.
- `operations/`: cambios operacionales aplicados a cron, rollups y política de carga.
- `tests/`: contratos funcionales, seguridad, consistencia energética y políticas de actualización.

## Política de actualización y capacidad de Vercel

La interfaz y los procesos programados comparten un regulador para impedir consultas duplicadas:

- El flujo visible se actualiza cada 5 minutos y reutiliza primero la última muestra de la base propia.
- Una pestaña oculta no mantiene ciclos de actualización del navegador.
- Todas las llamadas concurrentes del mismo sitio y proveedor se consolidan mediante una concesión con propietario y vencimiento.
- i.Solar conserva una sola captura compartida cada 5 minutos para alimentar los acumulados diarios; WatchPower usa 5 minutos con la aplicación activa y 15 minutos sin presencia reciente.
- La primera carga visible recupera el día completo desde el respaldo permanente y luego continúa de forma incremental, evitando que un caché incompleto reduzca los kWh mostrados.
- Los históricos horarios y diarios se sirven desde rollups precalculados, renovados cada 15 minutos.
- El mes terminado no vuelve a descargarse en cada apertura; el día actual se combina una sola vez con los agregados.
- Gráficos y secciones pesadas se cargan bajo demanda para reducir transferencia, memoria y duración de funciones.
- El cron de reglas del inversor se activa únicamente cuando existe al menos una regla habilitada.
- Pronósticos y recordatorios se separaron del monitor en vivo: pronóstico a las 08:00, 12:00, 17:00 y 21:35 de Chile; recordatorio de lecturas a las 09:00.
- Los antiguos cron redundantes de reglas Tuya y piscina quedaron desactivados por la operación de optimización. La automatización central conserva su inventario y controles explícitos.

El detalle, las consultas de verificación y el procedimiento de reversión están en [docs/capacidad-vercel.md](docs/capacidad-vercel.md).

## Consistencia visual del flujo

“Tu sistema ahora” usa una sola muestra canónica para solar, consumo, batería y red. La batería toma el mismo SOC del porcentaje textual y rellena su icono de forma continua entre 0% y 100%; no infiere el nivel desde potencia de carga o descarga.

## Configuración técnica

Los perfiles de cada instalación viven en `src/utils/site.ts`; la calibración y proyección solar en `src/utils/solarForecast.ts`; la normalización de proveedores en `server/canonicalTelemetry.js`.

Variables principales:

- Sesión y automatización: `SESSION_SECRET`, `CRON_SECRET`, `AUTOMATION_CREDENTIALS_KEY`.
- Supabase: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `MISOLAR_DB_KEY`.
- Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
- Tuya: `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET`, `TUYA_API_REGION`, `TUYA_USER_UID`.
- IA: `OPENAI_API_KEY`.

## Desarrollo y verificación

```bash
npm run typecheck
npm test
npm run build
```

El estado operativo se consulta en `/api/health`; incluye autorización del archivo, rollups, política adaptativa, integraciones y versión activa.

## Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Proyecto: `ecodjamb1/mi-solar`

La publicación debe contener conjuntamente las optimizaciones de capacidad y las mejoras funcionales. No se debe desplegar una rama de optimización basada en una versión anterior de la interfaz.
