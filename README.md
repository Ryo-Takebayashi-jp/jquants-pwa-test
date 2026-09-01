# J-Quants Local-first PWA v7e-alpha2

## 今回の目的
alpha1の `sqlite-worker.js` 例外を段階診断して、失敗箇所を明確化します。

## 実機テスト
1. Cloudflare Pagesへ配置
2. iPhoneで「① Catalog + bars_recent を作成」
3. PASSなら「② Catalog経由で bars_recent を再Open」
4. FAILなら `stage / message / stack` が表示されるので、その画面を共有

新機能は既存1.12GB DataLakeをOpen/変更/削除/移行しません。
