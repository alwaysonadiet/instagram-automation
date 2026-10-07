# Cloudflare and real-export checkpoint

## Required order

Live automated DM -> Cloudflare independence -> Vercel cleanup -> history import -> Customer Intelligence -> content/conversion learning.
Importer changes here are staged only. Do not deploy the older branch over the current Worker.

## Live checks

- Worker `instagram-automation-test` serves HTTP 200 at its workers.dev root.
- Cloudflare logs show real Meta webhook POSTs receiving HTTP 200 and Inbox API activity.
- Existing Supabase is still the production database; Cloudflare independence means independence from Vercel, not moving the database.
- The automations table contained no rules when checked. No successful automatic-send claim can be made from Inbox traffic alone.
- Added a narrowly scoped live DM keyword rule: `CFTEST7OCT9246`, rule ID `e9b9247f-ee9d-45ec-8b65-f6451a67e681`. Reply includes the same confirmation code. No follower requirement, typing action or intentional delay.
- External Instagram trigger and received reply are still pending. Do not send tests to an arbitrary historical customer or forge a webhook as proof of a real trigger. After verification, disable the test rule.
- Current Worker is newer than available source: bundle includes pinning; the migration branch lacks that implementation. Worker download currently exposes only a compiled `worker.js`, with no source map. Reconcile these changes before any whole-app deployment.
- `_vercel/insights/script.js` returns 404 on Cloudflare and remains cleanup work, not a reason to rebuild the app.
- Vercel has not been deleted; independence gates are not complete.

## Real archive validation

The actual supplied JSON archive contains 10,127 conversation files and 63,243 messages. Thirteen files are flat `messages/inbox/thread.json` rather than `thread/message_1.json`. The importer now accepts both layouts.

Message JSON totals approximately 64.6 MB; the largest individual JSON is approximately 1.04 MB. Current archive-size limits accept this export. This does not certify mobile memory performance; the current preview retains parsed records and needs device testing before deployment.

Read-only full-export test verified:

- 63,243 events parsed without loss; 38,308 contain text.
- 45,465 outgoing and 17,778 incoming after matching the owner's decoded name for this test.
- Range: 2021-01-01T12:12:32.764Z to 2026-10-07T02:44:20.530Z.
- Repeat normalization preserves keys.
- Sorted 100-message upload batches preserve keys.
- Original event text remains byte-for-byte equal as a decoded JSON string.
- No repeated source key across files in this archive.

Owner frequency was used only in this read-only verification. It is not a production identity-resolution heuristic. Unicode NFC/NFD matching now works without altering the raw sender name. Cross-export and API/webhook reconciliation remain separate work: full-event fingerprints alone cannot resolve changed reaction metadata.

## Verification commands

`npm run typecheck`

`node scripts/check-history-import.cjs`

`node scripts/check-history-api.cjs`

`node scripts/check-cloudflare-auth.cjs`

`node scripts/check-history-real-export.cjs <local ZIP path>`

All passed. Private archive bytes and customer text are not committed. No full-history import or AI analysis has been run.
