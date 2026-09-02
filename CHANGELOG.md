# CHANGELOG

## v7e-alpha69 — 2026-09-02
- Screening Parity残差向け「一発原因監査」を自動追加。
- PC screening.pyの母集団/Top20適格条件を画面内で明示。
- PCのSectorスコアからpeer数・平均順位を逆算し、Web全母集団のpeer数/順位/近傍と同時照合。
- 2120 LIFULLのSectorPBR差について、peer母集団差を自動判定。
- Web-only残差は、単なる境界差かPC側母集団/財務フラグ/ReactionPending差かを分類。
- 追加データ更新不要。既存のWeb選抜結果＋PC screening_candidates.csvだけで実行。


## v7e-alpha69 — 2026-09-02
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
