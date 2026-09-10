# v7e-beta9 — Fresh install builder / collapsible Settings

- DataLakeが存在しない完全初期状態でも、期間管理から年別日足Shardを直接作成できるよう修正。
- 日足0件日を年別Shardの `web_no_data_dates` に記録し、再監査で同じ休場日を不足扱いし続けない。
- 取得した年別Shardを年ごとにfinalizeし、Catalogへcanonical登録。
- 設定・保守の①データ構築・補完、②データ取り込み、③バックアップ保存、④トラブル診断をすべて折りたたみ化。初期状態は全閉。
- APIキーcanonical一本化・preflightはbeta6から継続。

# v7e-beta6 — Settings token canonicalization / preflight

- J-Quants APIキーをセッション内で1本のcanonical値へ統一。日々分析と設定・保守の2つの可視入力は双方向同期し、旧/非表示入力はcanonicalからのミラー専用に変更。
- 古いhidden tokenが新しい入力より優先される経路を廃止。
- 「不足分を一括取り込み」は書き込み開始前に、入力中の同じAPIキーでJ-Quants V2へ軽量preflightを実施。401/403は本処理開始前に明示停止。
- 設定・保守を ①データ構築・補完 → ②データ取り込み → ③バックアップ保存 → ④トラブル診断 の順に整理。
- ヘッダー / app / Worker query / Service Worker cacheを v7e-beta6 に統一。

# v7e-beta5 — Settings Simplification / Recovery Diagnostics

- 設定・保守を「データ期間管理 / 取り込み / バックアップ保存」の3機能へ再編。
- トラブル診断を折りたたみ化し、完全read-onlyの物理OPFS/容量診断を追加。
- 指定期間のDataLake不足監査と不足分一括取り込み導線を追加。
- 決算予定日・財務にfetch coverageを追加し、0件取得日を今後の欠損判定に利用。
- portfolio-trade-listはprivate DB不在時に空DBを自動作成しない。
- Workerエラー表示でmessageを優先し、実際のSQLiteエラーを隠さない。
- header / app / Worker / Service Worker cache versionをbeta5へ統一。
- beta4 Earnings Intelligence機能は維持。

# v7e-beta4 Earnings Intelligence (2026-09-10)

- Web Screening Share now generates `candidate_earnings_history.csv` natively from the canonical Financial Summary, daily-price, and TOPIX DataLake.
- Reconstructs up to the latest 12 earnings events per Screening candidate with cumulative/standalone quarter metrics, YoY, forecast progress/revision, announcement timing, pre/post returns, volume/trading-value reaction, and TOPIX-relative returns.
- Web Screening Share now generates `management_guidance_summary.csv` from up to 10 observed fiscal years per candidate.
- Guidance bias uses earliest available current-fiscal-year guidance versus actual results; bias thresholds and dispersion were checked against PC reference outputs. Confidence is explicitly versioned `WebNativeV1` and is not claimed as byte-for-byte PC parity.
- Management-guidance fields are merged into `screening_candidates.csv` / `screening_ai.csv` for direct AI consumption.
- Screening manifest now reports earnings/guidance coverage and engine versions. No destructive DataLake migration.
- Keeps beta3 canonical earnings-date DataLake, NextEarnings integration, resumable one-time migration, and JST trade-date behavior unchanged.

# v7e-beta3 Daily Completeness (2026-09-10)

- Added canonical `/fins/earnings-date` DataLake (`jq_earnings_date_v2.sqlite`) with stable content identity.
- Added resumable one-time migration UI for the existing environment to backfill all available earnings-schedule publication history. The migration UI is temporary; the DataLake is permanent.
- Initial-data design now treats earnings-date history as a standard initial-build dataset rather than a standalone permanent tool.
- Daily Pipeline now writes `/fins/earnings-date` instead of the legacy next-business-day `/equities/earnings-calendar`.
- Added as-of-safe NextEarningsDate resolution (latest publication <= analysis as-of) and Portfolio / Screening enrichment. Existing Watchlist catalyst logic can consume DaysToNextEarnings.
- Trade-date default is now explicit JST calendar today, independent of market DataLake as-of. Manual historical date edits are preserved while the page remains open.
- Legacy `jq_earnings_calendar_v1.sqlite` is left untouched for audit but is no longer the canonical source.
- Beta1 Data Quality canonicalization and beta2 memo/UI cleanup remain unchanged.

# v7e-beta2 cleanup — Legacy UI Dependency Cleanup (2026-09-10)

- Physically removed the legacy test/parity/detail UI markup from the production document instead of hiding it with CSS.
- Rebuilt the four production tabs as the only application DOM surface; retained only current daily, trade, watchlist, backup/DataLake maintenance, and emergency diagnostic cards.
- Audited the daily pipeline dependency path before removal. Shared calculation/worker functions remain intact; legacy status rendering is now optional when its old diagnostic DOM is absent.
- Fixed Discovery recalculation to accept the canonical pipeline/share `asOf` directly instead of depending on the removed legacy date input.
- Preserved the operational Watchlist alert dependency by moving only the required Preview result / explicit Commit surface into the current Watchlist management card.
- Removed the old global VOID control and obsolete same-browser snapshot UI; current inline trade VOID and external backup remain unchanged.
- beta1 data-quality canonicalization and beta2 trade-memo semantics are unchanged.

# v7e-beta2 — Trade Memo + Production UI Cleanup (2026-09-09)

