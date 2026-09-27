import { isIP } from 'node:net';
import { routes, type VercelConfig } from '@vercel/config/v1';
import { OPERATOR_PATH } from '../packages/contracts/src/navigation.ts';
import { RETIRED_OPERATOR_BRIDGE } from './lib/retired-operator-entry.ts';

const apiProxySource = '/v1/:path*';
const operatorPrefix = OPERATOR_PATH.slice(0, -1);
const spaFallbackSource = `/:path((?!v1(?:/|$)|${operatorPrefix.slice(1)}(?:/|$)|operator(?:/|$)).*)`;

function normalizeApiOrigin(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('HUNTER_API_ORIGIN must be an absolute HTTPS origin');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const unbracketedHostname = hostname.replace(/^\[|\]$/g, '');
  const isLoopback =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]';
  const isIpLiteral = isIP(unbracketedHostname) !== 0;
  const isPlaceholder =
    ['example.com', 'example.net', 'example.org'].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    ) || ['.example', '.invalid', '.test'].some((suffix) => hostname.endsWith(suffix));
  const isOriginOnly = url.pathname === '/' && !url.search && !url.hash;

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    isLoopback ||
    isIpLiteral ||
    isPlaceholder ||
    !isOriginOnly
  ) {
    throw new Error(
      'HUNTER_API_ORIGIN must be a public HTTPS origin without credentials, a path, a query, or a fragment',
    );
  }

  return url.origin;
}

export function createVercelFrontendConfig(
  apiOriginValue: string | undefined,
  options: { embeddedOperator?: boolean } = {},
): VercelConfig {
  const apiOrigin = normalizeApiOrigin(apiOriginValue);
  const apiRewrites = apiOrigin ? [routes.rewrite(apiProxySource, `${apiOrigin}/v1/:path*`)] : [];

  return {
    framework: 'vite',
    buildCommand: 'pnpm run build',
    outputDirectory: 'dist',
    rewrites: [
      ...apiRewrites,
      ...(options.embeddedOperator
        ? [
            routes.rewrite('/operator', `${RETIRED_OPERATOR_BRIDGE}index.html`),
            routes.rewrite('/operator/:path*', `${RETIRED_OPERATOR_BRIDGE}index.html`),
            routes.rewrite(operatorPrefix, `${operatorPrefix}/index.html`),
            routes.rewrite(
              `${operatorPrefix}/:path((?!assets(?:/|$)).*)`,
              `${operatorPrefix}/index.html`,
            ),
          ]
        : []),
      routes.rewrite(
        options.embeddedOperator ? spaFallbackSource : '/:path((?!v1(?:/|$)).*)',
        '/index.html',
      ),
    ],
  };
}
