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

## v7e-alpha72 — 2026-09-02
- Screening 5戦略 PC/Web 87/87完全一致を基準点として固定。
- Discovery EpisodeのPC→Web移行を追加。`discovery_episode_master.csv` を `/jq_private_v1.sqlite` にupsert保存。
- Web DataLakeの日足/TOPIXからEpisode成績を再計算。固定1/5/10/20/60営業日、TOPIX相対、20/60日最大上昇・最大DD、3か月期限をPC仕様に合わせた。
- `discovery_episode_analysis.csv` とのPerformance ParityとWeb CSV exportを追加。
- alpha71のEarningsEventDate分離、alpha70のQVR/Crowding修正を維持。
- app/worker/service-workerのcache bustをalpha72へ更新。