- Added one persistent memo per security × account/category (`NISA` / `現物` / `信用買` / `信用売`) in private DB.
- Trade entry now has a single memo field below price/date; Preview/Commit carries the memo into the audit log and position memo.
- Each active holding card shows the same memo with inline edit/save beside `縮小/決済`. Memo survives full close/re-entry via a dedicated `portfolio_position_memo` table.
- Existing `user_stocks.memo` values are non-destructively migrated on first use.
- Legacy test/detail UI remains removed from the four production tabs while mature diagnostic DOM/handlers stay hidden for rollback safety; no calculation semantics changed.
- Inherits beta1 Data Quality Canonicalization unchanged.

# v7e-beta1 — Data Quality Canonicalization (2026-09-09)

- Promoted from final alpha gate `v7e-alpha114` to the first beta.
- Fixed `web_portfolio_integrated.csv` master attributes by mapping the actual master schema (`market_name`, `sector17_name`, `sector33_name`, `margin_name`).
- AI Share price history now resolves one canonical year shard per year and uses `bars_recent` only as fallback, preventing year/recent overlap double-counting.
- AI Share canonical export removes exact duplicate rows from margin, market short-ratio, large-short and investor-flow histories while preserving the raw DataLake for audit.
- Added `historyDataQuality` to AI Share manifest with raw/canonical/removed counts.
- Raw range writers now use stable content-based row identity instead of response-order `seq`, reducing future duplicate accumulation across overlapping refetches.
- No destructive DataLake migration. Existing raw rows remain intact.

# v7e-alpha114 — Trade Export Freshness + Form Reset Hotfix (2026-09-09)

- AI Share `web_trade_history.csv` now reads `jq_private_v1.sqlite` through a fresh writable SAH Pool connection so trades committed earlier in the same browser session are visible to the export.
- Successful trade COMMIT now resets the entry form only after the save succeeds: code/price cleared, name status returns to `未確認`, lots returns to `1 ×100株`, date returns to the canonical current date, and account/action return to safe defaults. Preview or failed COMMIT does not clear input.
- No Screening, Portfolio valuation, Watchlist/Discovery, or daily-pipeline calculation semantics changed.

# v7e-alpha114 — Trade Name Row Width Final Polish (2026-09-09)

- 売買フォームの「銘柄名を表示 / 未確認・銘柄名」行をフォーム全幅に拡張。
- 銘柄名表示領域が右端近くまで使えるため、長い銘柄名の不要な折り返しを大幅に削減。
- 銘柄コード / 口座・区分、操作 / 株数、約定単価 / 売買日の配置・縦間隔は変更なし。
- 計算・Portfolio・Watchlist / Discovery・追跡終了ロジックは変更なし。

# v7e-alpha114 — Trade Form Mobile Layout Final Polish (2026-09-09)

- 売買フォーム上段を「銘柄コード / 口座・区分」の2列に戻し、銘柄名確認を独立した次行へ移動。
- 「銘柄名を表示」ボタンの右隣に `未確認 / 銘柄名` を表示し、長い銘柄名が口座・区分や株数のレイアウトを押し広げない構造へ変更。
- alpha111までに確定した操作→約定単価、株数→売買日の縦間隔は維持。
- Watchlist / Discovery の簡潔な説明文とalpha110以降の計算・追跡終了ロジックは変更なし。
- 計算意味論の変更なし。

# v7e-alpha114 — Beta Gate Final Polish (2026-09-08)

- Trade identity row finalized for mobile: Code / confirmation state / Account labels align horizontally; confirmation is centered above the name lookup button without inflating adjacent field spacing.
- Preserved alpha110 portfolio valuation, trade-row vertical rhythm, Watchlist/Discovery state semantics, and audit-preserving close actions.
- Added concise Watchlist-page legend: Watchlist = daily monitoring; Discovery = post-discovery follow-up tracking.
- No calculation semantics changed.

# v7e-alpha110 — Beta Gate UI Finalization (2026-09-08)

- 売買フォームの確認状態を「銘柄名を表示」ボタン直上へ移動し、2列フォームの縦間隔を7pxへ統一。操作→約定単価、株数→売買日の間を同じリズムで微調整。
- Watchlist/Discovery一覧の状態を分離表示。Discovery Active/Closed と Watch Active を独立バッジ化。
- Discoveryの既存 `InitialPrice` を登録基準価格として表示し、旧EpisodeでもDataLakeで確定済みの開始価格を再利用。
- WatchlistとDiscoveryに独立した追跡終了ボタンを追加。終了は物理削除せず履歴を保持し、DiscoveryのManualCloseは日次再計算でも再オープンしない。
- 追跡終了結果に技術情報＋日本語まとめを併記。既存CSV Importの日本語まとめも維持。
- alpha109で実機PASSしたPortfolio最新終値14/14・評価額・評価損益resolverを維持。
- beta1昇格前の最終UI/状態管理候補。

# v7e-alpha110 — Beta Candidate Hotfix / Portfolio Valuation & Mobile Form (2026-09-08)

- 保有一覧の0円損益の真因を修正。`my-stocks-analysis` のbars組み立てで `tv` 未定義参照が発生し、価格解析全体が例外終了していた。終値・出来高から安全に `tv` を生成し、最新終値・評価額・評価損益・損益率を復旧。
- 売買フォームの銘柄コード入力をモバイル数値キーボード優先へ変更（input自体は英数字を保持できるtext型）。
- 売買フォームを明示2列グリッド化し、操作/株数と約定単価/売買日の間の余分な縦空白を除去。
- alpha109もβ昇格判定用Release Candidate。実機で最新終値・損益表示、Watchlist CSV Import、次回日次PASSを確認後にbeta1へ昇格予定。

