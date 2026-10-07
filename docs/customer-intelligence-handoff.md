# Customer Intelligence implementation checkpoint — 7 October 2026

## Verified current state

Source: `alwaysonadiet/instagram-automation`, `migration/cloudflare-free` at c147cc5.
Existing production database confirmed healthy.
Existing Cloudflare app confirmed in project context.

Database has `conversations.is_closed` and `is_pinned`, absent from the available GitHub implementation. The deployed Worker must therefore be reconciled with its actual latest source before deploying this branch. Never overwrite it with the older repository snapshot.

## Implemented

- `/dashboard/data`: browser-side ZIP/JSON selection, drag-and-drop, participant/sample preview and 100-event resumable uploads.
- ZIP processing filters message JSON only; media stays on the user's device. References and full original events are retained.
- `instagram_history_events`: server-only, owner-scoped raw archive; migration `instagram_history_raw_archive` applied to the existing Supabase project.
- Source fingerprints and occurrence numbers preserve actual repeated identical events while repeated import batches insert no copies. Atomic composite primary key handles concurrent retry.
- Original export text retained separately from safely decoded display text.
- Unknown sender direction retained when export owner names cannot be matched. Never infer an API recipient ID from a display name.
- Message lookup route explicitly checks verified identity and owner, even without middleware.
- Removed duplicate `proxy.ts`: the Cloudflare branch already has matching Edge middleware; both together prevented a Next build. Existing guard tests now use the middleware.

This is an import foundation, not a completed customer analysis or API/export merge.

## Verification

- `npm run typecheck`
- `node scripts/check-history-import.cjs`
- `node scripts/check-history-api.cjs`
- `node scripts/check-inbox-send.cjs`
- `node scripts/check-cloudflare-auth.cjs`
- `node scripts/check-inbox-realtime.cjs`
- `npm run build`
- Production SQL rollback test: ON CONFLICT preserves original event and one row; RLS enabled; anon/authenticated have no direct reads; service role can insert. Test rows rolled back.
- Security advisor: new archive has no RLS policies by design because only server service-role access is permitted. Existing leaked-password-protection warning predates this change.

## Limits to resolve with the real export

- No actual Instagram export ZIP supplied yet. Current tests use representative fixtures.
- 200MB compressed archive; 20MB per JSON; 100MB selected JSON after decompression. JSON parse can still consume substantial memory on a phone. For larger exports, split by date; a streaming parser/local importer is a future extension.
- Messages with attachments are preserved, but media bytes are not uploaded.
- Reactions, unsends and non-text events remain original JSON; they are not yet interpreted as customer statements.
- A standalone JSON lacking thread_path falls back to the source file path; do not merge unrelated standalone files based on participant names.
- Repeating the same archive is idempotent. An event whose raw metadata changes across separate exports can produce a new source key. Identical events split across export message files can remain ambiguous. Cross-export reconciliation requires real samples.
- Changing owner-name configuration after saving does not rewrite existing raw rows; direction correction needs a separate derived identity operation.
- No API backfill, cross-source dedupe, purchase capture, AI extraction, Intelligence dashboard, content opportunities or conversion claims yet.

## Next work

1. Recover deployed Worker's latest source and bring pin/swipe/default replies into GitHub without losing changes.
2. Use the user's real export to verify paths, owner names, IDs, metadata and overlapping files. Add regression fixtures with private content removed.
3. Add customer identities with explicit export-thread → API-conversation mapping. Keep unresolved groups separate. Cross-source matching should preserve ambiguous identical messages rather than silently drop them.
4. Add derived observations linked to exact source events: problem/desire/objection/emotion/stage/product links, model/schema/input hashes, queued analysis and explicit budget ceilings. Raw history must not be changed by AI.
5. Add customer-level journey and measured purchase events, then aggregate customer counts, intent and conversion with stated denominators. Missing sales tracking must show unknown, never zero purchases.
6. Add evidence-backed content opportunities and content/click/purchase attribution. No default attribution based on proximity alone.

No live app deployment was attempted from this older source branch.
