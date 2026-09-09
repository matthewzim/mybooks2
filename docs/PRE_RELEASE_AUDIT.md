# TinyShelves pre-release audit

Date: 2026-09-08 (America/Vancouver). Repository: matthewzim/mybooks2. Audited base: `f626da6d01802bcf99c087f01fd769b7c5970d1c`.

**Release decision: hold.** This change addresses confirmed vulnerabilities and adds executable checks. It is not a certification of the deployed backend, App Store binary, or production capacity. No production database was queried or changed, no subscription was purchased, and no real account was deleted.

## Fixes included

| Severity | Finding | Fix / evidence |
|---|---|---|
| Critical | `users` ownership RLS allowed clients to write `is_premium`, including profile insertion. | Column grants restrict profile writes. Server-only reconciliation fetches RevenueCat current subscriber state; SQL rejects older snapshots. Database tests exercise unauthorized inserts, updates, and helper RPC calls. |
| High | Paid ISBNdb/Vision credentials were compiled into every client. Per-device throttling did not bound shared account spend. | Authenticated `book-api` Edge Function holds secrets, fixes upstream hosts/operations, bounds bodies and timeouts, and uses atomic shared/per-user budgets. Remove old public environment variables and rotate exposed keys before distribution. |
| High | Any authenticated user could overwrite covers; security-definer cover RPCs could modify another user's global book. | Restrictive Storage write guards, immutable book image objects, user-prefixed new paths, uploader-only cover RPC, existing-object validation, explicit function grants. Legacy permissive policies cannot override the new restrictive guards. |
| High | Client account cleanup deleted images before the database transaction and fell back to destructive behavior when RPCs were absent. Shared images were retained indefinitely under deletion claims. | Transactional purge strips image references, preserves other users' placements/reviews and bibliographic records, and records durable Storage cleanup work. A secret-authenticated worker removes objects through the Storage API and retries failures. Missing RPC fails closed. |
| High | Auth retry discarded the only identity for an anonymous library. Missing configuration threw at module import before the error UI. Profile failures could return null as a successful user. | Retry reuses session; a placeholder client allows configuration error UI; profile repair preserves trigger-created profiles and retries uniqueness conflicts. Deferred auth callbacks and stale-result guards reduce auth races. |
| Medium | Refresh credentials persisted in ordinary AsyncStorage. | Native sessions move to SecureStore. Migration removes the old credential only after a successful secure write. Tests cover Keychain failure and legacy migration ordering. Web persistence remains browser storage. |
| High | Shelf-item foreign keys did not enforce access to the referenced book. Global book DELETE could cascade another user's shelf item. | Restrictive reference policies and revocation of client global-book DELETE. Shelved-book visibility uses a narrowly scoped helper to avoid recursive RLS. Cross-user tests run SQL under `authenticated`. |
| Medium | Creating a book and its placement was not atomic; concurrent append requests could select the same position. | `create_book_on_shelf` commits both records under a shelf row lock. Invalid rating rolls back the book. Shelf insertion serializes per owner. Item reorder validates IDs and duplicates under a shelf lock. |
| Medium | Shelf deletion could empty items but leave the shelf when its second request failed. Editing someone else's book silently succeeded with zero updated rows. | One cascading shelf delete; actionable errors for unauthorized global edits. Moves clear stack metadata. |
| Medium | Home loaded every book; large shelf reads silently stopped at the API row limit. Stale fetches could replace the current shelf. | Bounded 40-book home previews with independent total counts; 500-row keyset batches for shelf detail; stale-fetch guard; index on community creation order; random RPC result limit clamped. |
| High | Release builds could use a RevenueCat test key, HTTP exceptions, and compatibility patches that rewrite native dependencies for obsolete Xcode. | Release SDK key validation, explicit development-only HTTP exception, opt-in legacy source patches, SDK-55 EAS image, aligned Expo dependencies. The native archive still requires testing with supported Xcode. |
| Medium | Test/lint scripts existed without tests or lint configuration. | Jest service/config/PostgreSQL regression tests, ESLint syntax/hooks checks, and CI workflow. |

## Verification results