# v7e-alpha107 — Beta Candidate / Daily UX & canonical close fix (2026-09-08)

- Watchlistの主操作を `investment_tracking_input.csv` 一括Import → Preview → Commitへ変更。個別手入力は折りたたみへ格下げ。
- 保有一覧の価格resolverを修正。`my-stocks-analysis` の未定義変数で価格取得が落ち、0円表示になっていた不具合を修正。
- 「現在値」を「最新終値」へ変更し、最新終値ベースで評価額・評価損益・損益率を算出。価格なしは0円ではなく明示。
- 約定単価をモバイルのdecimal数値入力へ統一。株数は従来どおりUI入力×100、DB内部Sharesは実株数。
- 旧テスト・詳細ツールはproduction 4タブから非表示を維持。
- alpha107はβ昇格判定用Release Candidate。実機で日次・Portfolio価格・CSV ImportがPASS後にβへ昇格予定。

# v7e-alpha107 — Daily UI / Portfolio / Watchlist refinement (2026-09-08)

- Screening共有ZIPを「日々分析」へ移動し、旧Screeningタブを「ウォッチリスト」へ変更。
- Watchlist/Investment Trackingを専用ページへ移し、一覧右側から追跡終了できる簡易操作を追加。Discovery履歴は保持。
- 保有銘柄一覧を口座管理型ダッシュボードへ刷新。全体/NISA/現物/信用買/信用売タブ、現在値、平均取得、評価額、評価損益、損益率を表示。
- 売買入力に銘柄名確認ボタンを追加。
- 株数入力を「1 ×100株」方式へ変更。UIで100倍してから既存の実株数Sharesへ渡すため、DB/平均単価/実現損益の意味論は変更しない。Previewで実株数と取引金額を明示。
- 売買入力のメモ欄を撤去（既存DB列・過去監査データは保持）。
- 日々分析から開発/保守向けcheckpoint操作を通常表示から外した。
- alpha105のBackup/Restore、inline VOID、Large Short canonical fixを継承。

# v7e-alpha105 — Production UI Architecture Cleanup / Backup & Restore

- Reorganized the production PWA into four top-level views: 日々分析 / 銘柄・売買 / スクリーニング / 設定・保守.
- Removed legacy/duplicated development cards from the normal production UI while keeping mature handlers available internally for diagnostics and rollback safety.
- Daily page now centers on the canonical Web-first daily pipeline and AI Share; the redundant standalone daily-update path is no longer shown in normal use.
- Portfolio Trade VOID confirmation is now completed inline in the trade-history row (Preview → 確定 / やめる) with no scroll-back requirement.
- Large-short canonical aggregation now treats a latest zero-ratio/zero-share subject report as an exit and excludes it from active SubjectCount / aggregate freshness.
- Added lightweight user-data backup ZIP for jq_private_v1.sqlite, covering Portfolio / Watchlist / Discovery / Investment Tracking / Web trade + VOID audit state. API keys are explicitly excluded.
- Added guarded user-data restore from the alpha105 STORE-format ZIP with SQLite-header validation, format check, explicit confirmation, streaming import and post-restore quick_check.
- Existing full DataLake external backup/restore remains available in Settings / Maintenance for device migration and disaster recovery.
- Version/header/app worker/service-worker/release metadata synchronized to alpha105.

# v7e-alpha104 — Short-ratio canonical field fix

- Root cause confirmed against J-Quants API v2 schema: `/markets/short-ratio` uses `ShrtWithResVa` and `ShrtNoResVa`; alpha102/103 incorrectly expected `ShortWithResVa` / `ShortWoResVa`.
- AI Share Stage 2 now reads canonical v2 fields `S33`, `SellExShortVa`, `ShrtWithResVa`, `ShrtNoResVa`, while retaining legacy aliases for compatibility.
- Existing raw rows in Web DataLake can be re-exported without re-running the daily pipeline because raw JSON was preserved intact.
- alpha103 fail-closed DQ remains: SellExShort-only rows cannot pass; short component + finite ratio + non-zero evidence are required.
- Version/header/worker/service-worker cache metadata synchronized to alpha104.

# v7e-alpha104 — Short-ratio fail-closed + schema compatibility

- Fixed the alpha102 false-PASS condition: `SellExShortValue` alone is no longer considered valid short-ratio analytics.
- DQ now requires a real short-selling component (`ShortWithRestrictionValue`, `ShortNoRestrictionValue`, or compatible total-short field), a finite 0–100 ratio, and at least one non-zero ratio row.
- Added compatibility aliases for possible v2 short-component keys and optional `ShortTotalValue`; exporter can derive the ratio from total short value when split restriction fields are unavailable.
- If the stored DataLake still lacks short components, AI-share generation fails closed instead of exporting a misleading 0% series.
- This release intentionally does not fabricate short-selling values from `SellExShortValue`.

# v7e-alpha102 - 2026-09-08

