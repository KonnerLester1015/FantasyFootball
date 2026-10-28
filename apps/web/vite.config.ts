import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, not the domain root.
  base: '/FantasyFootball/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
