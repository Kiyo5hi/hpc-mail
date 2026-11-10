import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;

export function migrationChanges(live, target, cwd = process.cwd()) {
  if (!SHA.test(live || '') || !SHA.test(target || '')) throw new Error('Expected complete source revisions');
  for (const revision of [live, target]) {
    execFileSync('git', ['cat-file', '-e', `${revision}^{commit}`], { cwd, stdio: 'pipe' });
  }
  return execFileSync('git', ['diff', '--name-only', live, target, '--', 'apps/worker/migrations'],
    { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

export async function checkMigrations(origin, target, reviewed = false, fetcher = fetch, cwd) {
  if (!/^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(origin || '')) throw new Error('Expected production HTTPS origin');
  const response = await fetcher(`${origin}/api/config`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (response.status !== 200) throw new Error('Cannot read current production revision');
  const live = response.headers.get('x-hpc-build');
  const changes = migrationChanges(live, target, cwd);
  if (changes && !reviewed) {
    throw new Error('Migration files differ from production: apply/verify the migration separately, then use manual migrations_applied. Ordinary deployment never runs SQL.');
  }
  return { live, target, migrationFilesChanged: Boolean(changes), migrationsReviewed: reviewed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    console.log(JSON.stringify(await checkMigrations(process.env.BASE_URL, process.env.BUILD_SHA,
      process.env.MIGRATIONS_APPLIED === 'true')));
  } catch (error) {
    console.error(`Production schema boundary failed: ${error.message}`);
    process.exitCode = 1;
  }
}
