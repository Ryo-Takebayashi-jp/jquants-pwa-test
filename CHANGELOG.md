# J-Quants Project Changelog

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