- Fixed `/markets/short-ratio` AI-share mapping for J-Quants API v2 abbreviated fields: `S33`, `SellExShortVa`, `ShortWithResVa`, `ShortWoResVa`; legacy/full-name aliases remain readable.
- `market_short_ratio_history.csv` now derives `ShortRatioPct` from actual market/sector turnover values instead of exporting populated rows with blank analytics.
- Added `marketShortRatioValid` DQ count and fail-closed invariant: if stored short-ratio rows exist but zero rows contain analytic values, AI-share ZIP generation fails.
- Preserved alpha101 price-history, market-flow, large-short canonicalization, EPS split, and Web-first semantics.

# v7e-alpha99 - 2026-09-07

- Web日次Screeningで決算当日銘柄をFinancialDataFlagに関係なくEarningsReactionPendingとして保持。worker pending件数と候補pending件数のinvariantを追加。
- Web Screening共有ZIP名を `web_screening_YYYYMMDD.zip` に変更し、PC版と識別可能にした。
- Portfolio Trade Logに安全な誤入力取消（VOID）を追加。取消は監査履歴を残し、現在ポジションを取引前状態へ復元。同一銘柄・口座は最新の有効入力からのみ取消可能。
- service-worker cache/versionをalpha99へ同期。

## v7e-alpha97 — 2026-09-07
- Fixed Web-first daily Screening event-feature JOIN: worker rows are keyed by `code`; daily pipeline no longer drops EarningsElapsedTradingDays / PostEarningsDrift silently.
- Added a daily Screening event JOIN invariant: if event rows exist but zero rows join, the pipeline fails instead of reporting a false PASS.
- Portfolio AI-share margin snapshot now recognizes canonical J-Quants `LongVol` / `ShrtVol` fields (with legacy aliases retained).
- AI-share coverage now counts margin/short-selling only when actual analytic values are present, not merely a snapshot date.
- Header/title/script/current version synchronized to v7e-alpha97.
- Existing alpha91 pipeline semantics, alpha94 artifact generate/download split, and alpha96 Portfolio/Trade Manager are otherwise unchanged.

## v7e-alpha96 — 2026-09-07
- Header/current version display synchronized to alpha96.
- Analyze registration list now resolves Equities Master company names and uses mobile-friendly cards.
- Added Web-only Portfolio/Trade Manager for NISA/spot/margin-long/margin-short with Preview→Commit, position update, and persistent trade ledger.
- Existing alpha91 daily pipeline and alpha94 share artifact semantics unchanged.

## v7e-alpha95 - 2026-09-07
- Add top-level Web-only `銘柄を登録・管理` daily-use UI backed by the existing alpha90 Investment Tracking Preview → Commit engine.
- Support direct single-code ADD / UPSERT / REREGISTER / CLOSE without creating `investment_tracking_input.csv`.
- Add current Discovery/Watchlist registry view and one-tap Watchlist close form population; destructive state changes still require explicit Preview then Commit.
- Preserve Discovery Episode history on Watchlist close; TRACK_ONLY remains non-destructive and cannot be hard-deleted through the daily UI.
- Resolve direct-registration apply date from the same canonical Web-first as-of resolver used by share outputs; Discovery recalculation runs after committed Discovery create/update.
- alpha91 daily pipeline and alpha94 canonical share/download semantics are unchanged.

## v7e-alpha94 - 2026-09-07
- Share ZIP canonical as-of resolver now uses latest PASS daily-pipeline checkpoint plus DataLake latest trading day; stale UI date fields are no longer authoritative.
- Screening/ChatGPT share ZIP generation and download are separated. Generated artifacts can be downloaded repeatedly without rerunning analysis.
- Added explicit as-of consistency guards and manifest provenance.

## v7e-alpha93 — Web-only Screening share ZIP + top-level daily output
- Added a top-level `Screening共有ZIPを作成（Web-only）` button beside the daily operational outputs.
- Generates `screening_YYYYMMDD.zip` without a PC refresh from canonical Web-first Screening / Factor / Discovery state.
- Includes screening candidates/AI view, Factor latest/summary, Discovery Episode master/analysis, Discovery Daily, manifest and README.
- Does not fabricate auxiliary files whose Web-native semantics are not yet implemented; `candidate_earnings_history.csv` and `management_guidance_summary.csv` are explicitly listed as omitted in the manifest and do not block ZIP generation.
- alpha91 ADVANCE/REPAIR daily pipeline and alpha92 Portfolio/AI Share semantics are unchanged.

## v7e-alpha92 — Web-only Portfolio / AI Share stage 1
- Added a top-level Web-only ChatGPT share ZIP export using private `user_stocks` + current Web DataLake.
- Export contains `web_jqp.json`, `web_portfolio_integrated.csv`, `manifest.json`, and `README.txt`.
- No PC-side portfolio/JQP refresh is required for this current-snapshot share path after the one-time portfolio migration into Web private state.
- Explicitly does not claim full parity with the PC JQP historical CSV bundle yet.
- alpha91 daily pipeline and verified Investment Tracking / Screening / Discovery / Watchlist semantics are unchanged.

## v7e-alpha91 — Web-first daily pipeline orchestration (2026-09-05)

