import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Static single-page app: `vite build` produces a folder that any web server
// (or GitHub Pages) can host. Everything runs in the browser, there is no backend.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['../..'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
