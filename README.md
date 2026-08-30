# J-Quants Local-first PWA v7b Cloudflare

目的:
GitHub Pagesでは未達だった crossOriginIsolated / SharedArrayBuffer を、
Cloudflare Pages + `_headers` で有効化できるか実機確認する。

## ファイル
- index.html
- app.js
- opfs-worker.js
- manifest.webmanifest
- service-worker.js
- _headers
- README.md

## Cloudflare Pages
GitHubリポジトリをCloudflare Pagesへ接続してデプロイする。
静的サイトなのでフレームワーク指定は不要。
ビルドコマンドは空欄、出力ディレクトリはリポジトリルート相当を使う。

## 重要
GitHub PagesとCloudflare Pagesはoriginが異なるため、
GitHub Pages側OPFSの1.12GB DBはCloudflareから直接見えない。
レスキュー済みSQLiteをv7cでCloudflare側OPFSへImportして引き継ぐ。

## v7bテスト
1. pages.dev URLをiPhoneで開く
2. 配信環境を確認
3. crossOriginIsolated / SharedArrayBuffer がPASSか確認
4. 64MB Direct OPFSテスト
5. 任意でレスキューSQLiteをFilesから選んで軽量確認
6. 総合判定