- `npm test -- --runInBand`: **29 tests passed**, six suites. PostgreSQL tests execute all historical and new migrations against PGlite with a minimal Supabase auth/Storage fixture. This verifies SQL/RLS behavior, not the managed services, multi-connection locks or the live migration ledger.
- `npm run typecheck`: **passed**.
- `npm run lint`: **passed with 11 hook dependency warnings**; no lint errors. Existing UI effect dependencies still need attention.
- `expo install --check`: **passed**, dependencies aligned to SDK 55. Required `expo-constants`, `expo-linking`, `babel-preset-expo` and web support were made explicit; deprecated React Native stub types removed.
- `expo export --platform ios`: **passed**, a 6.9 MB Hermes bundle. This is JS/asset compilation, not a signed native archive.
- `expo export --platform web --max-workers 2`: **passed**, 19 static routes. Browser smoke test confirmed the missing-configuration screen renders and retry returns an actionable error without crashing. The web SSR storage crash is covered by a regression test.
- Production `expo config --type introspect`: **passed**; inspected identifiers, App Group, permissions and ATS. No global arbitrary-HTTP exception remains.
- `expo-doctor`: **19/20 passed**; only local Xcode compatibility fails. `simctl` also could not connect to CoreSimulator under the available environment.
- Deno typecheck: **passed for all four Edge Function entry points**; dependencies pinned in the Deno lockfile.
- `npm audit`: **18 moderate, 0 high, 0 critical** (initially 41 total, including 19 high and 1 critical). Remaining advisories are transitive, including `uuid` and `decode-uri-component`; no unsupported major overrides were forced. Audit findings are not a proof of runtime exploitability or security.
- `git diff --check`: **passed**.

## Backend deployment requirements

