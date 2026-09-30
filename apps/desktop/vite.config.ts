import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/renderer', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { assetsInlineLimit: 0, outDir: 'dist/renderer', sourcemap: false },
});

