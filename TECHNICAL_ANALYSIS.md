# PaperLens Technical Analysis

Date: 2026-03-02
Scope: Full repository audit of the web app (`src/`, `prisma/`) for bugs, maintainability risk, test gaps, duplication, and general code smells.

## Methodology

- Reviewed all API routes, worker/queue code, auth/session logic, AI/model routing, ingestion/storage, and primary UI/admin components.
- Ran static checks:
  - `npm run lint` (failed with 2 errors, 3 warnings)
  - `npx tsc --noEmit` (passed)
  - `npm run build` (failed in this environment due blocked Google Fonts fetches for `next/font`)
- Checked for tests (`rg --files -g '*test*' -g '*spec*'`) and found none.

## 1) Bugs and Suboptimal Design Patterns

### 1.1 [Critical] Local file access controls are bypassable and path handling is unsafe
- Evidence:
  - `src/app/api/storage/[...path]/route.ts:20` authorizes with `storagePath.includes(user.id)`.
  - `src/app/api/storage/[...path]/route.ts:17` decodes user-controlled path input.
  - `src/lib/storage/local.ts:12` uses `path.join(STORAGE_DIR, storagePath)` with no prefix/sandbox enforcement.
- Impact:
  - A crafted path like `papers/<userId>/../../../../etc/passwd` can pass auth check and escape `.storage` in local mode.
- Plan to fix:
  - Replace substring auth with strict prefix auth (`storagePath.startsWith(`papers/${user.id}/`)`).
  - Normalize and reject any path containing traversal segments (`..`, absolute paths, encoded traversal).
  - Enforce `resolvedPath.startsWith(STORAGE_DIR)` after normalization.

### 1.2 [Critical] SSRF exposure in URL ingestion flow
- Evidence:
  - `src/lib/validation.ts:52` allows any URL ending with `.pdf` (domain bypass).
  - `src/lib/ingestion/url-resolver.ts:78, 94, 123, 178` performs network fetches on user-controlled URLs.
  - `src/app/api/papers/route.ts:143` trusts `isAllowedPaperUrl` before queueing fetch.
- Impact:
  - Attackers can force server-side requests to internal services/metadata endpoints via direct PDF URLs and redirects.
- Plan to fix:
  - Enforce `http/https` only.
  - Validate final resolved host/IP on every redirect hop; block private/link-local/loopback CIDRs.
  - Move to strict allowlist or signed resolver service for external fetches.
  - Add egress firewall rules at infra level.

### 1.3 [High] Job cancellation is not real cancellation
- Evidence:
  - `src/app/api/admin/jobs/[id]/route.ts:31` only updates DB status to `CANCELLED`.
  - Worker handlers immediately set status to `PROCESSING` (`src/lib/queue/worker.ts:22, 84, 169`) and continue execution.
- Impact:
  - "Cancelled" jobs can still run and complete; admin control is misleading.
- Plan to fix:
  - For queued jobs: remove/discard BullMQ job (`Queue.getJob(id)` + `remove()`/`discard()`).
  - For processing jobs: implement cooperative cancellation checks in handlers before costly steps.
  - Prevent status overwrite if DB job already `CANCELLED`.

### 1.4 [High] Token rotation is coupled to `getCurrentUser`, which is used in server components
- Evidence:
  - `src/lib/auth/index.ts:93` calls `setAuthCookies` inside `getCurrentUser`.
  - `getCurrentUser` is called in server-rendered layouts/pages (`src/app/(main)/layout.tsx:14`, `src/app/(admin)/layout.tsx:14`).
- Impact:
  - Cookie mutation in server component contexts is fragile and can fail depending on Next runtime constraints.
- Plan to fix:
  - Split auth into read-only `getSessionUser()` and explicit refresh endpoint/route handler for token rotation.
  - Keep cookie writes only in route handlers or middleware response handling.

### 1.5 [High] Upload filename is not sanitized before building storage path
- Evidence:
  - `src/app/api/papers/route.ts:83` builds path using raw `file.name`.
  - Local provider path join has no traversal guard (`src/lib/storage/local.ts:12`).
- Impact:
  - Crafted filenames can cause path traversal/overwrite behavior in local mode.
- Plan to fix:
  - Ignore user filename for storage path; use generated UUID filenames.
  - Optionally preserve original filename only as metadata after sanitization.

### 1.6 [High] Data consistency risks from multi-step DB + queue workflows without transactions/outbox
- Evidence:
  - Paper and job records are created, then queue add happens separately (`src/app/api/papers/route.ts:87-117`, `168-197`).
- Impact:
  - Queue enqueue failure leaves orphaned/stuck DB records.
- Plan to fix:
  - Adopt outbox pattern (DB transaction writes both job + outbox event, worker drains outbox).
  - At minimum wrap DB writes and add compensation cleanup when enqueue fails.

### 1.7 [High] Paper deletion leaks analysis files from storage
- Evidence:
  - `src/app/api/papers/[id]/route.ts:65-71` deletes only original PDF + markup path.
  - Analysis files are written in worker (`src/lib/queue/worker.ts:222`) but never deleted on paper removal.
