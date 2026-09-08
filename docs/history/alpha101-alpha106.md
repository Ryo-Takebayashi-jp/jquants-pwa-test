# alpha101–alpha105 consolidated history

## alpha101–alpha104 — AI Share Stage 2 data quality
- Restored portfolio price history from canonical year/recent shards.
- Reclassified short-ratio and investor-type datasets as market/section-level, not security-level.
- Split current-period EPS from actual FY EPS.
- Added fail-closed validation for short-ratio components and fixed J-Quants API v2 fields (`S33`, `SellExShortVa`, `ShrtWithResVa`, `ShrtNoResVa`).
- alpha104 became the Portfolio AI Share Stage 2 baseline after next-trading-day validation.

## alpha105 — Production UI Architecture Cleanup
- Four production views: 日々分析 / 銘柄・売買 / スクリーニング / 設定・保守.
- Legacy/duplicated development UI removed from normal navigation while runtime-compatible hidden controls remain for rollback/diagnostics.
- Inline Portfolio trade VOID confirmation.
- Large-short latest zero-position subject is treated as exited and excluded from active aggregation.
- User-data ZIP backup/restore for `jq_private_v1.sqlite` (Portfolio, Watchlist, Discovery, Investment Tracking, trade/VOID audit).
- Full DataLake backup inventory expanded to all canonical `jq_*_vN.sqlite` databases; API keys remain excluded.

## alpha106
- Daily UI refinement: Screening share moved to Daily, Screening tab replaced by Watchlist.
- Portfolio dashboard with account tabs/current price/valuation P&L.
- Trade code-name lookup and 100-share UI lots while preserving actual-share DB semantics.
- Trade memo UI removed; historical DB fields retained.
