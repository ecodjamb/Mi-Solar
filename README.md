# Mi Solar V6.4 — Datos estables y flujo simple

Versión enfocada en recuperar la lectura confiable de Tumcapp y simplificar la pantalla principal.

## Corrección clave de datos

Tumcapp puede renovar el token después de cada respuesta. Las versiones anteriores disparaban varias consultas paralelas; sus respuestas podían sobrescribir la cookie de sesión entre sí y dejar el dashboard sin datos. V6.4 serializa las llamadas al backend, muestra errores y vuelve a intentar en los ciclos automáticos.

## Flujo principal

- Inversor al centro.
- Paneles arriba izquierda.
- Batería abajo izquierda.
- Consumo de la casa arriba derecha.
- Red eléctrica abajo derecha.
- Dirección del flujo real según importar/exportar y cargar/descargar.
- Acumulados diarios visibles bajo cada componente.
- Diseño específico para escritorio y celular.

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Base directory: vacío
