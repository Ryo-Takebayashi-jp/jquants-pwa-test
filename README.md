# J-Quants Local PWA Feasibility Tester

目的:
iPhone内にDataLake相当を保持するLocal-first PWA方式が現実的かを、実機で4項目だけ確認するテスターです。

## テスト内容
1. OPFS大容量ローカル保存
2. SQLite-WASMの大量行処理
3. Web Workerでの重い計算とUI応答性
4. Safari/PWAからJ-Quants API v2へ直接接続できるか（CORS）

## セキュリティ
- J-Quants APIキーはブラウザのメモリ上で接続テストにだけ使用し、localStorage / IndexedDB / OPFSには保存しません。
- OPFSテスト用ファイルはテスト終了後に削除します。
- 本番DataLakeやprivateデータは含まれていません。

## 実機テスト方法
このZIPを展開したファイルを HTTPS の静的ホスティングへ置いてください。
GitHub Pages / Cloudflare Pages / Netlify等で構いません。

iPhone:
1. Safariで公開URLを開く
2. 共有 → ホーム画面に追加
3. ホーム画面から起動
4. 「環境チェック」
5. 「ストレージテスト」128MB
6. 「DB速度テスト」50万行
7. 「計算テスト」
8. 自分のJ-Quants APIキーを入力して「J-Quants接続テスト」
9. 「総合判定を表示」
10. 結果画面のスクリーンショット、または「結果JSONを保存」で出力したJSONをChatGPTへ共有

最初の4項目が全部PASSなら、次は256-512MB / 100万行でもう一度負荷テストしてください。

## 注意
Safariで `file://` として直接開くのではなく、必ず HTTPS のURLでテストしてください。
SQLite-WASMは初回テスト時のみ jsDelivr CDN から読み込みます。
