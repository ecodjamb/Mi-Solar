# Mi Solar V5.3 — reemplazo limpio y despliegue Netlify

Esta entrega conserva las correcciones de V5.2 y agrega una estructura preparada para reemplazar los archivos visibles de V3/V4 al arrastrar el proyecto completo sobre el repositorio.

## Qué incluye

- Aplicación React + Vite + TypeScript dentro de `src/`.
- Backend completo actualizado en `netlify/functions/`.
- Pruebas actualizadas en `tests/`.
- Archivos antiguos de `public/` reemplazados por versiones neutras.
- `publicDir: false` en Vite: la carpeta antigua `public` no se copia a `dist` ni puede reemplazar la aplicación compilada.
- Día e históricos definidos por `America/Santiago`.
- Auditoría técnica y cobertura del día.
- PV1, PV2 y Total Solar en kWh diarios.

## Configuración de Netlify

La configuración ya está incluida en `netlify.toml`:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
Node: 20
```

En Netlify, deja el **Base directory vacío** y la rama de producción en `main`.

## Subida a GitHub

Descomprime el ZIP y arrastra **todos los elementos internos** a la raíz del repositorio. No subas la carpeta contenedora ni el ZIP.

Después ejecuta en Netlify: **Clear cache and deploy site**.