- Impact:
  - Storage leaks and stale files accumulate.
- Plan to fix:
  - Fetch analysis `storagePath`s and delete all during paper deletion.
  - Run DB deletion + storage cleanup via coordinated transaction/cleanup job.

### 1.8 [High] Quota system exists but is not enforced in user flows
- Evidence:
  - Quota model/admin UI/API exist (`src/app/api/admin/quotas/*`, `src/components/admin/quota-form-dialog.tsx`).
  - No quota checks in `/api/papers` upload/url submission or `/api/papers/[id]/analyze`.
- Impact:
  - Product-level controls are not operational; abuse/cost runaway remains possible.
- Plan to fix:
  - Centralize quota enforcement service and call it in create/analyze endpoints.
  - Enforce daily/monthly paper and token budgets before enqueueing jobs.

### 1.9 [Medium] Input validation is inconsistent; invalid payloads can produce 500s
- Evidence:
  - Login/register parse JSON without guarded parse (`src/app/api/auth/login/route.ts:11`, `register/route.ts:11`).
  - Admin role and quota values are weakly validated (`src/app/api/admin/users/[id]/route.ts:38`, `src/app/api/admin/quotas/[userId]/route.ts:21-37`).
- Impact:
  - Bad client input can become server errors, making API behavior brittle.
- Plan to fix:
  - Introduce schema validation (Zod/Valibot) per route.
  - Return typed 400 responses for parse/enum/range errors.

### 1.10 [Medium] Default-model writes are not concurrency-safe in create route
- Evidence:
  - `src/app/api/admin/models/route.ts:29-37` clears old defaults, then creates new default outside transaction.
- Impact:
  - Concurrent requests can produce inconsistent default state.
- Plan to fix:
  - Wrap in transaction and add a DB-level uniqueness guard for `(category, isDefault=true)`.

### 1.11 [Medium] Rate limiter identity is spoofable and may collapse to shared bucket
- Evidence:
  - `src/lib/rate-limit.ts:23` trusts `x-forwarded-for` directly; fallback is `unknown`.
- Impact:
  - Header spoofing can bypass limits; missing header causes all users to share one bucket.
- Plan to fix:
  - Use trusted proxy chain parsing or platform-provided client IP.
  - Include user ID in limit key for authenticated routes.
  - Consider atomic Lua implementation for strict correctness under concurrency.

### 1.12 [Medium] API and page data logic are duplicated and diverging
- Evidence:
  - `src/app/(admin)/admin/dashboard/page.tsx` duplicates stats query logic in `src/app/api/admin/stats/route.ts`.
  - Several admin GET APIs are currently unused by UI, while pages query Prisma directly.
- Impact:
  - Parallel data-access paths increase drift and maintenance overhead.
- Plan to fix:
  - Consolidate to a single data service layer used by both pages and APIs, or remove dead endpoints.

### 1.13 [Medium] Job type semantics are inconsistent for URL ingestion
- Evidence:
  - URL submission creates initial DB job as `PARSE_PDF` before actual fetch stage (`src/app/api/papers/route.ts:182`).
  - Fetch worker handles non-parse work (`src/lib/queue/worker.ts:18-78`).
- Impact:
  - Status/history semantics are confusing and can skew reporting.
- Plan to fix:
  - Add explicit job type for URL fetch/ingestion (e.g., `FETCH_URL`), or represent stages separately.

### 1.14 [Low] Metadata parser for YAML is fragile
- Evidence:
  - `src/lib/ai/azure-foundry.ts:392-407` uses regex line parsing for YAML.
- Impact:
  - Metadata extraction breaks on valid YAML edge cases.
- Plan to fix:
  - Use a YAML parser library and stricter front-matter extraction.

### 1.15 [Low] Build depends on external font fetch at build time
- Evidence:
  - `npm run build` fails in restricted network due Google Fonts (`Geist`, `Geist Mono`) fetch.
- Impact:
  - CI/deploy reproducibility risk in locked-down environments.
- Plan to fix:
  - Self-host fonts or vendor local font files to remove build-time network dependency.

## 2) Inadequate Test Coverage

### 2.1 [Critical] No automated tests exist
- Evidence:
  - No `test`/`spec` files found.
  - No `test` script in `package.json`.
- Impact:
  - Regressions in auth, queueing, model routing, and security checks will be caught late.
- Plan to fix:
  - Add baseline test stack:
    - Unit: Vitest for `lib/*` modules.
    - Integration: API route tests with test DB/Redis.
    - E2E: Playwright for critical user flows.

### 2.2 [High] Missing security regression tests
- Gaps:
  - Storage path authorization/traversal handling.
  - URL ingestion SSRF guardrails.
  - Role/permission checks on admin routes.
- Plan to fix:
  - Add explicit negative tests for traversal payloads, private-IP URLs, and unauthorized admin access.

