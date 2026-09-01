# CHANGELOG — v7e alpha64

## QVR OPM propagation fix

- alpha63 audit exposed Web OPM component repeatedly falling back to neutral 50.
- Root cause identified in `screening-base-snapshot`: `financial-normalize-latest` correctly produced `ProfitType`, but the Screening integrated base omitted that field while copying normalized financials.
- Added `ProfitType` to the Screening base row. This restores the PC rule: when `ProfitType == OperatingProfit`, `CurrentOperatingMarginPct` is scored instead of neutral 50.
- No score formula was changed; this is a data-propagation bug fix.
- QVR validity audit now prints `ProfitType` and raw operating margin PC/Web beside the OPM component score.
- PC remains a comparison target, not an unquestioned truth; remaining differences continue to be audited against source values and intended formulas.
