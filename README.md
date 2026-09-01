# J-Quants Local-first PWA v7e-alpha1

巨大単一SQLiteから Catalog + Shards + lazy open へ移行する最初の実機ゲート。

## 実機テスト
1. Cloudflare Pagesへ配置
2. iPhoneで「Catalog + bars_recent を作成」
3. PASS後「Catalog経由で bars_recent を再Open」
4. PASSとShard Open時間を確認

この版の新機能は既存1.12GB DataLakeをOpen/変更/削除/移行しません。
2段階PASS後、次版で安全なbars shard移行を実装します。
