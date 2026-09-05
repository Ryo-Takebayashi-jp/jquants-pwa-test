# v7e-alpha82 — Factor core restore + monthly Seasonality state migration

alpha81 diagnostics identified three independent causes before any further parity tuning:

1. Web Screening base did not expose `EstimatedMarketCap`, so all three Size factors were absent (PC 35 vs Web 32).
2. Web technical screening did not expose `LatestTradingValueRatioTo20D`, leaving `MedianTradingValueRatio20D` blank for every factor and changing FlowProxy.
3. Desktop Sector Seasonality is a monthly cached state (`private/work/seasonality/sector_seasonality_profile_YYYYMM.csv`). PC 2026-09-02 and 2026-09-03 factor outputs have identical raw Seasonality fields, confirming that the September profile was reused. alpha81 rebuilt from the 9/3 universe and therefore compared different monthly state.

alpha82 fixes (1) and (2), fixes Factor Summary ranking comparator precedence, and makes the Web Seasonality profile persistent by month. During a mid-month migration, select the PC monthly profile once; Web then reuses it for that month. In a fresh month with no cache, Web builds the profile independently and saves it.

## Test

Select:
- `factor_monitor_latest.csv`
- `factor_summary.csv`
- `private/work/seasonality/sector_seasonality_profile_202609.csv` (one-time September seed)

Run `Factor / Seasonalityを再計算・Parity`.

If residual Core differences remain, export `Web Factor membership診断CSV`. It contains thresholds and membership flags for all Screening-universe rows, so the remaining constituent-count differences can be traced without another diagnostic build.
