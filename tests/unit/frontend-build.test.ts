import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { OPERATOR_PATH } from '../../packages/contracts/src/navigation.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function assertEntries(output: string) {
  const playerHtml = readFileSync(join(output, 'index.html'), 'utf8');
  const operatorHtml = readFileSync(join(output, OPERATOR_PATH.slice(1), 'index.html'), 'utf8');
  expect(playerHtml).toContain('Hunter World');
  expect(operatorHtml).toContain('Operator · Hunter World');
  for (const asset of operatorHtml.matchAll(
    /(?:src|href)="(\/_system\/console\/assets\/[^"]+)"/g,
  )) {
    expect(existsSync(join(output, asset[1]!.slice(1)))).toBe(true);
  }
  expect(operatorHtml).toMatch(/\/_system\/console\/assets\/[^" ]+\.js/);
  expect(operatorHtml).not.toContain('/src/main.tsx');
  expect(existsSync(join(output, 'operator', 'index.html'))).toBe(false);

  const retiredOutput = join(output, '_legacy', 'operator');
  const retiredHtml = readFileSync(join(retiredOutput, 'index.html'), 'utf8');
  const retiredScript = readFileSync(join(retiredOutput, 'redirect.js'), 'utf8');
  expect(retiredHtml).toContain('<meta name="referrer" content="no-referrer" />');
  expect(retiredHtml).toContain('src="/_legacy/operator/redirect.js"');
  expect(retiredHtml).not.toContain('/src/main.tsx');
  expect(retiredHtml).not.toContain('Operator · Hunter World');
  expectFixedNavigation(retiredScript, '/account/sign-in');
}

function expectFixedNavigation(script: string, destination: string) {
  let navigatedTo: string | null = null;
  const location = {
    replace(next: string) {
      navigatedTo = next;
    },
    get search(): never {
      throw new Error('The retired entry must not read the old query string');
    },
    get hash(): never {
      throw new Error('The retired entry must not read the old fragment');
    },
  };
  runInNewContext(script, { window: { location } });
  expect(navigatedTo).toBe(destination);
}

describe('independent player and operator release entries', () => {
  it('packages the operator entry in a root release build', () => {
    execSync('pnpm build:player', { cwd: repositoryRoot, stdio: 'pipe' });
    assertEntries(join(repositoryRoot, 'dist', 'player'));
  }, 60_000);

  it('packages the operator entry in a player app-root Vercel build', () => {
    execSync('pnpm --dir apps/player build', { cwd: repositoryRoot, stdio: 'pipe' });
    assertEntries(join(repositoryRoot, 'apps', 'player', 'dist'));
  }, 60_000);

  it('publishes only a neutral entry on the retired standalone host', () => {
    execSync('pnpm --dir apps/operator build', { cwd: repositoryRoot, stdio: 'pipe' });
    const output = join(repositoryRoot, 'apps', 'operator', 'dist');
    const html = readFileSync(join(output, 'index.html'), 'utf8');
    const script = readFileSync(join(output, 'redirect.js'), 'utf8');
    expect(readdirSync(output).sort()).toEqual(['index.html', 'redirect.js']);
    expect(html).toContain('src="/redirect.js"');
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
    expect(html).not.toContain('/assets/');
    expect(html).not.toContain('/src/main.tsx');
    expectFixedNavigation(script, 'https://project-gate-player.vercel.app/account/sign-in');
  }, 60_000);
});
