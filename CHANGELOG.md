# CHANGELOG

## v7e-alpha67 — 2026-09-02
- PC版 screening.py のQVR Quality式を再監査。Web式そのものはPCと一致していることを確認。
- 6176/3989のQuality差がともに正確に11.25ptで、ROE component 45pt × 25% と一致するためROE経路を重点修正。
- V2 fins/summary の株主資本フィールド ShEq / NCShEq をROEフォールバック計算へ追加。
- 前年FY自己資本の選択をPC版 `_previous_fy` と同じ「FY末日が約365日前」方式へ変更。
- ROESourceを正規化→Screening母集団まで伝播。
- QVR Qualityを5部品（ROE/OPM/Margin改善/CF/Equity）として保存・表示。
- PC QVRQualityScoreから必要ROE componentを逆算し、Web実値との差を自動表示。
- raw監査にも Eq/ShEq/ROE/EqAR を追加。
- 既存DataLakeのみ使用。API/財務履歴の再取得は不要。
