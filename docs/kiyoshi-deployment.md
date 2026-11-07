# kiyoshi.fyi deployment

Provisioned on 2026-11-06 for personal use. This fork is deployed manually;
GitHub Actions has not been configured for deployment.

- Cloudflare account: `1570be02fb666e608fdce4065f2abb48`
- Web: `https://mail.kiyoshi.fyi`; receiving domain: `kiyoshi.fyi`
- Worker: `hpc-cloud-mail`; D1: `hpc-cloud-mail-db`, ID `325564e6-8fab-4c97-8a15-91be6d32308c`
- KV: `hpc-cloud-mail-kv`, ID `003ac6c6dcb746e78efef1befbe8b1ea`
- R2 bucket: `hpc-cloud-mail-r2`
- Registration is closed by default; the receiving domain is limited to the administrator.
- Initial administrator username is `admin`. The initial password and JWT secret are
  held in owner-only files under `~/.config/hpc-mail/`; never commit their contents.

Email Routing is enabled with a catch-all to `hpc-cloud-mail`. On 2026-11-06,
the custom-domain TLS certificate became valid and HTTPS and admin login were
verified. The temporary `workers.dev` route and preview URLs were disabled;
registration remains closed. On 2026-11-07, after the configured external
destination was verified in Cloudflare, one test email from the existing
notification sender arrived at an unclaimed address. HPC Mail recorded the
message as received and the native forward as succeeded. The final destination
inbox had not yet been independently checked.

## Manual update

After reviewing upstream changes, use a worktree and follow the project's tests.
Do not reset or recreate the existing database, KV namespace or bucket. Cloudflare
authentication must be available to Wrangler. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
cd apps/worker
mkdir -p .wrangler
python3 - <<'PY'
from pathlib import Path
p = Path('wrangler.toml').read_text()
p = p.replace('main = "src/index.ts"', 'main = "../src/index.ts"')
p = p.replace('workers_dev = true', 'workers_dev = false\nroutes = [ { pattern = "mail.kiyoshi.fyi", custom_domain = true } ]')
p = p.replace('site_origin = "https://hpc.email"', 'site_origin = "https://mail.kiyoshi.fyi"')
p = p.replace('__D1_DATABASE_ID__', '325564e6-8fab-4c97-8a15-91be6d32308c')
p = p.replace('__KV_NAMESPACE_ID__', '003ac6c6dcb746e78efef1befbe8b1ea')
p = p.replace('migrations_dir = "migrations"', 'migrations_dir = "../migrations"')
p = p.replace('directory = "./dist"', 'directory = "../dist"')
Path('.wrangler/production.toml').write_text(p)
PY
pnpm exec wrangler d1 migrations apply db --remote --config .wrangler/production.toml
pnpm exec wrangler deploy --config .wrangler/production.toml --dry-run
pnpm exec wrangler deploy --config .wrangler/production.toml
```

The script is based on the upstream `wrangler.toml` at commit `1608295750592b702da18a8d015d0aa9ebb8df3d`.
Inspect it and the generated config after upstream changes rather than assuming
the substitutions still apply. The existing `jwt_secret` remains in Cloudflare;
do not rotate it accidentally. Back up D1 and any needed R2 objects before changes.
