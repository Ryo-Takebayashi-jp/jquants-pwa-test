# J-Quants Project Changelog

## Web/PWA v7e-alpha23 — CURRENT (2026-09-01)
- Catalog + year Shardsを直接利用するWebテクニカルScreening PoCを追加。
- 直近100取引日からMA5/25/75、5D/20D騰落率、RSI14、出来高20日比を計算。
- 75日以上の履歴を持つ銘柄を対象にTop50を画面表示。
- Screening処理時間・使用Shard・対象銘柄数を実機確認可能にした。
- 正式Screeningロジック移植前の読み取り性能/メモリ/計算基盤検証版。

# J-Quants Project Changelog

## Web/PWA v7e-alpha22b — CURRENT (2026-09-01)
- alpha22で `app.js` がindex.htmlから2回読み込まれていた問題を修正。
- 二重実行により発生した `continuousStopRequested` のduplicate variable SyntaxErrorを解消。
- app.js内の変数宣言自体は重複していなかったことを確認。
- DataLake / Shard / Catalogロジックは変更なし。


## Web/PWA v7e-alpha22 — CURRENT (2026-09-01)
- 本番DataLake UIを「日次更新」「抜けチェック」「抜け自動補完」に整理。
- 全年別Shard内部のmissing weekday候補を自動検出。
- 候補日のみJ-Quants V2へ照会し、実取引日の欠損だけ年別Shardへ自動補完。
- 祝日・休場日は0件として除外。
- 旧移行・詳細Catalog・個別Gap操作を開発者診断へ収納。

# J-Quants Project Changelog

## Web/PWA v7e-alpha21b — CURRENT (2026-09-01)
- 通常利用UIを大幅簡素化。「今やること」だけを前面表示。
- 2019 Gap補完、2026 Gap補完、最終監査、通常日次更新を4操作に集約。
- Catalog詳細、手動Gap、バックアップ、移行・診断系を開発者診断へ収納。
- 画面/JS/Worker/Service Workerのバージョン表記をalpha21bへ統一。

# J-Quants Project Changelog

## Web/PWA v7e-alpha21 — CURRENT (2026-09-01)
- Catalog監査で検出した日足長期GapのJ-Quants V2直接補完を追加。
- 1日単位の年別Shard UPSERT、行数検証、quick_check、Catalog range更新。
- 日次Commit＋冪等UPSERTにより中断後の再実行を安全化。
- 旧巨大DataLakeは未使用。

# J-Quants Project Changelog

## Web/PWA v7e-alpha20 — CURRENT (2026-09-01)
- Catalog + Shardsの本番読み取りルーターを追加。
- from/toをCatalogへ渡し、必要な年別bars_YYYYだけを自動選択して読み取り。
- 複数年跨ぎを1つの論理DataLakeクエリとして扱う。
- 年別Shardをcanonical sourceとして優先し、bars_recentは年Shard欠損時のみfallback。
- Catalog coverage auditを追加。年別Shard間の14日超境界Gapを警告。
- 読み取りテストでShard別件数・範囲・総件数・sampleを表示。

# J-Quants Project Changelog

## Web/PWA v7e-alpha19 — CURRENT (2026-09-01)
- Catalog + Shardsを本番日次更新の書込先へ変更。
- 1日のJ-Quants V2 barsをbars_recent＋当年bars_YYYYへ同時UPSERT。
- bars_recentは直近30取引日に自動トリム。
- 両Shardの日次行数・quick_checkを検証後Catalog rangeを更新。
- Legacy巨大DataLakeを本番日次更新で使用しない。
- 本番日次更新UIと正式バックアップ/復元UIを開発者診断の外へ移動。
- iPhone Safari未対応だったJQB 1ファイル作成UIを正式導線から撤去。
- 複数SQLite外部バックアップを正式仕様として維持。

# J-Quants Project Changelog

