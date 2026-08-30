# J-Quants Project Changelog

## Web/PWA v7d-beta4f — CURRENT (2026-08-30)

Real J-Quants write-path hotfix.

- The beta4e screenshot pinpointed the failure at the writable open in `jquants-bars-write`. Code audit found a regression: that block opened `marketName` without defining it after the filename-resolver refactor.
- `jquants-bars-write` now resolves the existing SAH Pool market DB first, then opens that resolved logical name writable.
- Removed the stale exact logical-filename gate from this real write path.
- The 0-row holiday/non-trading checkpoint path now uses the same resolved market DB.
- Added a safe write-gate test: it performs a same-value UPDATE on one existing row inside a transaction and verifies total row count is unchanged.
- Existing DataLake contents and checkpoints require no re-import or migration.


## Web/PWA v7d-beta4e — CURRENT (2026-08-30)

Non-destructive SAH Pool emergency diagnostics.

- Reports SAH Pool capacity and logical filenames without opening the market DB.
- Separately probes candidate logical filenames read-only and reports table count, `bars_daily` presence, row count and date range.
- Diagnostic commands perform no writes, imports, migrations, deletes, or checkpoint changes.


## Web/PWA v7d-beta4d — CURRENT (2026-08-30)

Hotfix for the remaining DataLake state regression.

- `bars-auto-state` still contained the old exact logical-filename gate despite beta4c adding the new resolver helper. This was the reason the UI still failed at `sqlite-worker.js:204`.
- The state command now resolves the existing SAH Pool database read-only and verifies `bars_daily` instead of depending on slash-sensitive filename string equality.
- Gap scan and one-day benchmark were audited for the same regression.
- No re-import, DB migration, or DataLake rewrite is required.


## Web/PWA v7d-beta4c — CURRENT (2026-08-30)

Production UI and DataLake-open hotfix.

- Fixed the UI classification bug introduced by the beta4b boot card: the mover previously kept only the first card outside diagnostics, which unintentionally moved the normal `J-Quants DataLake 更新` card into Developer Diagnostics.
- Production cards are now explicitly marked and never moved into Developer Diagnostics.
- Replaced production DataLake commands' brittle exact `getFileNames().includes(name)` gate with read-only validation of the existing SAH Pool market database and `bars_daily` table before writes.
- Worker failures now report the real error message, stack, and logical SAH Pool filenames for much faster diagnosis.
- Existing SAH Pool directory, 1.12GB DataLake, schema and committed data are unchanged. No re-import required.


## Web/PWA v7d-beta4b — CURRENT (2026-08-30)

Hotfix for beta4 startup failure.

- Fixed a malformed multiline JavaScript string in the fast-gap-fill error handler. This syntax error stopped `app.js` from parsing, which made every button appear unresponsive even after reload.
- Added a visible JavaScript boot/error indicator so future startup failures are immediately distinguishable from SQLite/API failures.
- No change to the 1.12GB SAH Pool DataLake, DB schema, checkpoints, or stored market data.
- No re-import required.


## Web/PWA v7d-beta4 — CURRENT (2026-08-30)

High-speed historical backfill.

- Reuse one SQLite prepared UPSERT statement for all ~4,400 rows in a trading day instead of invoking `db.exec()` once per row.
- Retain one transaction/commit boundary per date, so interruption recovery remains date-granular.
- Emit write progress every 500 rows.
- Add an iPhone real-device one-day benchmark reporting SQLite write seconds, rows/sec, API-inclusive total seconds, and projected backfill time.
- Add a high-speed gap-fill runner with live elapsed/ETA and configurable batches up to 120 candidate weekdays.
- Preserve `raw_json`, checkpoint semantics, SAH Pool directory and the existing 1.12GB DataLake.


## Web/PWA v7d-beta3 — CURRENT (2026-08-30)

Production-style update dashboard and historical gap backfill.

