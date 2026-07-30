# Despliegue de Mi Solar V6.0.1 en Netlify

1. Sube todo el contenido de esta carpeta a la raíz del repositorio.
2. Netlify debe usar:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
   - Base directory: vacío
3. Ejecuta un nuevo deploy. No es obligatorio borrar la caché.

Esta versión corrige el error de TypeScript/ECharts que detenía el build anterior.
