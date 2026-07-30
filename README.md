# Mi Solar V5.2 — Auditoría técnica y día Santiago

Versión revisada para reforzar la exactitud de horas, fechas, históricos y valores técnicos.

## Cambios principales

- El día se define siempre como 00:00–24:00 de `America/Santiago`.
- La consulta a Tumcapp se amplía a días calendario completos de Asia/Shanghai y luego se filtran estrictamente las muestras por fecha chilena.
- Se eliminan muestras duplicadas antes de integrar energía.
- La integración ignora vacíos excesivos para no inventar energía durante períodos sin datos.
- Se separan importación y exportación de red.
- Se auditan muestras, primera y última hora del día y cobertura del histórico.
- Se agregó un catálogo técnico por secciones: MPPT, salida AC, red, batería, inversor y estados digitales.
- Se ampliaron alias de campos para distintas variantes de firmware/Tumcapp.
- Se muestran campos no catalogados para descubrir nuevas variables disponibles.
- Hora de Santiago, hora del último dato del inversor y hora de consulta de la app visibles por separado.
- Estadísticas PV1/PV2 y Total Solar se calculan en kWh del día chileno.

## Despliegue

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```
