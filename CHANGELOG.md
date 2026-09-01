# CHANGELOG

## v7e-alpha34 — 2026-09-01
- 開発加速版。市場基礎2種 + Standard需給5種を一括追加。
- TOPIX日足 Shard `/jq_topix_v1.sqlite`。
- 営業日カレンダー Shard `/jq_market_calendar_v1.sqlite`。
- 信用取引週末残高 `/jq_margin_interest_v1.sqlite`。
- 日々公表信用 `/jq_margin_alert_v1.sqlite`。
- 空売り比率 `/jq_short_ratio_v1.sqlite`。
- 空売り報告 `/jq_short_sale_report_v1.sqlite`。
- 投資部門別 `/jq_investor_types_v1.sqlite`。
- すべてCatalogへcoverage/state登録。raw_json完全保持。
- 需給5種はPlan差・個別API失敗時も他データセットの取得を継続するPlan-Adaptive実装。
- alpha31日足Parity、alpha33 Master/Financials/Earningsを維持。
