import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { config as operatorConfig } from '../../apps/operator/vercel.js';
import { config as playerConfig } from '../../apps/player/vercel.js';
import { createVercelFrontendConfig } from '../../scripts/vercel-frontend-config.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const configCli = resolve(
  dirname(fileURLToPath(import.meta.resolve('@vercel/config/v1'))),
  '..',
  'cli.js',
);

describe('Vercel frontend configuration', () => {
  it('keeps API paths out of the SPA fallback when no API origin is configured', () => {
    const config = createVercelFrontendConfig(undefined);

    expect(config).toMatchObject({
      framework: 'vite',
      buildCommand: 'pnpm run build',
      outputDirectory: 'dist',
    });
    expect(config.rewrites).toEqual([
      {
        source: '/:path((?!v1(?:/|$)).*)',
        destination: '/index.html',
      },
    ]);
  });

  it('places the same-origin API proxy before the SPA fallback', () => {
    const config = createVercelFrontendConfig('  https://hunter-api.onrender.com/  ');

    expect(config.rewrites).toEqual([
      {
        source: '/v1/:path*',
        destination: 'https://hunter-api.onrender.com/v1/:path*',
      },
      {
        source: '/:path((?!v1(?:/|$)).*)',
        destination: '/index.html',
      },
    ]);
  });

  it('routes the embedded operator entry separately from the player SPA', () => {
    const config = createVercelFrontendConfig('https://hunter-api.onrender.com', {
      embeddedOperator: true,
    });
    expect(config.rewrites).toEqual([
      {
        source: '/v1/:path*',
        destination: 'https://hunter-api.onrender.com/v1/:path*',
      },
      { source: '/operator', destination: '/operator/index.html' },
      {
        source: '/operator/:path((?!assets(?:/|$)).*)',
        destination: '/operator/index.html',
      },
      { source: '/:path((?!v1(?:/|$)|operator(?:/|$)).*)', destination: '/index.html' },
    ]);
  });

  it.each([
    'http://api.hunter.example',
    'https://api.hunter.example/base',
    'https://api.hunter.example?environment=test',
    'https://user:password@api.hunter.example',
    'https://localhost',
    'https://10.0.0.1',
    'https://[fd00::1]',
    'https://api.example.com',
    'https://api.hunter.example',
    'not-a-url',
  ])('rejects unsafe API origin %s', (apiOrigin) => {
    expect(() => createVercelFrontendConfig(apiOrigin)).toThrow(/HUNTER_API_ORIGIN/);
  });

  it.each([
    ['player', playerConfig],
    ['operator', operatorConfig],
  ])('exports a deployable %s project configuration', (_name, config) => {
    expect(config).toMatchObject({
      framework: 'vite',
      buildCommand: 'pnpm run build',
      outputDirectory: 'dist',
    });
    expect(config.rewrites?.at(-1)).toEqual({
      source:
        _name === 'player'
          ? '/:path((?!v1(?:/|$)|operator(?:/|$)).*)'
          : '/:path((?!v1(?:/|$)).*)',
      destination: '/index.html',
    });
  });

  it.each(['player', 'operator'])('loads the %s config through the pinned package CLI', (app) => {
    const environment = { ...process.env };
    delete environment.HUNTER_API_ORIGIN;

    const output = execFileSync(process.execPath, [configCli, 'compile'], {
      cwd: resolve(repositoryRoot, 'apps', app),
      encoding: 'utf8',
      env: environment,
    });
    const compiled = JSON.parse(output) as {
      config?: { rewrites?: unknown[] };
      rewrites?: unknown[];
    };
    // @vercel/config 0.7.0 wraps Vercel's documented named `config` export.
    const config = compiled.config ?? compiled;

    expect(config.rewrites).toHaveLength(app === 'player' ? 3 : 1);
  });
});