1. Export the actual deployed schema, policies, grants, functions, bucket settings and migration ledger. The repository starts after its original schema: `supabase/bootstrap.sql` reconstructs the documented legacy schema **for an empty development database only**. It includes the two stack columns missing from the README setup example.
2. Historical files share version prefixes (notably three `20260325` migrations). They can be executed in lexical order in the test fixture, but cannot be treated as a clean, uniquely versioned Supabase CLI migration history. Reconcile the live ledger before `db push`; do not rename/repair production history blindly. New migrations use distinct versions.
3. Apply the five `20260909...` migrations to staging after the historical schema, review the changes, then deploy the four Edge Functions. Set server secrets: `ISBNDB_API_KEY`, `GOOGLE_CLOUD_VISION_API_KEY`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTHORIZATION`, `STORAGE_CLEANUP_AUTHORIZATION`. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never prefix server secrets with `EXPO_PUBLIC_`.
4. Set RevenueCat's webhook Authorization header to the **exact** `REVENUECAT_WEBHOOK_AUTHORIZATION` value. Route all events to `revenuecat-webhook`; transfer events reconcile both sides, and retries fetch authoritative state rather than replaying event flags. Production rejects sandbox subscriptions unless `ALLOW_SANDBOX_PURCHASES=true` is explicitly set for staging.
5. Schedule `storage-cleanup` regularly with its exact Authorization secret, monitor queue age/failures, and alert if cleanup falls behind. Workers process up to 100 objects per invocation. Account deletion queues removal, so physical deletion is asynchronous. No scheduler has been installed against a live project by this PR.
6. Configure anonymous sign-in abuse protection/rate limits and CAPTCHA as appropriate to the deployment. The proxy budgets cap spend even across anonymous accounts, but exhausted global budgets deny service to all users. Default ISBNdb budget assumes Basic (one request/second); revise the server budget with the provider plan and add shared caching/queuing before increasing traffic.
7. Run an initial server reconciliation for existing premium users and periodically reconcile active subscribers/expired flags. The migration cannot trust existing client-written `is_premium` values; the new columns identify unverified rows (`premium_checked_at IS NULL`). Do not use an unverified flag for authorization. UI entitlements continue to come from RevenueCat.

Deploy the backend before distributing the updated client. Previously released clients that write premium directly or use old cover paths will fail those writes after hardening. No production migrations, EAS submissions, secrets, or scheduled jobs were applied during this audit.

## Remaining release blockers and risks

| Priority | Remaining issue | Required validation / follow-up |
|---|---|---|
| P1 | No live Supabase project configuration was available. Auth/Storage schemas in the local test are faithful minimal fixtures, not the deployed services. | Staging reset/diff, actual PostgREST RPC/embedded-count requests, Storage ownership behavior, upload limits, RLS grants, anon JWTs, and migration reconciliation. Apply Storage-table trigger changes in staging and verify compatibility with the managed Storage service. |
| P1 | Native build/device behavior is unverified. Local Xcode is 16.2; Expo SDK 55 requires Xcode 26.2+ and iOS 15.1+. Apple's current submission rules require the iOS 26 SDK. | Archive on the pinned EAS SDK-55 image and run TestFlight on small/large iPhones, minimum supported OS, current OS, and iPad (enabled in app config). Verify widget extension signing/App Groups, privacy manifests, required-reason APIs, screenshots and privacy labels. JS export does not compile Swift or prove signing. |
| P1 | Account deletion and payments require deployed external components and operational ownership. | Test deletion offline, queued cleanup retries, late uploads, repeated deletion, purchase/restore/cancel/refund/expiration/grace/transfer, webhook duplication/reordering and provider outage. Deleting the app account does not cancel Apple billing; the confirmation now says so. Define deletion/retention of RevenueCat customer metadata as part of the privacy process. |
| P1 | Multi-request edit, move, stack/unstack, and old-client reorder fallbacks remain susceptible to partial failure or concurrent edits. Atomic create does not provide request idempotency after a lost HTTP response. | Move these remaining mutations into validated transactional RPCs; add client operation IDs and optimistic versions; run two-device concurrent edits and retry tests. Row locks were inspected and single-session rollback tested, not stress-tested on multiple Postgres connections. |
| P1 | Free-tier limits are still UI checks, not database quotas. | Enforce limits server-side using verified, unexpired entitlements with per-user serialization. Also cap anonymous uploads/books/shelves and report volume to limit abuse independently of subscription products. |
| P1 | Scale has not been certified. Shelf detail still materializes the full library in JavaScript; visual grids are not virtualized. Home has an implicit maximum parent-row count; profiles make one preview request per shelf. | Virtualize detail rendering, page shelf lists and profile previews, bound concurrency and image decoding, and benchmark real devices with 1k/10k books and staging with realistic concurrency. |
| P2 | Public sampling uses `ORDER BY random()` over public shelves; exact counts and RLS visibility helpers add work. Community aggregate RPC still allows large caller-supplied pagination and scans item counts. | Clamp/rewrite the legacy `get_community_books` RPC, use precomputed/cached sampling and counts at scale, collect `EXPLAIN (ANALYZE, BUFFERS)` on representative staging data and monitor p95 latency/locks/pool saturation. |
| P1 | User-generated content moderation is not just report/block buttons. Reports are stored but no staffed response process or automated content filter is evidenced. Book images are public even when shelves are private. | Establish filtering, reporting response SLA and contact information; verify blocking across direct links, scans and all community surfaces. Explicitly disclose public image URLs and sharing behavior in onboarding/privacy copy, or design private media access. |
| P2 | Anonymous identity has no durable account recovery/linking flow. | Explain recovery limits; test reinstall/Keychain persistence, restore purchases versus library recovery, backup/restore and device changes. Do not imply StoreKit restore recovers library data. |
| P2 | TypeScript database types are hand-maintained; legacy subscription tables refer to Stripe. | Generate types from staging, audit all remaining table grants, then remove unused Stripe data through a reviewed migration if appropriate. |

## User-flow coverage

| Flow | Audit evidence | Not exercised here |
|---|---|---|
| First launch / returning user / auth failure | Source review; secure-session migration and failure tests; retry identity fix; browser missing-config/retry smoke test | Live anonymous signup/refresh, device Keychain, airplane-mode UI |
| Onboarding / create shelf / add manual or community book | Source review; SQL create/rollback/append and cross-user reference tests | Full screen interaction and real network retry |
| Browse/search / ISBN lookup / OCR scan | Proxy auth, validation, size/time limits and budget implementation; Edge typecheck | Real provider keys, camera permission, denied permission, cancelled picker, OCR accuracy |
| Edit / move / delete / reorder / stack | Source review; deletion fix; SQL invalid-reorder tests | Multi-device mutation races and native gestures |
| Large library / home / widget | Bounded home previews, true counts, detail pagination, widget source review | Native memory/frame time and App Group rendering |
| Premium purchase / restore | Entitlement logic tests and server reconciliation implementation | StoreKit sandbox/TestFlight purchases and webhook integration |
| Reset / delete | PostgreSQL RLS and transactional cleanup tests; client failure tests | Actual Storage worker scheduling and Apple subscription management |

## Sources

- [Supabase auth callbacks](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) and [auth callback deadlock guidance](https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0).
- [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks) and [event fields/transfers](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).
- [Apple submission requirements](https://developer.apple.com/app-store/submitting/), [account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), and [review guidelines](https://developer.apple.com/app-store/review/guidelines/).
- [Expo SDK support matrix](https://docs.expo.dev/versions/v56.0.0/) and [EAS build images](https://docs.expo.dev/build-reference/infrastructure/).
