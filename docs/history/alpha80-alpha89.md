# Development history alpha80–alpha87

---

## alpha80

# v7e-alpha80 — Watchlist / Investment Tracking migration baseline

## Purpose
Freeze the already-PASSed Screening / Discovery layers and start the independent Watchlist lifecycle without guessing or rebuilding state.

## Added
1. `⑧ Watchlist / Investment Tracking 移行・Parity`
2. Import PC `private/Watchlist/master/watchlist_master.csv` and `private/Watchlist/state/watchlist_state.csv`.
3. Store full rows in Web private DB and round-trip compare every PC field.
4. Export Web master/state snapshots for audit/backup.
5. Validate and route canonical `investment_tracking_input.csv` according to PC alpha25 semantics.

## Important boundary
This release does **not** generate Re-Evaluation Alerts yet. PC Watchlist alerts depend on Sector Factor / Seasonality state. Those values must first be reproduced natively on Web; otherwise an apparent alert parity could be a false match.

## Test
- Deploy alpha80.
- In ⑧ select PC `watchlist_master.csv` and `watchlist_state.csv`.
- Press `PC Watchlist master/stateをWebへ移行・照合`.
- Expected: exact PASS for master/state.

PC file locations:
- `private/Watchlist/master/watchlist_master.csv`
- `private/Watchlist/state/watchlist_state.csv`

---

## alpha81

# v7e-alpha81 — Factor Monitor / Seasonality parity

## Purpose
Connect the Factor/Seasonality layer needed by Watchlist Re-Evaluation Alerts while keeping previously-passed Screening, Discovery and Watchlist state layers frozen.

## New test
Section **⑧-2 Factor Monitor / Seasonality Parity**.

Inputs:
- `factor_monitor_latest.csv` (required, from the PC `screening_YYYYMMDD.zip`)
- `factor_summary.csv` (optional, same ZIP)

Run **Factor / Seasonalityを再計算・Parity**. The Web side:
1. rebuilds the full Screening base if it is not already in memory,
2. independently recalculates FactorMonitorV1 core groups/metrics,
3. rebuilds SectorSeasonalityV1 from Web DataLake stock bars + TOPIX using years <= prior calendar year,
4. enriches current factor rows with SeasonState / alignment / seasonal alert,
5. compares PC/Web by field and optionally compares Factor Summary.

## Diagnostics
- Web Factor latest CSV
- Factor difference CSV (FactorKey / field / group / PC / Web)
- Full Web Sector Seasonality profile CSV

## StrengthChange1D bootstrap
On the very first Factor run, Web has no prior factor history. For this one field only, alpha81 infers the prior-day Strength baseline as `PC current Strength - PC StrengthChange1D`, then applies that baseline to the independently-computed Web current Strength. The current factor calculations are not copied from PC. After the run, Web stores the current factor state in `/jq_private_v1.sqlite`; subsequent dates use Web prior state.

## Expected first validation
PC 2026-09-03 currently contains 35 Factor Monitor rows. Candidate count is not hard-coded; compare the correctly recalculated set. If differences remain, export the factor diff CSV and seasonality profile before making another update.

---

## alpha82

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

---

## alpha83

# v7e-alpha83 — Factor parity hardening / late-financial refresh

This build fixes several root causes exposed by the 2026-09-04 Factor diagnostics rather than forcing Web output to match stale PC values.

Key changes:
1. Factor technical universe uses the production Screening 60-day minimum instead of the old 75-day PoC gate.
2. Financial normalization is explicitly point-in-time (`asOf`) and its cache is keyed by date.
3. The top one-click update refreshes the latest 7 calendar days of `/fins/summary`, replacing each date snapshot so late revisions (earnings/dividend guidance) are not missed.
4. Derived Screening/Factor caches are invalidated after DataLake updates.
5. Factor Strength state carries an engine version. After an engine change, previous Strength is re-seeded once instead of using incompatible Web history.
6. `EffectiveShares` used by Factor market-cap sizing follows the desktop definition (`ShOutFY - TrShFY`).
7. A Web Factor financial-input diagnostic CSV can be exported to classify any remaining PC/Web differences without another diagnostic build.

