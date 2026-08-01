# Despliegue Vercel — Mi Solar V8

1. Sube todo el contenido de esta carpeta a la raíz de GitHub.
2. En Vercel importa o actualiza el repositorio.
3. Configuración:
   - Framework Preset: Vite
   - Root Directory: vacío
   - Build Command: npm run build
   - Output Directory: dist
   - Install Command: npm install
4. Agrega `SESSION_SECRET` en Settings → Environment Variables.
5. Haz Redeploy.
6. Verifica `/api/health`.
