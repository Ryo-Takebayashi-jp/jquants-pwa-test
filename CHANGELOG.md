# CHANGELOG

## v7e-alpha42 — 2026-09-01
- Portfolio統合のテクニカル接続 0/14 を修正。
- 原因1: Screening計算結果のランキング上位だけをPortfolioへ渡していた。
- 原因2: J-Quants bars側5桁コードとPortfolio側正規化コードのjoinキーが不一致だった。
- Portfolio統合では全計算銘柄 (`returnAll`) を利用。
- technical / financial / portfolio のjoinコードを共通正規化。
- Portfolio結果にテクニカル計算母集団件数を表示。
- alpha41の財務Parity・需給正規化・CSV出力を維持。
