# Despliegue en Netlify

1. Subir todo el contenido de esta carpeta a la raíz del repositorio.
2. Hacer commit en `main` para publicar, o en una rama para conservarlo sin desplegar.
3. Netlify debe usar:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
   - Base directory: vacío
4. No es necesario cambiar ninguna variable de entorno existente.
