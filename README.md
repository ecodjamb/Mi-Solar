# Mi Solar v6.10.0 — Día completo y nubes realistas

Esta versión corrige el histórico diario que podía detenerse cerca de las 12:00.

## Cambios

- El día se descarga en tramos de seis horas desde las 00:00 locales hasta el minuto actual.
- Cada tramo pagina todas las respuestas indicadas por `total`, aunque Tumcapp omita `hasNextPage`.
- Los bloques se unen y deduplican antes de calcular consumos y energías.
- El botón **Actualizar** repite inmediatamente la descarga hasta la hora de la consulta.
- Funciona igual para Arrayán y Puerto Montt, usando la fecha local de Chile y el equipo seleccionado.
- La app muestra la hora de la última muestra realmente recibida.
- Nubes rediseñadas como nubes, con distribución profesional y sin superponerse con la luna.
- Versión visible: **v6.10.0**.

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Base directory: vacío


## Sesión persistente V6.10

- La sesión permanece iniciada durante 24 horas.
- Cada interacción real del usuario (clic, toque, teclado o desplazamiento) renueva el plazo de 24 horas.
- Las actualizaciones automáticas de datos no cuentan como actividad del usuario.
- Tras 24 horas sin interacción, la app cierra la sesión automáticamente.
- La cookie de sesión es HttpOnly, cifrada, SameSite=Lax y Secure en Netlify.
