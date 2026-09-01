# J-Quants Local-first PWA v7e-alpha3

alpha2の診断追加時に欠落したSQLite/SAH Pool初期化行を復元した修正版です。

## 実機テスト
1. Cloudflare Pagesへ配置
2. iPhoneで「① Catalog + bars_recent を作成」
3. PASSなら「② Catalog経由で bars_recent を再Open」
4. FAILなら表示された stage / message / stack を共有

既存1.12GB DataLakeは新Catalog機能からOpen/変更/削除/移行しません。
