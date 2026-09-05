# v7e-alpha33 — Master + Financials + Earnings Calendar

実機テスト順:
1. ③ Master Parity: 修正版PCの `screening_candidates.csv` を選択して突合。
2. ④ Financial Summary: 2026-09-01 を取得・保存。
3. ⑤ Earnings Calendar: 2026-09-01 を取得・保存。

新DB:
- `/jq_fins_summary_v1.sqlite`
- `/jq_earnings_calendar_v1.sqlite`

既存:
- `/jq_equities_master_v1.sqlite`
- Catalog + yearly bars + bars_recent + private DB

財務/決算予定は最初からraw_jsonを保持するため、V2列追加・プラン差異があっても情報を捨てません。