## Web/PWA v7e-alpha18 — CURRENT (2026-09-01)
- 正式バックアップUIを開発者診断外へ移動。
- JQB v1単一ファイルコンテナと1DBずつの復元を追加。
- 3GB級巨大Blob化を禁止し、安全な外部Streaming書込API利用時のみ単一ファイル作成。
- alpha17複数DB方式は互換バックアップとして保持。

# J-Quants Project Changelog

## Web/PWA v7e-alpha17 — CURRENT (2026-09-01)
- Catalog + Shardsの正式な外部バックアップ機能を追加。
- Catalog登録済みready shard、bars_recent、年別bars shardを自動インベントリ。
- バックアップ前に全対象DBのPRAGMA quick_check、サイズ、bars_daily行数・期間を監査。
- SQLite SAH Pool `exportFile()` を用い、DBを1ファイルずつ外部保存。
- 全DB順次保存とSafari向け1ファイル保存の両モードを用意。
- バックアップManifest JSONを生成。Export済みDBはSHA-256を記録。
- Filesから複数SQLiteを選択する復元機能を追加。
- 復元は既存Streaming Importを利用し、1DBごとにquick_check。
- 復元後のCatalog + Shards一括監査を追加。
- Legacy巨大DataLake向け同一ブラウザ内snapshotは旧機能として折りたたみへ移動。
- 外部バックアップはSafariサイトデータ消去に巻き込まれない正式運用前提へ変更。

# J-Quants Project Changelog

## Web/PWA v7e-alpha16 — CURRENT (2026-09-01)
- alpha15の `from/to` 年間取得を廃止。V2日足APIが要求する `date` 指定方式へ修正。
- 2020〜2025を1ボタンで直接年別Shardへ補完する全期間バックフィルを追加。
- 平日のみAPI確認し、祝日・休場日の0件は安全にスキップ。
- 1日単位でAPI取得→対象年ShardへUPSERT→date単位検証。
- 各年完了時に営業日数・行数・MIN/MAX・quick_checkを検証し、Catalog `bars_YYYY` をready登録。
- localStorage Checkpointを追加。Safari終了・通信失敗後も⑨で次の日から再開可能。
- 再実行はUPSERTのため重複なし。
- Legacy DataLakeはバックフィル処理では開かない。
- APIキーは永続保存しない。

# J-Quants Project Changelog

## Web/PWA v7e-alpha15 — CURRENT (2026-09-01)
- alpha14で全収録年の年別Shard化がiPhone実機PASS。
- Legacy DataLakeに存在しない2020〜2025を、旧巨大DBを再構築せずJ-Quants V2 APIから年別Shardへ直接補完する導線を追加。
- V2 daily barsを `from=YYYY0101&to=YYYY1231` + paginationで1年単位取得。
- ⑦はAPI取得のみ（DB書込なし）。
- ⑧はAPI rowsを `/jq_bars_YYYY_v1.sqlite` へUPSERTし、営業日数・期間・quick_checkを検証後Catalogへready登録。
- APIキーは画面メモリ内だけで使用し保存しない。
- Legacy DataLakeは補完処理では開かない。
- まず2025年を単年で実機検証してから2020〜2024の連続補完へ進む。

# J-Quants Project Changelog

## Web/PWA v7e-alpha14 — CURRENT (2026-09-01)
- 2025以前を個別指定しても `04-destination-open` で失敗することを確認し、年データ固有問題を否定。
- SQLite公式仕様を再確認し、`initialCapacity` は「既存Poolには効かない」ことを確認。
- alpha13の `initialCapacity: 32` だけでは既存6-slot Poolを拡張できないため修正。
- Worker初期化時に `await pool.reserveMinimumCapacity(32)` を実行。
- `reserveMinimumCapacity()` は既存容量が32未満のときだけ拡張し、容量変更は永続化される。
- ⑤Aは設定値ではなく `getCapacity()` / `getFileCount()` の実値を表示。
- 年別Shard移行ロジック自体は変更なし。
- Legacy DataLakeはread-only / 未変更。

