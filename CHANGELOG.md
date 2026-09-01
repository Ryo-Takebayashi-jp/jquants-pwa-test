# CHANGELOG

## v7e-alpha63 — 2026-09-02
- QVR Sector相対評価の欠損処理バグを修正。
- JavaScriptの `Number(null) === 0` により、PBR等の空欄銘柄が0としてSector peer順位へ混入していた。
- group rankはblank/nullを除外。ForecastPER/PBRは正値のみ有効。
- rawが欠損ならSectorForecastPER/PBR/DividendYieldValueScoreも欠損のまま保持。
- QVRValueScoreは有効な評価軸だけで重みを再正規化。
- 6838についてSector33、peer有効件数、rank、percentile再計算、PC/Web保存scoreを表示する監査を追加。
