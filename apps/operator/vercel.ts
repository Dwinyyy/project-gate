import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'vite',
  buildCommand: 'pnpm run build',
  outputDirectory: 'dist',
  rewrites: [routes.rewrite('/:path*', '/index.html')],
};
