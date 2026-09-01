# CHANGELOG

## v7e-alpha30 — 2026-09-01
- PC/Web technical parity residual fix.
- RSI14 parity lookback expanded from 100 to 320 trading sessions to align with desktop Screening's ~14-month price-history input and Wilder smoothing.
- Missing/blank volume is preserved as null instead of coercing to 0.
- LatestVolumeRatioTo20D now matches desktop behavior: missing volume observations are excluded from the 20-session average.
- alpha29 Low diagnostics and all prior shard/private-data behavior retained.
