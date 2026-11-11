import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',

  server: {
    port: 3000,
    // proxy: {   //uncomment in development
    //   '/api': {
    //     target: 'http://localhost:5000',
    //     changeOrigin: true,
    //   },
    // },
  },

  build: {
    sourcemap: false,
    assetsDir: 'assets',
  },
});