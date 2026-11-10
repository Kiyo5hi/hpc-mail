import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkMigrations } from './check-production-migrations.mjs';
import { checkBoundaries } from './check-production-boundaries.mjs';

test('ordinary updates pass; schema changes fail closed and require explicit review', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mail-release-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    mkdirSync(join(root, 'apps/worker/migrations'), { recursive: true });
    writeFileSync(join(root, 'apps/worker/migrations/0001.sql'), 'CREATE TABLE fixture(id);');
    git('add', '.'); git('commit', '-m', 'baseline');
    const baseline = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'app.txt'), 'new app'); git('add', '.'); git('commit', '-m', 'app');
    const app = git('rev-parse', 'HEAD');
    const response = async () => new Response('{}', { headers: { 'x-hpc-build': baseline } });
    assert.equal((await checkMigrations('https://example.test', app, false, response, root)).migrationFilesChanged, false);
    writeFileSync(join(root, 'apps/worker/migrations/0002.sql'), 'ALTER TABLE fixture ADD COLUMN value;');
    git('add', '.'); git('commit', '-m', 'schema');
    const changed = git('rev-parse', 'HEAD');
    await assert.rejects(checkMigrations('https://example.test', changed, false, response, root), /Migration files differ/);
    assert.equal((await checkMigrations('https://example.test', changed, true, response, root)).migrationsReviewed, true);
    await assert.rejects(checkMigrations('https://example.test', changed, true, async () => new Response('{}'), root), /complete source revisions/);
    await assert.rejects(checkMigrations('https://example.test', changed, true,
      async () => new Response('{}', { headers: { 'x-hpc-build': '0'.repeat(40) } }), root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('smoke checks are anonymous GETs and reject exposed mail', async () => {
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push([url, options]);
    const path = new URL(url).pathname;
    return path === '/api/config' ? Response.json({ data: { registrationMode: 'closed' } }) :
      new Response('', { status: path.startsWith('/assets/') ? 404 : 401 });
  };
  assert.equal((await checkBoundaries('https://example.test', fetcher)).checks, 4);
  assert.ok(seen.every(([, options]) => !options.method && !options.headers && !options.body));
  await assert.rejects(checkBoundaries('https://example.test', async () => Response.json({ data: { registrationMode: 'closed' } })), /expected 401/);
});

test('normal workflow and CLI cannot initialize, seed accounts or write secrets', () => {
  const flow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(flow, /reset_database|seed-admin|secret put|d1 execute|migrations apply|JWT_SECRET|ADMIN_PASSWORD|smoke\.sh/);
  assert.match(flow, /deploy --keep-vars/);
  const pkg = JSON.parse(readFileSync(new URL('../apps/worker/package.json', import.meta.url)));
  assert.equal(pkg.scripts.deploy, 'wrangler deploy --keep-vars');
  const init = readFileSync(new URL('../.github/workflows/initialize.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(init, /\n  push:/);
});
