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
