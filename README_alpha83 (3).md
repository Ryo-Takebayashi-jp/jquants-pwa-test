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
