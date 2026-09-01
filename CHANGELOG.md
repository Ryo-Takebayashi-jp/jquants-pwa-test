# CHANGELOG

## v7e-alpha32b — 2026-09-01
- 銘柄マスターShardのAPIキー入力導線を修正。
- Masterカード内に専用APIキー欄を追加。
- 既存の複数APIキー欄をセッションメモリ上で同期し、どの欄へ入力してもMaster取得で利用可能にした。
- APIキーはlocalStorage/SQLiteへ保存しない。
- Master取得ボタンを処理中のみdisabled、成功/失敗にかかわらずfinallyで必ず再有効化。
- APIキー未入力時はMasterカードの入力欄へfocusし、再試行可能。
- v7e-alpha32bへ表示・Service Worker cache-bust更新。
