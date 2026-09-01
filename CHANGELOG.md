# CHANGELOG

## v7e-alpha46 — 2026-09-01
- alpha45で残っていた `[05-calc] Worker失敗` を根本修正。
- 原因: 高度テクニカルの計算式は別処理ブロックには存在していたが、`technical-screening-poc` の実際の計算ループには挿入されていなかった。
- alpha45の検証条件がファイル全体を見てしまい、別ブロックの `high52/atr14/ichi` を誤検出して修正をスキップしていた。
- 今回は `technical-screening-poc` コマンド内の volRatio→rows.push 区間だけを限定検証し、MA200/ATR/52週/MACD/一目/TrendState計算を実際に挿入。
- alpha43までのPortfolio/JQP/需給統合とParity UIは維持。