# J-Quants Project Changelog

## Web/PWA v7e-alpha13 — CURRENT (2026-09-01)
- alpha12の全年度一括移行で、2026年Shard作成後に次年の destination-open で失敗。
- 原因候補をSAH Poolの保存枠不足に特定。
- SAH Pool `initialCapacity` を 6 → 32 へ拡張。
- Legacy DB / Catalog / bars_recent / diagnostic DB / 複数年Shardを同時に保持できる余裕を確保。
- 前面に「⑤A Shard保存枠を確認」を追加。
- 年別Shardの移行・照合ロジック自体は変更なし。
- Legacy DataLakeはread-only / 未変更。

# J-Quants Project Changelog

## Web/PWA v7e-alpha12 — CURRENT (2026-09-01)
- alpha11の2026年年別Shard移行がiPhone実機PASS。
  - 63営業日 / 279,928行
  - Source = Write = Verified
  - quick_check=ok
  - 5.88秒
  - Catalog bars_2026 ready
- Legacy DataLakeの収録年一覧をread-onlyで自動検出するYear Inventoryを追加。
- 収録年を新しい順に1年ずつ移行・検証する一括年別Shard化を追加。
- 各年ごとに行数、営業日数、MIN/MAX、quick_checkを検証し、PASS後だけCatalog登録。
- UI整理を修正。Web版 DataLakeを前面へ移動。
- SAH緊急診断、旧巨大DataLake更新、高速/自動バックフィル、旧バックアップ、旧PoCを開発者診断へ収納。
- 診断機能自体は削除せず保持。

# J-Quants Project Changelog

## Web/PWA v7e-alpha11 — CURRENT (2026-09-01)
- alpha9の5営業日移行がiPhone実機で22,215行 / 0.37秒 / quick_check=ok / source-destination完全一致でPASS。
- 年別Shard移行を追加。
- 既定2026年の `bars_daily` を `/jq_bars_2026_v1.sqlite` へ移行可能。
- Legacy DataLakeはread-only。
- source/destination行数、営業日数、MIN/MAX日付、PRAGMA quick_checkを全照合。
- 全検証PASS後のみCatalogへ `bars_YYYY` を state=ready で登録。
- 既存bars_recent移行・診断機能は維持。

# J-Quants Project Changelog

## Web/PWA v7e-alpha10 — CURRENT (2026-09-01)
- UIを本番導線優先へ整理。
- Catalog準備 / bars_recent確認 / Legacy→bars_recent少量移行を「Web版 DataLake」として前面配置。
- Worker PING、Runtime probe、lifecycle probe、旧PoCテスト等は「開発者診断（通常は開かなくてOK）」へ格納。
- 診断機能は削除せず、必要時に再利用可能。
- alpha9の少量移行ロジック・検証条件は変更なし。

# J-Quants Project Changelog

## Web/PWA v7e-alpha9 — CURRENT (2026-09-01)
- alpha8でWorker PING×2、常駐Runtime×2、close→reOpen、Catalog作成、Catalog経由Shard再OpenがiPhone実機PASS。
- Legacy 1.12GB DataLakeから bars_recent へ最新1～10営業日だけをコピーする少量移行パイロットを追加（既定5日）。
- Legacy DataLakeはread-only。
- source/destination件数、対象営業日数、PRAGMA quick_checkを照合し、全PASS後だけCatalog rangeを更新。
- 全量移行・年別Shard化はまだ行わない。

# J-Quants Project Changelog

## Web/PWA v7e-alpha8 — CURRENT (2026-09-01)
- alpha7のraw PINGで PING #1 は0.061秒PASS、PING #2で停止することを確認。
- 根本原因をWorkerのresponse routingに特定。
- `self.postMessage` を各メッセージでラップしていたため、2回目のwrapperが1回目wrapperをさらに包み、
  requestId #2がrequestId #1へ上書きされていた。
