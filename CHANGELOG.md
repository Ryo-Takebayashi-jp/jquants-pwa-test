# CHANGELOG

## v7e-alpha48 — 2026-09-01
- 52週系4項目のPC定義をソースコードから再確認して修正。
- PC `technical.py` の実装は High52Week / Low52Week に High/Low ではなく、
  過去252取引日の「調整後Close」の最大値・最小値を使用している。
- Web版も完全に同じ定義へ変更。
- 20D/60D高安は従来どおりHigh/Lowを使用し、52週だけCloseを使うPC仕様を再現。
- 表示上の52週定義も「過去252取引日のClose（PC版準拠）」へ訂正。
