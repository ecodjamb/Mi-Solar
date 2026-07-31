# Mi Solar v6.8.0 — Multi-sitio preciso

Versión enfocada en separar completamente El Arrayán y Puerto Montt.

## Mejoras

- Gráfico de las últimas tres horas en Inicio: consumo total, PV1+PV2 y batería neta.
- Cambio de instalación limpia todos los datos anteriores antes de consultar el nuevo equipo.
- Mejor día, históricos, costos y radiación se calculan únicamente con el equipo seleccionado.
- Perfiles separados:
  - El Arrayán: 8,68 kWp y coordenadas de El Arrayán.
  - Puerto Montt: 1,80 kWp y coordenadas de Puerto Montt.
- Tarifas separadas por instalación en el almacenamiento local.
- Cobertura diaria rediseñada y explicada como porcentaje del periodo transcurrido.
- Radiación y proyección muestran el nombre de la instalación activa.
- Casa Viva mejorada:
  - escenas específicas para cada propiedad;
  - iluminación nocturna cálida;
  - nubes más naturales y separadas de la luna;
  - humo ajustado por casa.
- Versión visible: v6.8.0.

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Base directory: vacío

## Validación

- Pruebas MD5/VRT superadas.
- Todos los archivos TypeScript/TSX pasan validación sintáctica.