### 2.3 [High] Missing worker/queue behavior tests
- Gaps:
  - State transitions on success/failure/cancel.
  - Enqueue/dequeue consistency with DB records.
  - Retry/idempotency behavior.
- Plan to fix:
  - Add BullMQ integration tests with ephemeral Redis + test DB.
  - Mock storage/provider to validate side effects and cleanup behavior.

### 2.4 [Medium] Missing model-routing and policy validation tests
- Gaps:
  - Compatibility constraints, fallback ordering, override policies.
  - Invalid/partial policy payloads.
- Plan to fix:
  - Add focused unit tests for `resolveTaskModel`, `isModelCompatibleWithTask`, and policy route validators.

### 2.5 [Medium] Missing frontend interaction tests for key async components
- Gaps:
  - `UploadPage` flow (file + URL paths).
  - `AnalyzeButton` and model selection behavior.
  - `JobStatusPoller` transition/toast behavior.
- Plan to fix:
  - Add component tests (React Testing Library) plus E2E happy-path and failure-path tests.

## 3) Duplicated or Redundant Code

### 3.1 Repeated task-policy parsing helpers
- Evidence:
  - `toOptionalString`, `parseStringArray`, `parseBooleanMap` duplicated in:
    - `src/app/api/admin/task-policies/route.ts`
    - `src/app/api/admin/task-policies/[taskType]/route.ts`
- Plan to fix:
  - Extract shared parser/validator utility and reuse from both routes.

### 3.2 Repeated navigation definitions for desktop/mobile variants
- Evidence:
  - `navItems` duplicated in:
    - `src/components/sidebar-nav.tsx` and `src/components/mobile-nav.tsx`
    - `src/components/admin-nav.tsx` and `src/components/mobile-admin-nav.tsx`
- Plan to fix:
  - Move nav config to shared constants and map in both renderers.

### 3.3 Repeated status-badge mapping across pages/components
- Evidence:
  - Similar `STATUS_VARIANT` mappings in:
    - `src/app/(main)/papers/page.tsx`
    - `src/app/(admin)/admin/dashboard/page.tsx`
    - `src/app/(admin)/admin/jobs/page.tsx`
    - Related config duplication in `src/components/job-status-poller.tsx`
- Plan to fix:
  - Centralize job status presentation constants (label, badge variant, icon) in one module.

### 3.4 Redundant API surfaces with little/no current usage
- Evidence:
  - Admin read endpoints and `/api/admin/stats` are mostly unused by current UI.
  - `/api/auth/me` appears unused.
- Plan to fix:
  - Remove unused routes or refactor UI to consistently consume API layer.

### 3.5 Duplicate storage of analysis output (DB + blob)
- Evidence:
  - Analysis content stored in DB (`src/lib/queue/worker.ts:232`) and also uploaded to blob (`:223`).
- Plan to fix:
  - Choose canonical storage strategy (DB pointer to blob, or DB-only for bounded size) and enforce consistently.

## 4) Other General Code Smells

### 4.1 Lint failures in main branch
- Evidence from `npm run lint`:
  - `src/components/command-menu.tsx:55` (`setState` in effect warning-as-error)
  - `src/lib/storage/index.ts:13` forbidden `require()` import
  - Unused imports/args in `command-menu.tsx`, `storage/azure.ts`, `storage/local.ts`
- Plan to fix:
  - Resolve lint errors and enforce CI lint gate before merge.

### 4.2 Brittle Redis import path
- Evidence:
  - `src/lib/redis.ts:1` imports `IORedis` from `bullmq/node_modules/ioredis`.
- Impact:
  - Breaks with dependency tree changes/package manager differences.
- Plan to fix:
  - Add direct `ioredis` dependency and import from `ioredis`.

### 4.3 Silent error swallowing harms observability
- Evidence:
  - Broad empty catches in UI/network flows (`command-menu`, `upload`, `poller`, several routes).
- Plan to fix:
  - Replace silent catches with structured logging and user-safe fallback messaging.
  - Add error telemetry hooks for worker/API/frontend.

### 4.4 Hardcoded client upload limit can drift from server config
- Evidence:
  - Client: `src/app/(main)/upload/page.tsx:34` hardcoded `50MB`.
  - Server: `src/lib/ingestion/pdf-validator.ts:2` env-driven limit.
- Plan to fix:
  - Expose server-configured max size via config endpoint or injected runtime config.

### 4.5 Dead/unused domain concepts increase maintenance load
- Evidence:
  - `ApiToken` schema/model exists but has no application usage.
- Plan to fix:
  - Either implement API token auth end-to-end or remove table/model until needed.

## Recommended Execution Order

1. Security and correctness first: fix storage path/auth bugs, SSRF defenses, true cancellation behavior.
2. Stabilize auth/session flow and DB+queue consistency model.
3. Enforce validation and transaction boundaries on admin/user-facing write APIs.
4. Introduce automated tests (security + queue + routing first), then lock with CI.
5. Consolidate duplicated code paths/constants and remove dead endpoints/models.
