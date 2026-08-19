import { defineConfig } from 'vite';

// Mi Solar V6 — configuración de build.
export default defineConfig({
  // Sólo contiene manifiesto, service worker e iconos PWA. Los restos históricos
  // de /public siguen excluidos deliberadamente del build.
  publicDir: 'pwa',
  server: { port: 5173 },
  build: { sourcemap: true, target: 'es2022' }
});
