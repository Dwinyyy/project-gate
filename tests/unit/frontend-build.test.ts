import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function assertEntries(output: string) {
  const playerHtml = readFileSync(join(output, 'index.html'), 'utf8');
  const operatorHtml = readFileSync(join(output, 'operator', 'index.html'), 'utf8');
  expect(playerHtml).toContain('Hunter World');
  expect(operatorHtml).toContain('Operator · Hunter World');
  for (const asset of operatorHtml.matchAll(/(?:src|href)="(\/operator\/assets\/[^\"]+)"/g)) {
    expect(existsSync(join(output, asset[1]!.slice(1)))).toBe(true);
  }
  expect(operatorHtml).toMatch(/\/operator\/assets\/[^" ]+\.js/);
  expect(operatorHtml).not.toContain('/src/main.tsx');
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

  it('retains a separately built standalone operator entry', () => {
    execSync('pnpm --dir apps/operator build', { cwd: repositoryRoot, stdio: 'pipe' });
    const output = join(repositoryRoot, 'apps', 'operator', 'dist');
    const html = readFileSync(join(output, 'index.html'), 'utf8');
    expect(html).toMatch(/\/assets\/[^" ]+\.js/);
    expect(html).not.toContain('/operator/assets/');
  }, 60_000);
});
