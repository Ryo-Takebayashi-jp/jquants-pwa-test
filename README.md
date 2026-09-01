# J-Quants Local-first PWA v7e-alpha17

## 追加: Catalog + Shards 外部バックアップ / 復元

alpha17では、ブラウザ内のSAH Poolだけではなく、iPhoneのFiles等へ
Catalog + ShardsのSQLite実体を外部保存できる正式バックアップ機能を追加しました。

### バックアップ
1. 2020〜2025全期間補完を完了させる（実行中にバックアップしない）
2. ①「バックアップ対象を確認」
3. 全DBが quick_check ok なら、
   - ③「全DBを順番に外部保存」を推奨
   - Safariが複数ダウンロードを止める場合は④で1ファイルずつ保存
4. Manifest JSONも保存
5. FilesアプリでSQLite群とManifestが存在することを確認

### バックアップ対象
- jq_catalog_v1.sqlite
- jq_bars_recent_v1.sqlite（存在する場合）
- jq_bars_YYYY_v1.sqlite
- 将来Catalogへready登録されたShard
- future financials / supply_demand / private shard命名パターンも検出可能

Legacy巨大DataLake / 診断用probe / 一時snapshotは新正式バックアップ対象から除外します。

### 復元
1. 保存したSQLiteをFilesから複数選択
2. ⑤「選択したDBを復元」
3. 各DBをStreaming Import
4. 各DB quick_check
5. ⑥「復元後の全Shard監査」

### 安全性
- DB本体のexportは1ファイルずつ処理し、全Shardを一度にRAMへ載せない
- restoreは既存のstreaming import機構を使用
- 同名DBは復元ファイルで置き換わるため、復元操作はユーザー明示操作のみ
- バックアップ前にquick_checkを必須化
- 外部バックアップはSafariサイトデータ消去から独立
- 旧「SAH Pool内スナップショット」はLegacy向けとして折りたたみに移動

## 既存機能
- v7e-alpha16: 2020〜2025をdate単位でJ-Quants V2から年別Shardへ直接補完
- Checkpointによる途中再開
- Catalog + year shards
- SAH Pool reserveMinimumCapacity(32)
