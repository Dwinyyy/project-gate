import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { OPERATOR_PATH } from '../../packages/contracts/src/navigation.ts';

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: command === 'serve' ? OPERATOR_PATH : '/',
  plugins: [react()],
  build: { outDir: '../../dist/operator', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/v1': 'http://127.0.0.1:3001' },
  },
}));
