# Library integrity follow-up — 2026-09-13

Follow-up to merged PR #226. This does not certify the production database or native release.

## Changes

- Enforce the existing free limits (3 shelves, 50 placements per shelf) on direct authenticated table writes as well as RPCs. Existing oversized libraries remain readable, editable and deletable. Moving into a full shelf fails without changing the source.
- Premium exemptions require a server-verified, nonfuture check timestamp and an unexpired entitlement (or a lifetime entitlement). Historical unverified flags cannot bypass limits. RevenueCat webhook/sync operations must remain configured; this does not independently poll RevenueCat.
- Serialize writes per account before acquiring item/shelf locks. Separate users have separate locks. Require read-committed isolation so a caller cannot use an old transaction snapshot to evade counts.
- Move, stack, unstack and delete placements through one invoker RPC. Validate ownership and same-shelf stack targets, repair old singleton stacks, reset all stack flags, and reindex remaining members. Repeating a stack operation on the same target stack is a no-op.
- Remove multi-request reorder fallbacks: an unavailable RPC surfaces an error.

## Verification

New Jest cases cover direct-write limits, unverified/expired premium, oversized-library edits/deletion, failed-move rollback, singleton cleanup, and client error propagation. A separate CI job runs real PostgreSQL 17 with independent connections, observes lock contention, and verifies concurrent shelf/item limits and unique append allocation. It uses an empty disposable database with stubbed Supabase auth/storage schemas; it is not a live Supabase test.

Local dependency installation was blocked by ENOSPC (the machine has approximately 119 MiB free even after removing this task's generated npm caches). GitHub Actions is the execution environment for tests, typecheck, lint, exports, dependency checks and Deno checks for this follow-up. Consult the PR checks for actual results.

## Release and remaining work

Apply the new migration only after reconciling the existing production ledger as described in PRE_RELEASE_AUDIT.md, and before distributing the updated client. No production migration or deployment is performed by this PR. Old clients can still perform direct writes; quotas apply, but multi-step legacy stack operations are not made atomic by these triggers. The mutation RPC is atomic but direct writes can still create malformed legacy stack metadata. App-wide optimistic versions, lost-response creation idempotency, transactional metadata edits, UI virtualization, community query optimization, load testing at production scale, live RLS/storage verification and physical iPhone/StoreKit/App Store validation remain open.
