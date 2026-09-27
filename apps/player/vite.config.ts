import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { OPERATOR_PATH } from '../../packages/contracts/src/navigation.ts';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: '../../dist/player', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/v1': 'http://127.0.0.1:3001',
      [OPERATOR_PATH.slice(0, -1)]: 'http://127.0.0.1:5174',
    },
  },
});
