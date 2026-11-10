import { fileURLToPath } from 'node:url';

export async function checkBoundaries(origin, fetcher = fetch) {
  if (!/^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(origin || '')) throw new Error('Expected production HTTPS origin');
  const paths = [['/api/config', 200], ['/api/messages', 401], ['/api/auth/me', 401],
    ['/assets/production-boundary-missing.js', 404]];
  for (const [path, expected] of paths) {
    const response = await fetcher(origin + path, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}`);
    if (path === '/api/config') {
      const body = await response.json();
      if (!['closed', 'invite', 'open'].includes(body.data?.registrationMode)) throw new Error('Invalid public config');
    } else {
      await response.body?.cancel();
    }
  }
  return { checks: paths.length, authenticated: false, writes: false };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { console.log(JSON.stringify(await checkBoundaries(process.env.BASE_URL))); }
  catch (error) { console.error(`Production boundary failed: ${error.message}`); process.exitCode = 1; }
}
