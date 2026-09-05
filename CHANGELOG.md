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
