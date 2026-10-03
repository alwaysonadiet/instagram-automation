# Cloudflare test migration

Branch: migration/cloudflare-free. Base: 63b3141.
Production Vercel and Meta settings stay unchanged until test deployment passes.

## Build and deploy

Use npm and package-lock.json (other historic lockfiles are not the deployment source).

1. npm ci
2. npm run typecheck
3. node scripts/check-cloudflare-auth.cjs
4. npm run build:cloudflare
5. npm run check:cloudflare
6. Authenticate Wrangler with the intended Cloudflare account; deploy only instagram-automation-test.
7. npm run deploy:cloudflare

No R2, KV, Durable Objects or paid plan is configured. Existing Supabase stays in use.
No runtime database migrations: verify existing schema.sql requirements before live cutover.
The unused lib/supabase-migrate.ts remains available for comparison, but is no longer imported into webhook runtime.

## Environment

Copy existing values securely from the hosting environment, never via chat or git.
Build AND runtime: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI (test Worker /api/instagram/callback).
Runtime secrets: SUPABASE_SERVICE_ROLE_KEY, INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET,
INSTAGRAM_WEBHOOK_VERIFY_TOKEN; META_APP_SECRET if currently used.
Optional existing AI configuration: GROQ_API_KEY, OPENAI_API_KEY, AI_BASE_URL, AI_MODEL.
Keep DISABLE_WEBHOOK_SIGNATURE_CHECK unset. Never prefix server secrets with NEXT_PUBLIC_.
Use the same public configuration at build and runtime; public values are baked into browser JS.

## Cutover gates

- Cloudflare: deployed bundle and startup accepted; measure actual CPU per route, including cold requests and representative webhook payloads. Local wall time cannot certify 10ms CPU.
- Authentication: login, refresh cookies, logout, owner isolation, cross-origin write rejection.
- Supabase: existing tables/RPCs and Realtime access work; do not rerun schema.sql blindly against production.
- Meta: add test OAuth redirect URI; webhook callback /api/instagram/webhook and matching verification token. Changing the active callback can move traffic from Vercel; only do it at planned cutover, or use an isolated Meta test app/account.
- User Instagram tests: comment keyword/all comments, media selection including carousel/reel, random reply variants, DM button URLs, follower lock/recheck, incoming DM/photo/story reply, outgoing DM appears exactly once after echo, live updates/sound, read/unread, mobile hold/ellipsis menu, Shift+Enter.
- Supabase Auth: check site URL/redirect allowlist if applicable; current Instagram callback creates the session directly, so verify its cookies on the new domain.
- Rollback: restore Vercel webhook and OAuth redirect, retain Vercel deployment and environment.

Conversation close/archive and content export features remain a separate task.

## Verification (2026-10-03)

Passed: TypeScript, 13 mock auth/ownership/input checks, Next 16.3.8 build, OpenNext 1.20.8 conversion, Wrangler 4.147.0 dry run. Bundle: 6994.17 KiB uncompressed / 1455.75 KiB gzip. Current official Cloudflare limits page lists 64 MiB uncompressed and no compressed-size limit; free CPU 10ms and 100,000 requests/day still apply.

Not verified: remote deployment/startup, real CPU, live Supabase and Instagram flows. Local Wrangler runtime failed before serving requests with uv_interface_addresses system error. No real secrets were loaded. CLI reports unauthenticated.

Middleware uses the Edge middleware convention because OpenNext does not support Node middleware/proxy. Next warns this convention is deprecated; do not rename back to proxy until the adapter supports it.

Dry run emits duplicate-key warnings in bundled UI dependency code; conversion completes, but remote/UI smoke testing is still required.
