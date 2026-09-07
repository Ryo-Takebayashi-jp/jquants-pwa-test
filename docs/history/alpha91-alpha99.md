# Web-first daily operation phase — alpha91–alpha99

## v7e-alpha91 — 2026-09-05

- Added the top-level **日次運用を実行（Web-first）** workflow.
- Orchestrates DataLake update/repair → Screening → Discovery Episode → Discovery Daily → Factor/Seasonality → Watchlist Alert Preview.
- Added private SQLite run/step checkpoints in `/jq_private_v1.sqlite`; a failed run resumes from the first unfinished stage instead of restarting completed stages.
- The DataLake stage retains Plan Adaptive behavior: critical daily/master/financial/earnings/TOPIX/calendar failures stop the pipeline; Standard supply-demand failures are recorded as optional diagnostics and do not silently corrupt missing data into zero.
- If no new daily bar is available, the pipeline runs current-latest mutable/late-publication repair and then refreshes downstream derived layers for that same as-of date.
- Factor/Seasonality daily execution is Web-first and no longer requires a PC factor CSV. Strength change uses the previous compatible Web factor state; no unsafe FY fallback is introduced.
- Watchlist Re-Evaluation Alert is intentionally Preview-only in the pipeline. Commit remains an explicit user action.
- Added one-screen START/PASS/SKIP/REPAIR/FAIL status and a daily-pipeline diagnostic CSV.
- Existing alpha90 Investment Tracking Preview/Commit, Screening baseline, Discovery semantics, Factor engine semantics, and Watchlist Alert engine semantics are not changed.

## alpha92
Web-only Portfolio/AI Share stage 1. Added top-level current-snapshot ZIP export from private user_stocks + DataLake. Keeps legacy PC JQP historical bundle parity out of scope for this stage.

## v7e-alpha93 — 2026-09-07

- Added top-level Web-only Screening share ZIP for daily discovery use.
- Reuses the verified Web-first Screening, Factor/Seasonality, Discovery Episode and Discovery Daily engines/state.
- ZIP generation is independent from PC refresh. Missing legacy auxiliary CSVs do not block export and are declared in manifest.json rather than emitted as misleading empty files.
