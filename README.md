# J-Quants Local-first PWA PoC v2

v1で OPFS / SQLite-WASM / Web Worker / J-Quants API direct CORS がすべてPASSしたため、
v2では次を実機確認します。

1. 512MB OPFS書込
2. SQLite-WASM 100万行
3. J-Quants日足を複数銘柄直接取得
4. SQLiteへ格納
5. SQLiteバイナリをOPFSへ永続保存
6. PWA再起動後にOPFSから再読込
7. SMA5/SMA25/20D騰落率/20日平均出来高をブラウザ内計算

## 更新方法
GitHub Pagesの既存 `jquants-pwa-test` リポジトリへ、
このZIPの `index.html / app.js / manifest.webmanifest / service-worker.js / README.md`
を上書きコミットします。

公開後、iPhone PWAを完全終了して再起動してください。
古い画面が残る場合はSafariでページを再読み込みしてからホーム画面版を再起動してください。

## セキュリティ
APIキーは保存しません。
実データPoC DBはiPhone内OPFSにのみ保存します。
削除ボタンで `jq_poc_market.sqlite` を消せます。