- native `postMessage` をWorker起動時に1回だけ保存し、毎回そこからrequestId wrapperを作るよう修正。
- SQLite/SAH Pool以前のWorker通信バグであり、SAH Pool自体の不具合ではなかった可能性が高い。
- 既存1.12GB DataLakeには新診断から触れない。

# J-Quants Project Changelog

## Web/PWA v7e-alpha7 — CURRENT (2026-09-01)
- alpha6の⓪Aが2回目Workerメッセージで停止したため、SQLite/SAH Poolを完全に通らない raw PING/PONG を追加。
- 同一Workerへraw PINGを2回連続送信し、Worker通信そのものとSQLite初期化後状態を分離。
- raw-pingは `initSqlite()` より前に処理される。
- 既存1.12GB DataLakeには触れない。

# J-Quants Project Changelog

## Web/PWA v7e-alpha6 — CURRENT (2026-09-01)
- alpha5で同一コマンド内 create→close→reOpen が0.40秒でPASS。
- 既存コードはsqlite3/pool変数をキャッシュしていたが、初期化処理をsingleton Promise化してWorker寿命中の初期化を明示的に1回へ固定。
- 複数Workerメッセージから同じSQLite/SAH Pool runtimeを再利用するruntime-probeを追加。
- 既存1.12GB DataLakeは新Catalog診断からOpen/変更/削除/移行しない。

# J-Quants Project Changelog

## Web/PWA v7e-alpha5 — CURRENT (2026-09-01)
- `r`→`c`変更でも別コマンド再Openが停止したため、モード原因仮説を後退。
- 同一Workerコマンド内で create → write → close → reopen → read → close を行う lifecycle probe を追加。
- これにより「DB reopenそのもの」と「Workerメッセージを跨いだSAH Pool状態」のどちらが原因かを切り分ける。
- 既存1.12GB DataLakeは新診断から触らない。

# J-Quants Project Changelog

## Web/PWA v7e-alpha4 — CURRENT (2026-09-01)
- alpha3で小型Catalog作成が0.45秒でPASS。
- 再Openが `01-catalog-open` で停止したため、SAH Poolのread-only `r` モードを切り分け。
- Catalog/Shardの再Openを一時的に `c` モードへ変更してiPhone実機テスト。
- `c` モードで再Openが通れば、iOS上のSAH Pool read-only reopenが主因候補。
- 既存1.12GB DataLakeは新Catalog機能からOpen/変更/削除/移行しない。

# J-Quants Project Changelog

## Web/PWA v7e-alpha3 — CURRENT (2026-09-01)
- alpha2でCatalog診断ブロックを挿入した際に欠落した `await initSqlite()` と `s/p` 初期化を復元。
- `01-catalog-open` の `p is undefined` 相当の失敗を修正。
- 段階診断はそのまま維持。
- 既存1.12GB DataLakeは新Catalog機能からOpen/変更/削除/移行しない。

# J-Quants Project Changelog

## Web/PWA v7e-alpha2 — CURRENT (2026-09-01)
- Catalog + Shards bootstrapを段階診断化。
- `shard-bootstrap` を 01〜08 のステージに分解し、どの工程で失敗したかをUIへ返す。
- SQLのパラメータbind依存を外し、bootstrap用UPSERTを単純なSQL実行へ変更。
- 既存1.12GB DataLakeはOpen/変更/削除/移行しない。
- `shard-health` も段階診断化。

# J-Quants Project Changelog

## Web/PWA v7e-alpha1 — CURRENT (2026-09-01)
- Catalog + Shards architecture bootstrap.
- Creates small `/jq_catalog_v1.sqlite` and `/jq_bars_recent_v1.sqlite`.
- Catalog-resolved lazy re-open health test added.
- New commands do not open, migrate, delete, import, or modify the legacy 1.12GB DataLake.
- Existing five/legacy Web functions remain available during transition.

