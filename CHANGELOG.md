# CHANGELOG

## v7e-alpha68 — 2026-09-02
- QVR残差の根本原因を特定。
- PC `screening.py::_linear_score` は `None` を既定値50点として扱う。
- Web `lin()` は先に `Number(v)` を実行していたため、JavaScriptの `Number(null) === 0` により欠損値を実値0として誤採点していた。
- 6176/3989では PC CSV の ROE と EquityRatioPct がともに空欄。
  - PC: ROE 50点 + Equity 50点
  - Web旧版: ROE 20点 + Equity 25点
  - 差 = (50-20)*25% + (50-25)*15% = 11.25pt
  - 実測QVRQualityScore差 11.25pt と完全一致。
- `lin()` をPCと同じNULL/空欄→default処理へ修正。
- この共通helperを使う全スコアでPCの欠損値意味論へ統一。
- データ再取得/API更新不要。
