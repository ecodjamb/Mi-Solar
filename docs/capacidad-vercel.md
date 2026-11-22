# Capacidad de Vercel y política de consultas

Actualizado para Mi Solar v8.79.6. La política canónica de arquitectura y publicación se mantiene en [ARQUITECTURA-Y-PUBLICACION.md](ARQUITECTURA-Y-PUBLICACION.md).

## Objetivo

Reducir invocaciones, tiempo de función y lecturas repetidas sin perder la muestra visible, los acumulados diarios ni la ejecución controlada de automatizaciones.

## Cambios incorporados

1. `operations/vercel-load-optimization.sql` mueve la sincronización de proveedores a una cadencia de cinco minutos, desactiva cron redundantes y agrega un índice para sesiones activas.
2. `operations/precomputed-series-and-presence.sql` crea rollups horarios/diarios y registra presencia reciente de la aplicación.
3. `operations/adaptive-poll-cadence-tolerance.sql` devuelve una política de 300 segundos con actividad y 900 segundos sin ella, descontando tolerancia de almacenamiento a la concesión.
4. `operations/prepare-separated-schedules.sql` y `operations/activate-separated-schedules.sql` separan pronósticos, recordatorios y monitor en vivo.
5. `server/providerStore.js` usa una concesión única con token por sitio/proveedor. El token evita que una ejecución libere el bloqueo de otra y expira si Vercel interrumpe la función.
6. `src/App.tsx` detiene ciclos cuando la pestaña está oculta, consolida solicitudes en curso y actualiza flujo más histórico diario en un solo ciclo visible de cinco minutos.
7. `src/components/lazySection.tsx` y `src/components/EChart.tsx` retrasan código pesado hasta que la sección se muestra.
8. i.Solar mantiene una muestra compartida cada cinco minutos aun sin presencia visible, porque esos puntos alimentan los acumulados del día. WatchPower conserva el ahorro adaptativo de 5/15 minutos.
9. El cron unificado corre en `3-59/5`: las muestras recientes de i.Solar se publican cerca de `xx:02:45`, por lo que la captura comienza unos 15 segundos después. La sesión abierta afina el próximo ciclo con la marca real de la muestra.
10. La primera consulta del día en cada sesión recupera el rango completo; las siguientes son incrementales. Una reparación histórica vuelve a invalidar esa hidratación para incorporar los huecos completados.

## Cadencias

| Proceso | Cadencia |
| --- | --- |
| Flujo visible + día en curso | 5 minutos |
| Respaldo i.Solar (ambas instalaciones, una cuenta) | 5 minutos permanentes |
| Monitor con app visible | 5 minutos |
| WatchPower/monitor sin presencia reciente | 15 minutos |
| Rollups horario/diario | 15 minutos |
| Semana | 1 hora mientras la app está visible |
| Mes | 12 horas y sólo si faltan días cerrados |
| Clima/radiación | 15 minutos mientras la app está visible |
| Pronóstico programado | 08:00, 12:00, 17:00 y 21:35 Chile |
| Recordatorio de lecturas | 09:00 Chile |

El botón Actualizar puede solicitar una sincronización, pero el backend mantiene el piso compartido para evitar superposición. La interfaz siempre puede recuperar inmediatamente la última muestra respaldada sin consultar al proveedor.

## Verificación

- `/api/health` debe informar `archiveAuthorized`, `archiveSeriesAuthorized` y `pollPolicyAuthorized` en `true`.
- `npm test` cubre `refresh-policy`, `energy-rollup`, `poll-policy` y `scheduled-tasks`.
- Revisar los cron activos en Supabase antes de reactivar un proceso deshabilitado; una reactivación duplicada vuelve a aumentar consumo.

## Reversión

Cada archivo de `operations/` conserva su nota de reversión o está dividido en fase de preparación/activación. Una reversión debe hacerse por componente y nunca eliminando telemetría ni credenciales.