- Add top-level `日次運用を実行（Web-first）` button above the existing DataLake-only update action.
- Chain DataLake update/repair → Screening → Discovery Episode → Discovery Daily → Factor/Seasonality → Watchlist Alert Preview.
- Persist per-run/per-stage checkpoints in `/jq_private_v1.sqlite` and resume incomplete runs from unfinished stages.
- Emit START/PASS/SKIP/REPAIR/FAIL in one screen and export the same run trace as diagnostic CSV.
- Keep Standard supply-demand Plan Adaptive: optional failures are recorded while critical datasets stop the pipeline.
- Run Factor/Seasonality from Web state and Web monthly seasonality cache without requiring PC parity files.
- Keep Watchlist Alert non-destructive: daily pipeline stops at Preview and never auto-commits alert state.
- Do not change alpha90 Investment Tracking routing/commit semantics or previously verified Screening/Discovery/Watchlist engines.

## v7e-alpha90 — Investment Tracking formal Web connection (2026-09-05)

- Promote `investment_tracking_input.csv` from audit-only to Preview → Commit workflow.
- Resolve Watchlist ReferencePrice and Discovery InitialPrice from Web DataLake unadjusted close on StartDate; if StartDate is a non-trading day, use the next available trading-day close and record the actual date/source.
- Apply TRACK_ONLY / WATCH / ACTIONABLE / WATCH_ONLY lifecycle semantics to Discovery and Watchlist in one private-DB transaction.
- Preserve Discovery history on REMOVE/CLOSE; support Watchlist ADD/UPSERT/REREGISTER/CLOSE without destructive cross-lifecycle deletion.
- New Watchlist registrations receive fresh state; UPSERT preserves existing state; REREGISTER closes the previous active registration and opens a new WatchID.
- Persist an Investment Tracking import audit history with before/after private-state snapshots and expose an apply-trace CSV before commit.
- After a committed Discovery change, automatically recalculate Discovery Episode performance for the same as-of date.
- Existing Web-first Watchlist Alert baseline is not reset by this release.

# v7e-alpha86 - 2026-09-05

## v7e-alpha89 — Watchlist fundamental fingerprint canonicalization (2026-09-05)

- Fix false Fundamental re-evaluation alerts on first Web-first Watchlist preview.
- Root cause: Web `screening-base-snapshot` exposed operating/ordinary profit fields but omitted the PC-compatible derived `ForecastPrimaryProfit` and `PrimaryProfitProgressPct`, so 9/11 migrated Watchlist fingerprints appeared to lose values despite unchanged disclosure dates/EPS/dividend.
- Add canonical `CurrentPrimaryProfit`, `ForecastPrimaryProfit`, and `PrimaryProfitProgressPct` to the Web screening base snapshot using the same OperatingProfit→OrdinaryProfit semantics as PC Screening.
- Make Watchlist fingerprint generation use canonical derived values with compatibility fallback.
- Extend Watchlist Alert diagnostic CSV with period/profit type and canonical primary-profit/progress fields so future fingerprint mismatches are inspectable without a diagnostic build.
- No automatic state mutation: preview/commit semantics are unchanged.


- Factor `technical-screening-poc` の実装上残っていた75営業日gateを60営業日へ修正。CHANGELOG上だけ60日になっていた不整合を解消。
- Forecast Earnings Growthの前年FY resolverを、actual FY行だけを対象に `CurFYEn` / `CurPerEn` の両方で年差を評価する方式へhardening。aliasだけで判定できない場合はforecast-only行を除外した最新actual FYを安全fallbackとして利用。
- Factor財務診断へ target FY / latest FY raw end / previous FY raw end / resolver / candidate count / FY history trace を追加し、`screening-base-snapshot`で診断列が消えていた問題を修正。
- Factor engine stateを `FactorWebV6-alpha86` へ更新し一度だけ再seed。
- `docs/history/README_alpha*.md` の大量個別履歴を3つのマイルストーン範囲ドキュメントへ統合。今後は個別READMEを増やさない。

# v7e-alpha85 - 2026-09-05

## Factor / Seasonality
- Correct previous-FY baseline selection for `ForecastPrimaryProfitGrowthPct`: use `CurFYEn` first, matching PC `_previous_fy()`, with `CurPerEn` only as fallback.
- Align prior-FY diagnostic output with the same semantics.
- Advance Factor engine state to `FactorWebV5-alpha85` for one safe Strength reseed.
- Preserve Web-only valid market-cap / reported-ROE observations as explainable enrichment rather than suppressing them only for exact PC equality.

## Documentation / release management
- Consolidate all per-version `README_alpha*.md` files under `docs/history/`; do not place them in ZIP root going forward.
- Refresh `docs/README.md`, `docs/CURRENT.md`, and `docs/INDEX.md`.
- Normalize `release_history.json` to a single chronological `history` array.

# v7e-alpha84 - 2026-09-05

- 最新PC `screening_all.csv` とWeb membership 1,968銘柄を全件照合し、Valuation/Sectorは一致、残差を Size / HighROE / EarningsGrowth の3系統へ圧縮。
- J-Quants V2のFY実績行で、予想成長率の前年FYアンカーを `CurFYEn` 優先で解釈すると前年FYを見失うケースを修正。Factor用の前年FY比較ではactual period endである `CurPerEn` を優先する。
- PCに存在しWebで欠けていた `ForecastPrimaryProfitGrowthPct` 11銘柄の復元を狙う。
- Factor財務診断CSVへ前年FYの開示日・期間末・基準利益を追加し、残差を更新版なしで追えるよう強化。
- Factor engine stateをV4へ更新し、修正後のmembershipでStrength履歴を一度だけ安全に再seed。
- Webだけが持つ有効な時価総額/ROE観測をPC完全一致のために意図的に捨てない。残差がそこだけになればFactor/Seasonality全面Parityを卒業し、Web-firstへ移行する方針。