- Move the old PoC/diagnostic controls behind a developer-only disclosure.
- Normal workflow is now: API key → DataLake status → update to today → detect historical gaps → fill gaps.
- Gap detection compares actual `COUNT(DISTINCT date)` coverage to weekday candidates across a selected range.
- Holiday/non-trading candidates are harmless: the J-Quants API returns 0 rows and the date is treated as checked.
- Backfill runs in bounded foreground batches (default 20 days, max 60) to remain iPhone-friendly.
- Existing per-date transaction, UPSERT, checkpoint, 429 backoff and SAH Pool storage are retained.


## Web/PWA v7d-beta2 — CURRENT (2026-08-30)

Automatic catch-up synchronization for daily bars.

- Derive the starting point from the actual `bars_daily` maximum date plus persisted checkpoints.
- Fetch only subsequent weekdays up to a selected target date.
- A 0-row API response is treated as a checked non-trading/holiday candidate and advances the dedicated auto-sync checkpoint.
- Foreground runs are capped (default 20 weekdays, configurable up to 60) so iPhone Safari can resume safely instead of attempting an unbounded run.
- Each successful date is committed before the checkpoint advances; reruns resume from the next date.
- Add a five-weekday idempotent repair mode using the `(code,date)` UPSERT.
- Show `COUNT(DISTINCT date)` so min/max dates are no longer mistaken for complete historical coverage.


## Web/PWA v7d-beta1c — CURRENT (2026-08-30)

Real DataLake write hotfix.

- Fixed the Worker payload plumbing: beta1b accidentally passed `{date, rows}` into the legacy File argument, so the Worker received no `payload` and raised `date missing`.
- Mapped J-Quants V2 fields to the actual 17-column v3/v3b `bars_daily` schema (`o/h/l/c`, `upper_limit/lower_limit`, `value`, `adj_*`, `raw_json`).
- Store the full API row in `raw_json` so V2-only fields such as `MktCap` / `ExRT` are not silently lost even when the legacy schema has no dedicated columns.
- After commit, read back one row for the requested date and display it as verification.
- Existing 1.12GB SAH Pool DataLake is unchanged; no re-import required.


## Web/PWA v7d-beta1b — CURRENT (2026-08-30)

J-Quants V2 connectivity hotfix.

- Correct V2 authentication to `x-api-key` (beta1 incorrectly used Bearer auth).
- Normalize date to `YYYYMMDD`.
- Route browser requests through a same-origin Cloudflare Pages Function to avoid Safari cross-origin fetch/CORS failure.
- The proxy does not persist the API key and returns `Cache-Control: no-store`.
- Removed the V1 token-auth fallback.
- No change to SAH Pool directory or the existing 1.12GB DataLake.


## Web/PWA v7d-beta1 — CURRENT (2026-08-30)

First real J-Quants network-to-DataLake sync.

- Session-only credential: never persisted by this build.
- Fetch-only test before any database write.
- Daily-bars API with pagination and HTTP 429 backoff.
- Map API fields to the actual `bars_daily` schema discovered on the device.
- Per-date transaction, idempotent UPSERT, commit, then checkpoint.
- Up to five weekdays in one foreground run.
- No `db.export()` and no whole-database RAM expansion.


## Web/PWA v7d-alpha2b — CURRENT (2026-08-30)

Hotfix for unresponsive alpha2 buttons.

- Root cause: `app.js` still registered alpha1 `migrateBtn` / `appendBtn` / `resumeBtn` handlers even though those controls were absent from alpha2 HTML.
- That null-element access aborted JavaScript initialization before the new alpha2 buttons were wired.
- Removed stale bindings and added defensive element checks.
- Storage origin, SAH Pool directory and `/jq_market_v7c.sqlite` are unchanged. No DataLake re-import is required.


## Web/PWA v7d-alpha2 — CURRENT (2026-08-30)

Production sync-engine precursor

- Inspect the actual 1.12GB DataLake schema in SQLite-WASM
- Add date-scoped transactional write batches
- Persist a checkpoint only after each date commits successfully
- Resume from the checkpoint after a fresh Worker starts
- Keep the full database out of RAM and never call `db.export()`
- J-Quants network ingestion is deliberately the next gate after this real-device write/resume test


## Web/PWA v7d-alpha1 — CURRENT (2026-08-30)

