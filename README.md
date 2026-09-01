# J-Quants Local-first PWA v7e-alpha20

## Catalog read router
Catalog + Shardsの「読む側」を追加。

### 新機能
- Catalog収録範囲監査
- 年別Shard間に14日超の境界Gapがあれば警告
- from/to + 任意codeを指定してCatalog経由で読み取り
- 必要な `bars_YYYY` だけを自動open
- 複数年をまたぐrangeも1クエリとして扱う
- canonical year shardを優先し、bars_recentは年Shard欠損時のみfallback
- Shardごとの件数、期間、総件数、sampleを返す

### 実機確認
1. ① Catalog収録範囲を監査
2. Gap警告が出た場合は内容を保存（欠損補完対象）
3. 直近10日で②読み取りテスト
4. その後、年をまたぐ範囲でも②をテスト

## 既存
- alpha19 Shard-native本番日次更新
- 正式複数SQLite外部バックアップ/復元