Recommended test:
- Deploy alpha83.
- Run the top “次の取引日を全データ更新” once even if no new bars exist; it will refresh recent financial disclosures.
- In ⑧-2, select the current PC factor_monitor_latest.csv, factor_summary.csv, and the monthly sector seasonality profile, then run Factor / Seasonality parity.
- If residuals remain, export Factor diff + membership + financial-input diagnostics.

---

## alpha84

# v7e-alpha84 — Factor FY baseline resolver / Parity graduation candidate

## Purpose
After refreshing the PC `screening_all.csv`, Factor residuals were reduced to three independent membership sources: Size data coverage, HighROE data coverage, and 11 PC-only `ForecastPrimaryProfitGrowthPct` observations.

## Changes
- Fix Web Factor forecast-growth baseline resolution for J-Quants V2 FY rows.  For a reported FY actual, `CurPerEn` is used before `CurFYEn` when locating the prior fiscal year against the forecast target year.
- Keep existing Screening/financial output semantics otherwise unchanged; the change is limited to the prior-FY comparator used by the Web financial normalizer.
- Add `FactorPreviousFYDisclosureDate`, `FactorPreviousFYEnd`, and `FactorPreviousFYPrimaryProfit` to the Factor financial diagnostic CSV.
- Bump Factor engine state to `FactorWebV4-alpha84`, forcing one safe Strength reseed after the membership correction.

## Expected interpretation
The 11 missing Web forecast-growth observations should recover.  If the remaining residuals are only the six Web-only market-cap/ROE observations (plus the resulting Size/HighROE rank effects), treat them as explained data-coverage differences rather than forcing Web to discard valid J-Quants observations.  That is the planned Factor/Seasonality Parity graduation point before Web-first development.

---

## alpha85

# v7e-alpha85 — Factor FY baseline parity fix / docs normalization

## Factor / Seasonality
- Fix Web `ForecastPrimaryProfitGrowthPct` prior-FY resolver to match the PC `_previous_fy()` meaning exactly.
- Previous FY matching now uses `CurFYEn` first and `CurPerEn` only as fallback.
- `FactorPreviousFYEnd` diagnostics use the same field order.
- Bump the Factor engine state to `FactorWebV5-alpha85` so Strength history is safely reseeded after the membership correction.
- Web-only valid market-cap / reported-ROE observations are intentionally retained; they are treated as explainable Web enrichment rather than discarded only to force PC equality.

## Documentation / release history
- Move all `README_alpha*.md` files out of the ZIP root into `docs/history/`.
- Refresh `docs/README.md`, `docs/CURRENT.md`, and `docs/INDEX.md`.
- Normalize `release_history.json` to one chronological `history` array and remove the duplicate `releases` branch.
- Keep the ZIP root focused on runtime files plus `CHANGELOG.md` and `release_history.json`.

## Migration
No destructive schema migration. Existing OPFS/DataLake/private state is preserved. Factor state is engine-versioned and will reseed once.

---

## alpha86

- Corrected the Factor technical-screening eligibility gate so the actual implementation accepts 60 trading days, matching the declared Screening universe.
- Reworked forecast-growth prior-FY resolution to inspect only actual FY rows, try both CurFYEn and CurPerEn explicitly, and fall back to the latest actual FY only when aliases cannot expose a usable period end.
- Added observable resolver metadata and compact FY-history trace to Factor financial diagnostics; these fields are now passed through the screening base snapshot instead of being silently dropped.
- Factor engine state advances to `FactorWebV6-alpha86` and reseeds once.
- Consolidated per-release README files into milestone-range history documents to reduce repository/file-upload overhead.


---

## alpha87

# v7e-alpha87 — Factor FY canonicalization / Web-first graduation candidate

## Why this release exists
The alpha86 diagnostics showed that desktop `screening_all.csv` contains many rows where `ForecastPrimaryProfitGrowthPct` is blank even though the same desktop row already has both a positive `ForecastPrimaryProfit` and a positive `PriorActualFYPrimaryProfit`. For 512 of 516 directly comparable cases, the Web growth value can be reproduced exactly from those two desktop values. This is treated as a desktop internal inconsistency, not a reason to discard valid Web observations.