# v7e-alpha83 - 2026-09-05

## Factor / Seasonality parity hardening
- Factor base eligibility now follows the PC common universe minimum of 60 price-history days (previous Web PoC silently required 75).
- Financial normalization is explicitly as-of dated and no longer reuses a future/stale normalized snapshot across trading dates.
- One-click update re-checks the most recent 7 calendar days of Financial Summary so late earnings/dividend revisions are captured; each refreshed disclosure-date snapshot replaces the old same-date snapshot.
- Derived in-memory caches are invalidated after DataLake updates.
- Factor Strength history is versioned; after a factor-engine change, prior Web state is ignored once and previous Strength is re-seeded from the supplied PC current/StrengthChange1D pair.
- EffectiveShares exposed to Screening/Factor now follows the PC Factor definition (latest FY ShOutFY - TrShFY); BPS internal fallback remains unchanged.
- Added Factor financial-input diagnostic CSV with financial source dates and forecast inputs.

# v7e-alpha82 - 2026-09-03

- Factor Monitor parity follow-up from alpha81 diagnostics.
- Restored PC-equivalent Size factors by adding `EstimatedMarketCap = Close * EffectiveShares` to the Web Screening base.
- Restored `LatestTradingValueRatioTo20D` from daily turnover and wired it into Factor `MedianTradingValueRatio20D` / `FlowProxy`.
- Fixed Factor Summary sort comparator precedence so rank ordering follows the PC implementation.
- Added monthly Sector Seasonality cache persistence. PC itself reuses `private/work/seasonality/sector_seasonality_profile_YYYYMM.csv` within a month, so a mid-month Web migration can import that profile once instead of rebuilding from a different current universe.
- Added optional PC monthly Seasonality profile seed input and `Web Factor membership` diagnostic CSV export.
- Existing Screening / Discovery / Watchlist parity logic is unchanged.

# v7e-alpha81 - 2026-09-03

- Added Factor Monitor PC/Web parity from the full Web Screening universe.
- Recalculates Size / Valuation / Quality / Growth / Sector factor groups, robust medians/breadth, Strength, Acceleration, Phase and Alert using the PC FactorMonitorV1 definitions.
- Added independent SectorSeasonalityV1 reconstruction from Web DataLake monthly stock/TOPIX history over the same 10-year lookback and look-ahead cutoff.
- Added initial StrengthChange1D history bootstrap: only the prior Strength baseline is inferred from PC latest on first run; current factor values are independently recalculated by Web. Subsequent dates use Web private factor state.
- Added optional Factor Summary parity.
- Added diagnostic exports for Web factor_monitor_latest, cell-level factor parity diffs, and the full Web seasonality profile.
- Screening / Discovery / Watchlist migration logic is unchanged.

# v7e-alpha80 - 2026-09-03

## Watchlist / Investment Tracking migration baseline
- Added PC Watchlist master/state migration into `/jq_private_v1.sqlite` with exact row/column round-trip parity.
- Added Web export of the migrated Watchlist master/state for audit and backup.
- Added canonical `investment_tracking_input.csv` validation/routing audit for `TRACK_ONLY / WATCH / ACTIONABLE / WATCH_ONLY`.
- Routing preserves PC semantics: Discovery history is not deleted by REMOVE/CLOSE; ACTIONABLE is a priority re-evaluation request, not a BuySignal.
- Alert engine is intentionally not activated yet: Watchlist Factor/Seasonality triggers depend on the next native Factor/Seasonality parity layer.
- Screening 100%, Discovery Episode, and Discovery Daily basis-date PASS logic are unchanged.

# v7e-alpha79 - 2026-09-03

- Fixed a JST/UTC off-by-one bug in `isoDays()`: constructing local midnight then calling `toISOString()` shifted every date scan one calendar day backward on Japanese devices.
- Supply range scans now query the actual requested dates, so a 2026-09-03 short-sale-report refresh includes `disc_date=20260903` instead of ending at 20260902.
- Made weekday/date arithmetic timezone-independent for `isoDays`, `isoWeekdays`, margin-interest Friday selection, one-click next-day update, and the legacy 5-day sync helper.
- Screening default as-of now uses the local calendar date rather than UTC date.
- Discovery/Screening calculation logic itself is unchanged.

# v7e-alpha78 - 2026-09-03

- Discovery Daily historical technicalで、Web Shardのretroactive `AdjC`をさらに`AdjFactor`で再調整していた二重調整を修正。Base/Return用のadjusted closeとtechnical用のraw closeを分離し、9/3のTechnical残差13セルをPC値へ再現する入力意味論に統一。
- Discovery Dailyは過去日をfreezeしたまま、現在の`asOf`日だけ再計算・置換できるよう変更。同日中に需給等が更新された場合でも翌日を待たず再評価可能。
- 大口空売りは直近日の取得済みcoverageがあっても、最上段の一括更新では直近3日を再照会可能に変更。JPX/J-Quantsの同日複数回更新によるpartial snapshot固定を防止。
- `short_sale_report`保存は再照会したDiscDateの既存raw行を削除してから最新API snapshotへ置換。再取得のたびに旧行を蓄積しない。
- 診断の結果、9/3 Supply残差16セルはWeb計算式ではなくPC/Webの大口空売りraw snapshot vintage差が主因と判明。PC側alpha26a13で同日/直近snapshot refreshを行い、新しいPC基準で再Parityする。