# J-Quants Project Changelog

## Web/PWA v7d-beta5f — CURRENT (2026-08-31)

- Removed the hidden warm-open that beta5e started after step ①. That background open could occupy the serialized Worker while step ② appeared to be frozen.
- Removed `resolveExistingMarketDb()` from the diagnostic open path because it itself opened the huge DB before the real open, effectively causing double-open work.
- Step ② now does a metadata-only logical filename lookup, exactly one DataLake open, then a one-row health probe on the same retained handle.
- UI reports DB-open time and health-probe time separately.
- No DataLake write, import, delete, or migration is performed.


## Web/PWA v7d-beta5e — CURRENT (2026-08-30)

- Identified remaining diagnostic latency as likely DataLake open/SAH Pool readiness rather than query scanning.
- Step 1 now warms and retains one read-only DataLake handle in the persistent Worker.
- Step 2 reuses that handle and runs only sqlite_master + LIMIT 1, avoiding a second DB open.
- No DataLake mutation, migration, import or delete.


## Web/PWA v7d-beta5d — CURRENT (2026-08-30)

- Removed `MIN(date)` / `MAX(date)` scans over the multi-million-row `bars_daily` table from the emergency read-only diagnostic.
- Health check now uses `sqlite_master` plus a single `LIMIT 1` row; checkpoint/sync_log are only optional date references.
- This should make diagnostic step ② complete in seconds rather than scanning the DataLake.
- No DataLake write, import, delete, or migration is performed.


## Web/PWA v7d-beta5c — CURRENT (2026-08-30)

- Made emergency DataLake diagnostics lightweight so they do not scan millions of rows just to prove health.
- Read-only health now checks the table, date range and a one-row sample.
- Serialized SQLite operations now show an explicit waiting state instead of looking frozen.
- No automatic import/delete/migration was added; existing DataLake and backfill semantics are unchanged.


## Web/PWA v7d-beta5b — CURRENT (2026-08-30)

- Fixed the visible literal `\n` in the startup card.
- Reworked SQLite access from a throwaway Worker per command to one persistent serialized Worker.
- This keeps one SAH Pool installation alive for the page session and prevents overlapping/repeated pool contexts from normal app commands.
- Added request IDs and explicit pool identity diagnostics.
- This release deliberately does not auto-import, delete, migrate, or overwrite the DataLake.


## Web/PWA v7d-beta5 — CURRENT (2026-08-30)

- Continuous resumable backfill with safe stop and per-date commits.
- Screen Wake Lock request; Safari still needs foreground execution on iPhone.
- Local full snapshot via SQLite VACUUM INTO in SAH Pool, gated by storage estimate and validated by quick_check/rows/date range.
- Existing Files rescue SQLite remains the external backup; portable streaming export is still required for final production backup.


## Web/PWA v7d-beta4h — CURRENT (2026-08-30)

Real trading-day performance benchmark.

- The benchmark now searches the missing-date range until it finds a date that actually returns J-Quants rows, instead of accidentally timing only a holiday.
- It reports API fetch seconds, SQLite prepared-statement write seconds, rows/sec, and combined per-trading-day time.
- 0-row dates encountered while searching are persisted in `web_no_data_dates`, so subsequent scans do not repeat them.
- Runtime estimates are shown for 20, 250, and the current 1,791 weekday-gap candidates.
- No DataLake re-import or schema migration is required.


## Web/PWA v7d-beta4g — CURRENT (2026-08-30)

- Fixed the repeated same-date sync root cause: JST local midnight serialized through `toISOString()` could return the previous UTC calendar date.
- Date arithmetic/weekend checks are now UTC-calendar safe and covered by a visible boot self-test.
- Historical backfill uses separate checkpoints; checkpoint dates are monotonic.
- API 0-row dates are persisted and excluded from later gap scans.


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