Direct-write DataLake runtime foundation

- SQLite-WASM writes directly to the 1.12GB SAH Pool DataLake
- Adds `web_sync_checkpoint` and `web_runtime_migrations`
- Transactional checkpoint UPSERT and Worker-restart resume test
- No whole-database RAM expansion and no `db.export()`
- This alpha intentionally does not call J-Quants yet; it validates the production write/resume foundation first


## Web/PWA v7c-r6 — CURRENT (2026-08-30)

SAH Pool smoke/persistence diagnostic

- Add tiny SQLite create → INSERT → Worker stop → new Worker reopen → SELECT test
- Keep 1.12GB import as a separate step
- Improve missing-DB diagnostics and make Import-before-Open explicit


## Web/PWA v7c-r4 — CURRENT (2026-08-30)

Classic OPFS + SQLite 3.53 proxy query patch

- Use classic `opfs` instead of `opfs-wl`
- Patch the shared async proxy worker URL with SQLite 3.53-required `?vfs=opfs`
- Add strict patch verification before Init
- Keep the existing 1.12GB OPFS DB untouched
- Display the full revision in the top header


## Web/PWA v7c-r3 — CURRENT (2026-08-30)

SQLite 3.53 `opfs-wl` initialization path

- Disable classic `opfs` before SQLite initialization
- Enable only SQLite 3.53 `opfs-wl` for transparent OPFS database access
- Check `Atomics.waitAsync()` and Web Locks explicitly
- Resolve `sqlite3.wasm` through same-origin `/sqlite/` with `locateFile`
- Add an init-only test before touching the 1.12GB database
- Strictly validate Content-Type + `X-JQ-SQLite-Proxy` to prevent false PASS
- Direct Open now uses `sqlite3.oo1.OpfsWlDb`

Note: v7c-r2 proved all SQLite assets were correctly served from the same origin, but initialization still failed before DB open.


## Web/PWA v7c-r2 — CURRENT (2026-08-30)

Same-origin SQLite-WASM asset proxy + detailed Worker diagnostics

- Added Cloudflare Pages Function `/sqlite/*` proxy for official sqlite-wasm 3.53.0-build1 assets
- `index.mjs`, `sqlite3.wasm`, and `sqlite3-opfs-async-proxy.js` are now browser-visible from the same `pages.dev` origin
- Preserves the SQLite 3.53 OPFS proxy `?vfs=opfs` query parameter
- Added an explicit SQLite asset self-test before Direct Open
- Added detailed Worker startup stages and error locations
- Existing 1.12GB OPFS DB is not deleted or re-imported by this update

Note: v7c-r1 successfully streamed the 1.12GB rescue DB into OPFS, but Direct Open failed at Worker startup.


This file is the human-readable release history for both the Desktop/J-Quants Converter and the Web/PWA line.

## History policy

- Every release/PoC revision appends an entry.
- Do not silently rewrite past results. Corrections are added as a new entry.
- `release_history.json` is the machine-readable source for UI/history tooling.
- Web/PWA UI displays Version / Build date / Schema version / Migration version.
- Desktop and Web/PWA histories are kept in one logical history while retaining separate product/version fields.

## Desktop/J-Quants Converter 5.0.0-alpha25b — PASS (date not backfilled)

ReferencePrice integrity

- Resolve ReferencePrice from DataLake using StartDate + Code
- Prefer exact close or previous business day
- CSV ReferencePrice used as fallback only
- Auto-repair existing Watchlist ReferencePrice without changing thesis/state

## Desktop/J-Quants Converter 5.0.0-alpha25 — PASS (date not backfilled)

Unified investment tracking input

- investment_tracking_input.csv unified import
- TRACK_ONLY/WATCH/ACTIONABLE/WATCH_ONLY routing
- Watchlist UPSERT with lifecycle preservation
- Compatibility importers retained

## Desktop/J-Quants Converter 5.0.0-alpha24 — PASS (date not backfilled)

Management Guidance Phase 1 + privacy

- Management Guidance history/summary
- AI-only guidance features with no score impact
- Private-data distribution hardening
- Distribution builder version integration

