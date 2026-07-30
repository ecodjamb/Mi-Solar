# Mi Solar V4 — Smart Dashboard

Aplicación web responsiva para monitoreo de instalaciones solares conectadas a Tumcapp/i.Solar.

## Incluye

- Dashboard sobrio y moderno, optimizado para escritorio, tablet y celular.
- Flujo energético dinámico con dirección correcta, grosor y velocidad según potencia.
- Visualización automática de un MPPT o de PV1 + PV2, incluyendo Total Solar.
- Histórico diario y mensual con Chart.js.
- Tarjeta de mejor día de producción calculada desde datos históricos disponibles.
- Estadísticas, récords, comparación PV1/PV2 y salud del sistema.
- Pestañas de Equipos, Costos y Modo Técnico.
- Corrección horaria Asia/Shanghai → America/Santiago.

## Despliegue

Configurado para Netlify mediante `netlify.toml`.

```bash
npm test
```

Las estimaciones económicas no sustituyen la facturación de la distribuidora.