# v7e-alpha77 - 2026-09-03

- 「次の取引日を全データ更新」で需給5種が `Can't find variable: writerCmd` となる実装ミスを修正。coverage照会へ `workerCmd` を正しく渡す。
- 日足がすでに最新日まで更新済みで次取引日が未配信の場合でも、最新取引日の需給5種だけをcoverage付きで補完・再確認し、需給正規化まで実行するよう改善。
- これにより、主要データだけ先に9/3へ進んだケースでも、翌日の日足を待たず同じ最上段ボタンで9/3の任意需給を再試行できる。
- Screening / Discovery Episode / Discovery Daily の計算ロジックは変更なし。

# v7e-alpha76 - 2026-09-02

- Discovery DailyのCSV出力を「保存済み固定履歴」と「Web計算エンジン」に分離。alpha75の既存出力が固定seedを出していたため、計算差の診断に使えない問題を修正。
- Discovery Daily Parityの差分セルを `Scope/EventID/Date/Code/Group/Field/PC/Web` 形式の診断CSVとして出力可能にした。
- Technical差が残ったコードだけについて、bars Shard/raw_json/採用OHLC/AdjFactorを追跡できるWebテクニカル入力診断CSVを追加。
- Discovery Dailyの大口空売り集計をPC `build_screening_supply_features` と同じ「各as-of日から470日前の窓」に修正。最古Episode基準の長い共通窓を後日の行にも使っていた差を解消。
- 空売り報告のraw `data_date` がAPI行の空 `Date` に吸われて空欄になる問題を修正。既存alpha75以前の空欄行も `raw_json.DiscDate/CalcDate` からcoverageを復元し、再取得時の無駄な全件やり直しを防止。
- Screening 87/87 PASS、Discovery Episode 23/23 PASS、Discovery Daily append/freeze設計は変更なし。

# v7e-alpha75 - 2026-09-02

- Discovery DailyをPCと同じ append/freeze 履歴へ変更。既存PC `discovery_episode_daily.csv` を一度Web private DBへ移行し、既存 Episode×Date は再計算で上書きしない。
- Discovery Daily Parityを「基準日の計算エンジン監査」と「全履歴診断」に分離。過去のvintage/provenance差と現在計算差を混同しない。
- Sector benchmarkの母集団をPC Screening universe（Prime/Standard/Growth + ProductCategory=011）へ一致。
- historical technicalの日足入力をraw_jsonからPCと同じフィールド優先順位で再構築。AdjH/AdjLを誤って利用して分割調整を二重適用する差を修正。
- 信用残の必要履歴を一律470日前とする誤診断を修正。信用残はEpisode最古日から21日前、大口空売りは470日前を別々に監査。
- 需給5種に取得coverageを追加。既取得日はAPI照会をskipし、再実行時に最初から取り直さない。既存DBのdata_dateも初回coverageとして再利用。
- 空売り報告raw保存のdata_date候補へ `DiscDate` / `CalcDate` を追加。
- Discovery Dailyから基準日の対象コードについてWeb大口空売りraw診断CSVを出力できるようにし、残るSupply差を更新版なしで追跡可能にした。
- 「次の取引日を全データ更新」をページ最上段へ移動。週次需給は14日、日次公表需給は3日の短いlookbackで未取得/遅延分のみ確認。
- Screening 87/87 PASS、Discovery Episode 23/23 PASSの基準ロジックは変更なし。

# v7e-alpha74 - 2026-09-02

- Web DataLakeに「次の取引日を全データ更新」を追加。
- 日足DataLake最新日から、J-Quantsで次に配信済みの日足日を自動探索（週末・休場日を自動スキップ）。
- 対象日に日足 / 銘柄マスター / 財務サマリー / 決算予定 / TOPIX / 営業日カレンダー / Standard需給5種を順次取得・保存。
- 需給取得後に分析用正規化まで自動実行。
- 各個別カードの日付入力も対象日に同期し、翌日は同じボタンを押すだけで次取引日へ進める。
- 日足未配信時は他データを更新せず安全停止。需給などPlan依存項目は失敗しても主要データ更新を継続するPlan Adaptive動作。
- Discovery Episode / Discovery Daily parityロジックはalpha73から変更なし。

# v7e-alpha73 - 2026-09-02

- Discovery Daily 42-column PC/Web Parityを追加。
- Episode×取引日の価格/TOPIX/sector/historical technical/Standard需給/MarketRegimeをWeb DataLakeからpoint-in-time再計算。
- 差分をBase/Sector/Technical/Supply/Provenance/Marketへ分類し、空売り履歴coverageも表示。
- Screening 100% PASSとDiscovery Episode 23/23 PASSの既存ロジックは変更なし。

# CHANGELOG

# v7e-alpha88 - 2026-09-05

- Factor / SeasonalityのWeb-first canonical stateをWatchlistへ接続し、Re-Evaluation Alertエンジンを追加。
- Price / Valuation / Fundamental / Factor+Seasonality / Technical / Catalyst / ReviewExpiryをPC WatchlistReEvaluationV1の意味論から移植。AlertはBuySignalではなく再評価要求。
- Alert計算をPreview（非破壊）とCommit（state保存）に分離。Preview段階ではWatchlist master/stateを変更しない。
- 初回Web-first移行ではFactor/Seasonalの状態変化Alertだけを一度baseline抑制し、PC Factor→Web Factorのエンジン差による誤通知を防止。
- Commit後はcurrent alertと重複排除されたalert historyをprivate DBへ保存。同一triggerの連続通知はWatchlist stateで抑制。
- per-watchの価格/Valuation/財務fingerprint/Factor/Seasonality/Technical/Catalyst/Expiry入力と前回stateをWatchlist Alert診断CSVへ出力可能。
- 日次一括更新の日付同期対象へFactor / Watchlist Alert基準日を追加。
- READMEを個別増殖させず、`docs/history/alpha80-alpha88.md` へ統合追記。

