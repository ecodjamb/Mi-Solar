import { defineConfig } from 'vite';

// Mi Solar V6 — configuración de build.
export default defineConfig({
  publicDir: false,
  server: { port: 5173 },
  build: { sourcemap: true, target: 'es2022' }
});
