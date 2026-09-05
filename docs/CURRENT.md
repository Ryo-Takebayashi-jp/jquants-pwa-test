v7e-alpha91

Web-first daily pipeline is integrated above the existing verified engines. One top-level action coordinates DataLake update/repair → Screening → Discovery Episode/Daily → Factor/Seasonality → Watchlist Alert Preview. Each stage stores a private-DB checkpoint and an interrupted run resumes from the failed stage. Watchlist Alert remains Preview-only until the user explicitly commits. Existing alpha90 Investment Tracking semantics and baseline remain unchanged. See `history/alpha91-alpha99.md`.