## Diagnostic evidence
- Desktop raw contained 590 rows where `ForecastPrimaryProfitGrowthPct` was blank while Web could derive a value.
- 516 of those desktop rows already exposed positive `ForecastPrimaryProfit` and positive `PriorActualFYPrimaryProfit`; 512/516 Web values reproduced exactly from those two desktop values.
- The remaining directly comparable mismatches were cases with later FY corrections/restatements, where the desktop growth field retained an older FY baseline while its own `PriorActualFYPrimaryProfit` had already moved to the later disclosure.
- This is why alpha87 does not intentionally reintroduce desktop nulls or stale annual baselines solely for exact equality.

## Resolver rules
- Only actual FY rows are eligible as the prior-year baseline.
- The target forecast FY must be 300–430 days after the candidate FY end.
- `CurFYEn` and `CurPerEn` are both inspected.
- If multiple disclosures match the same annual interval, the latest disclosure (`DiscDate/DiscTime/DiscNo`) wins, so corrections/restatements are not silently ignored.
- If no comparable annual FY exists, no growth is computed. The old unconditional latest-actual-FY fallback is removed because fiscal-year transitions can be shorter/longer than one year and are not comparable annual growth.

## Parity policy
From this release onward, Factor/Seasonality exact PC equality is retained as a migration/debug reference only. Web-first semantics are preferred when the Web has valid J-Quants observations that the PC path omits. The next acceptance gate is semantic validity, stable daily operation, and explainable residuals rather than forced numerical identity.


---

## alpha88

# v7e-alpha88 — Web-first Watchlist Re-Evaluation Alert

## Purpose
Factor / Seasonality reached Web-first semantic readiness, so Watchlist can now consume the Web canonical state instead of waiting for permanent desktop exact parity.

## Changes
- Add non-destructive Watchlist Alert preview using the migrated Watchlist master/state, current Web Screening base, and same-date Web Factor/Seasonality state.
- Port PC WatchlistReEvaluationV1 trigger semantics for Price, Valuation, Fundamental, Factor/Seasonality, Technical, Catalyst, and ReviewExpiry. Alerts remain re-evaluation requests, never BuySignals.
- Require same-date Factor state before alert evaluation to prevent stale Factor/Seasonality decisions.
- Suppress Factor/Seasonal transition alerts once on first Web-first engine migration, while baselining the current canonical Factor state on commit. This avoids false alerts caused only by changing the reference engine.
- Split preview from commit. Preview never mutates private state; commit persists master/state, current alerts, and de-duplicated alert history.
- Add Watchlist alert diagnostic CSV with per-watch input/state/trigger details.
- Sync the one-click daily target date into Factor and Watchlist Alert date fields.

## Storage
Lazy tables in `/jq_private_v1.sqlite`:
- `watchlist_alert_latest_web`
- `watchlist_alert_history_web`
- `watchlist_alert_meta_web`

No destructive migration. Existing Watchlist master/state remain intact until the user explicitly commits a preview.


---

## alpha89

# v7e-alpha89 — Watchlist fundamental fingerprint canonicalization

## Diagnostic evidence
The first Web-first Watchlist preview emitted 9 Fundamental alerts out of 11 watches. The diagnostic CSV showed the same disclosure date, forecast EPS, and dividend as the migrated PC state, while only `ForecastPrimaryProfit` and `PrimaryProfitProgressPct` changed from numeric values to `None`. This was a representation gap, not nine simultaneous financial changes.

## Fix
- `screening-base-snapshot` now exposes PC-compatible `CurrentPrimaryProfit`, `ForecastPrimaryProfit`, and `PrimaryProfitProgressPct`.
- Primary profit uses Operating Profit when available, otherwise Ordinary Profit; progress is omitted for FY rows and otherwise equals current primary profit / forecast primary profit × 100.
- Watchlist fingerprint generation consumes those canonical fields and retains a fallback to raw operating/ordinary fields.
- Watchlist diagnostic CSV now includes the canonical financial inputs, so any future mismatch can be inspected directly.

Preview remains non-destructive; users should only commit after the preview is judged valid.
