# CHANGELOG

## v7e-alpha40 — 2026-09-01
- alpha39で下部ボタンが反応しなかった根本原因を修正。
- 原因: app.js がHTML途中で読み込まれ、後方にある財務/需給/Portfolioボタン生成前にイベント登録処理が終わっていた。
- app.js読込をbody末尾へ移動し、全DOM生成後にイベントを登録。
- 財務履歴・財務正規化・需給統合監査・Portfolio統合をAPIキー直下へまとめ、スクロール距離を大幅短縮。
- Workflow buttons 4/4 DOM ready の自己診断表示を追加。
- alpha39のSQLiteセルフテスト、財務履歴、財務正規化、需給監査、Portfolio統合機能はそのまま維持。
