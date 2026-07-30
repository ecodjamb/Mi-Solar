# Publicar Mi Solar V6

1. Descomprime el ZIP.
2. En GitHub abre `Mi-Solar` → `Add file` → `Upload files`.
3. Arrastra **todo el contenido interior** de la carpeta V6 a la raíz.
4. Commit directo a `main` con: `Mi Solar V6 - Living Dashboard`.
5. En Netlify confirma:
   - Base directory: vacío
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
6. Ejecuta `Deploys → Trigger deploy → Clear cache and deploy site`.
7. Al finalizar, recarga con `⌘ + Shift + R` o cierra y abre la web en el teléfono.

La carpeta `public` queda neutralizada y Vite tiene `publicDir: false`; por tanto no publica archivos antiguos.
