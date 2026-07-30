# Despliegue Mi Solar V6.6

1. Descomprimir el ZIP.
2. Subir todo el contenido de la carpeta a la raíz del repositorio.
3. Commit sugerido: `Mi Solar V6.6 - actualizaciones por sección`.
4. Netlify debe conservar:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
   - Base directory: vacío
5. Esperar el deploy automático.

## Política de actualización

- Tiempo real: 30 segundos.
- Histórico del día: 5 minutos.
- Histórico de la semana: 30 minutos.
- Histórico del mes: 2 horas.
- Clima actual: 15 minutos.
- Radiación y pronóstico: 1 hora.

El reloj de Santiago se actualiza localmente cada segundo y no consume solicitudes de servidor.