## Desktop/J-Quants Converter 5.0.0-alpha23b — BASELINE (date not backfilled)

v2 final regression baseline

- Screening/AI Screening regression baseline
- Discovery duplicate check
- Seasonality
- Watchlist Re-Evaluation
- JQP payout validation
- Separated Watchlist import from Discovery

## Web/PWA v7c-r1 — CURRENT (2026-08-30)

Streaming import + official SQLite-WASM direct OPFS open

- Streaming import of rescued SQLite into Cloudflare-side OPFS
- Official @sqlite.org/sqlite-wasm in Worker
- Direct read-only open of OPFS SQLite
- Optional quick_check
- Added formal release-history management

## Web/PWA v7b — PASS (2026-08-30)

Cloudflare Pages / COOP-COEP

- Added _headers
- crossOriginIsolated PASS
- SharedArrayBuffer PASS
- Direct OPFS PASS
- Rescued 1.12GB SQLite header PASS

## Web/PWA v7a — PASS (2026-08-30)

Direct OPFS feasibility

- Worker + SyncAccessHandle random-access test
- No whole-file ArrayBuffer load
- Existing 1.12GB DataLake preserved

Note: GitHub Pages did not satisfy the crossOriginIsolated/SharedArrayBuffer requirements for official SQLite-WASM OPFS VFS.

## Web/PWA Rescue v1 — PASS (2026-08-30)

DataLake rescue

- No SQLite/WASM startup
- OPFS file existence/size/header check
- Direct SQLite file backup to Files

Note: 1.12GB DataLake survived with a valid SQLite header and was successfully rescued.

## Web/PWA v6 — LIMIT_FOUND (2026-08-30)

Long backfill endurance

- Long backfill with month/year chunks
- Resume and synced-day skip
- 429 exponential backoff
- Retry ERROR dates
- Duration/API calls/DB size endurance logs

Note: Safari repeatedly crashed after market DB grew to about 1.12GB. Root cause strongly points to the sql.js whole-DB RAM load/export persistence model.

## Web/PWA v5 — PASS (2026-08-30)

Private-data security PoC

- market/private DB separation
- Private tables for Portfolio/Trades/Discovery/Watchlist
- PBKDF2-SHA256 + AES-GCM encrypted private backup
- Private import validation
- Migration history
- Strong private deletion confirmation

## Web/PWA v4 — PASS (2026-08-30)

Portable DataLake

- SQLite Export/Import
- PRAGMA quick_check
- Required table validation
- Migration marker
- Two-step market deletion confirmation
- Resume after import

## Web/PWA v3b — PASS (2026-08-30)

v3 INSERT fix

- Fixed bars_daily INSERT from 18 placeholders to explicit 17-column insert
- Retried ERROR sync dates without DB reset

## Web/PWA v3 — SUPERSEDED (2026-08-30)

Production-like small DataLake

- Equities master
- Full-market daily bars
- Financial summary
- sync_log and resumable sync
- 429 backoff
- Local screening

Note: Initial build had an INSERT column-count defect; fixed in v3b.

## Web/PWA v2 — PASS (2026-08-30)

Persistence and capacity feasibility

- 512MB OPFS test
- 1,000,000-row SQLite test
- Real J-Quants data persistence
- PWA reopen and local analysis persistence

## Web/PWA v1 — PASS (2026-08-30)

Local-first feasibility check

- OPFS availability check
- SQLite-WASM feasibility check
- Web Worker check
- Direct J-Quants API/CORS/authentication check

## Web/PWA v7c-r5 - 2026-08-30
- classic opfs / opfs-wl の自動VFS登録に依存する経路を中止。
- SQLite公式が性能重視用途に案内する `opfs-sahpool` を明示的に `installOpfsSAHPoolVfs()` で導入するPoCへ変更。
- FilesのレスキューSQLiteをWorkerへ渡し、SAH Poolの非同期 `importDb(name, callback)` でチャンクStreaming Importする構成へ変更。
- 1.12GB全体をRAMへ展開しない方針を維持。
- 既存レスキューSQLiteは変更しない。