## v7e-alpha72 — 2026-09-02
- Screening 5戦略 PC/Web 87/87完全一致を基準点として固定。
- Discovery EpisodeのPC→Web移行を追加。`discovery_episode_master.csv` を `/jq_private_v1.sqlite` にupsert保存。
- Web DataLakeの日足/TOPIXからEpisode成績を再計算。固定1/5/10/20/60営業日、TOPIX相対、20/60日最大上昇・最大DD、3か月期限をPC仕様に合わせた。
- `discovery_episode_analysis.csv` とのPerformance ParityとWeb CSV exportを追加。
- alpha71のEarningsEventDate分離、alpha70のQVR/Crowding修正を維持。
- app/worker/service-workerのcache bustをalpha72へ更新。

## v7e-alpha99 — Parity trace + Trade VOID UI hardening
- Trade VOID preview uses delegated click handling on the history container, with explicit RUN/PASS/FAIL feedback and `type=button`.
- Trade history now displays why an older row cannot be voided (`後続取引あり` / `取消済`) instead of silently hiding the control.
- Web Screening share adds `screening_parity_trace.csv`, a compact full-scored-universe audit trace for temporary PC/Web migration diagnostics. It is diagnostic, not a new investment input contract.
- Existing alpha98 PED / EarningsReactionPending invariants and Web-first semantics are preserved.

## v7e-alpha100 — AI Share Stage 2 (2026-09-08)
- ChatGPT保有株共有ZIPをStage 2へ拡張。
- 現在snapshotに加え、保有銘柄の5年価格履歴、財務開示履歴、信用残履歴、空売り比率履歴、大口空売り履歴、市場フロー履歴、Web売買履歴を同梱。
- 価格履歴はモバイル生成負荷を抑えるため5年に制限。財務・需給・市場フローはWeb DataLakeで利用可能な履歴を出力。
- Web売買履歴はPortfolio Manager導入後の監査ledger。VOID行を保持し、将来の成績集計では除外可能。
- PC JQP 16ファイルの盲目的複製ではなく、AI投資分析に必要な履歴レイヤーをWeb-firstで追加。

## v7e-alpha101 — AI Share Stage 2 Data Quality Hotfix (2026-09-08)
- Fixed `portfolio_prices_history.csv` export: canonical shard path handling and 4-digit/5-digit J-Quants code matching.
- Corrected short-ratio semantics: `/markets/short-ratio` is exported as market/section-level `market_short_ratio_history.csv`, not as a portfolio-code dataset.
- Corrected investor-types semantics: market-wide rows are no longer filtered by portfolio code/Section.
- Added canonical portfolio large-short aggregation by reporting identity and freshness fields to the integrated snapshot.
- Split EPS semantics into `currentPeriodEPS` and `actualFYEPS`; legacy `eps` now means current-period EPS.
- Empty Stage 2 CSVs retain explicit headers. Price-history=0 now fails closed instead of producing a misleading PASS ZIP.


## v7e-alpha110 — Beta Gate Stabilization (2026-09-08)
- Portfolio dashboard latest-close resolver now uses the canonical recent DataLake DB first, with catalog shards as fallback; dashboard valuation no longer depends on the 75-day technical-analysis resolver.
- Portfolio latest close / market value / unrealized P&L / P&L% are calculated from the resolved latest DataLake close; missing prices fail visibly instead of becoming zero.
- Watchlist cards now show InvestmentStatus badge, Watch Active state, registration date, ReferencePrice, latest close/date, and return since registration.
- Watchlist CSV Preview keeps raw diagnostic codes and adds a final Japanese summary explaining whether the user can continue.
- Trade form row spacing tightened so Operation/Shares and Execution Price/Trade Date render as adjacent rows on mobile.
- Existing Backup/Restore, VOID audit semantics, x100 UI conversion, Web-first Screening/AI Share semantics remain unchanged.
- This remains an alpha beta-gate build; promote to beta1 after real-device latest-close valuation + Watchlist import + next daily pipeline PASS.


## v7e-beta2 UI cleanup hotfix
- Fixed legacy/test/detail UI still rendering outside the production app shell on all tabs.
- Direct body legacy cards/details/notices/main blocks are now hidden before JavaScript runs; production cards are relocated into their intended tabs and remain visible.
- No DataLake, canonicalization, portfolio/trade memo semantics, Screening, or private DB logic changed.

## v7e-beta9 — Full Reset + Data Glossary
- ④トラブル診断にデータ種別の簡潔な説明を追加。
- 「完全初期化」と入力＋最終confirmの二重確認で、ローカルデータ完全初期化を追加。
- 完全初期化対象: OPFS/SAH Pool, IndexedDB, Cache Storage, local/session settings。ユーザーデータは事前バックアップ必須。
- 初期化後は容量再診断→バックアップ復元→quick_check→不足チェックの災害復旧フローを想定。
