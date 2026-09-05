# Development history alpha30–alpha36

---

## alpha30

# v7e-alpha30 RSI / Volume Parity Fix

目的: alpha29で残った RSI14 1銘柄、LatestVolumeRatioTo20D 1銘柄の差をPC実装に合わせて解消する。

- RSI14: Web parity計算の履歴を100日から320営業日へ拡張。
- Volume: 欠損を0へ変換せずnullとして保持し、PC版と同じく直近20セッションの欠損を除外して平均。
- Low20D/Low60Dはalpha29/PC alpha26a4修正後の正しい調整後安値定義を維持。

実機では修正版PCの `screening_candidates.csv` を使って再度「PC版とWeb版を突合」を実行する。

---

## alpha31

# v7e-alpha31 Technical Parity Final Fix

## 原因
PC版 `screening.py` は `_adjusted_entries()` で株価OHLCをAdjFactor補正しますが、
出来高は補正済み配列からではなく、保持された元のrowから `Vo / Volume` を読みます。

そのためPC版:
- 株価: 最新基準へ調整
- 出来高: raw Volume

Web版alpha30:
- 株価: 調整後
- 出来高: `COALESCE(adj_volume, volume)`

6834 精工技研のようにAdjustment Volumeがraw Volumeと異なる銘柄で、
`LatestVolumeRatioTo20D` が大きく乖離していました。

## alpha31
Web Screeningの出来高をraw `volume`へ統一。
alpha30のRSI修正と欠損出来高除外はそのまま維持。

## 実機確認
修正版PCの2026-09-01 `screening_candidates.csv` を使って再突合。
目標:
- 92銘柄比較
- 全比較項目一致 92
- 不一致 0
- RSI14 92/92
- LatestVolumeRatioTo20D 92/92
- High/Low 20D/60D 92/92

---

## alpha32

# v7e-alpha32 Equities Master Shard

日足テクニカル移植完了後の第2データ層。

実機テスト:
1. 既存のJ-Quants APIキーを入力。
2. 「② 銘柄マスター Shard」で基準日 2026-09-01。
3. 「銘柄マスターを取得・保存」。
4. PASS / API rows / 保存 rows / quick_check=ok を確認。

保存先: `/jq_equities_master_v1.sqlite`
Catalog key: `equities_master`

次工程ではPC版SecurityMasterとの列・銘柄集合Parityを確認し、その後Financials Shardへ進む。

---

## alpha32b

# v7e-alpha32b Master API Token Hotfix

症状:
- APIキーを入力してもMasterカードが「APIキーを入力してください」と表示する。
- 一度エラー表示後、再タップしても変化が分かりにくい。

原因:
- alpha32のMaster取得は `prodToken` / `jqToken` だけを参照。
- 画面には用途別のAPIキー欄が複数あり、ユーザーが別欄へ入力するとMaster側から見えなかった。

修正:
- Masterカード専用 `masterToken` を追加。
- 全APIキー欄をセッションメモリで同期。
- Masterボタンはfinallyで必ず再有効化。
- APIキーは永続保存しない。

実機確認:
1. MasterカードのAPIキー欄へ貼り付け。
2. 基準日 2026-09-01。
3. 「銘柄マスターを取得・保存」。
4. PASS / API rows / 保存 rows / quick_check=ok を確認。

---

## alpha33

# v7e-alpha33 — Master + Financials + Earnings Calendar

実機テスト順:
1. ③ Master Parity: 修正版PCの `screening_candidates.csv` を選択して突合。
2. ④ Financial Summary: 2026-09-01 を取得・保存。
3. ⑤ Earnings Calendar: 2026-09-01 を取得・保存。

新DB:
- `/jq_fins_summary_v1.sqlite`
- `/jq_earnings_calendar_v1.sqlite`

既存:
- `/jq_equities_master_v1.sqlite`
- Catalog + yearly bars + bars_recent + private DB

財務/決算予定は最初からraw_jsonを保持するため、V2列追加・プラン差異があっても情報を捨てません。

---

## alpha34

# v7e-alpha34 Market + Supply/Demand Bundle

実機テスト推奨:
1. ⑥「市場基礎2種をまとめて構築」
   - TOPIX 2016-08-30 ～ 2026-09-01
   - 営業日カレンダー 同期間
2. ⑦「需給5種をまとめて取得」
   - 初回テスト範囲 2026-06-01 ～ 2026-09-01
3. 各項目の PASS/FAIL と rows、quick_check を確認。

Plan-Adaptive:
取得不可のAPIが1つあっても一括処理全体を停止せず、成功したShardは保存・Catalog登録します。

raw_jsonを保持し、PC版とのParity時に必要列を正規化します。

---

## alpha35

# v7e-alpha35 Supply/Demand API Strategy Fix

alpha34実機テストでJ-Quants API自身から返った400エラーを基に取得方式を修正。

- margin-interest: code/date必須 → 全市場では金曜日をdate指定して走査
- margin-alert: from/to利用時code必須 → 全市場では各平日をdate指定して走査
- short-ratio: range
- short-sale-report: disc_date_from / disc_date_to
- investor-types: range

実機確認:
⑦「需給5種をまとめて取得」を2026-08-01～2026-09-01で実行。
date走査は複数APIコールになるため、画面に進捗を表示します。
0件の日は異常ではありません。

なお、市場基礎の開始日は実機で確認した契約境界2016-09-01へ修正済み。

---

## alpha36

# v7e-alpha36 — Supply/Demand + Cache + API Key UX Fix

今回のスクリーンショットはalpha35の新ロジックではなく、alpha34型のエラー文がそのまま出ていました。
コード監査で Service Worker の CACHE 定数が `jq-pwa-v7e-alpha29` のまま残っていることを確認しました。

修正:
- Service Worker cache: alpha36
- app.js / sqlite-worker.js / service-worker.js: query version付き
- APIキー: 最上部共通欄へ一本化
- margin-interest: 金曜日 date scan
- margin-alert: 平日 date scan
- short-ratio: 平日 date scan
- short-sale-report: 平日 disc_date scan
- investor-types: range

実機:
1. alpha36をデプロイ後、最上部に「J-Quants APIキー」があることを確認。
2. APIキーを1回だけ入力。
3. ⑦「需給5種をまとめて取得」を実行。
4. 各カードに「取得方式: date-scan / disc-date-scan / range」と表示されることを確認。

これにより古いJSが動いているかも画面結果から判別できます。
