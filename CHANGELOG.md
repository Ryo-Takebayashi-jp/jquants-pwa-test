# CHANGELOG

## v7e-alpha45 — 2026-09-01
- alpha44のJQP Technical Parity実行時 `[05-calc] Worker失敗` を修正。
- 原因: rows.push側だけMA200/ATR/MACD/一目等の新フィールドへ拡張され、実計算ブロックが旧MA5/25/75のまま残っていた。
- MA200・傾き・ATR・52週高安・MACD・一目・高安更新・TrendStateの計算を実処理へ接続。
- 将来の同種回帰を検出するadvanced technical calculation診断を追加。
- alpha43までのPortfolio/JQP/需給統合機能は維持。
