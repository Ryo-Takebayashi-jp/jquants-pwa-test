# CHANGELOG

## v7e-alpha47 — 2026-09-01
- JQP Technical Parityで残っていた52週系4項目を修正。
- 原因: Web版が52週高値/安値を終値(Close)の最大・最小で計算していた。
- PC版は過去252取引日の調整後High/Lowを使用。
- High52Week = max(High, 252 sessions)
- Low52Week = min(Low, 252 sessions)
- DistanceFrom52WeekHighPct / LowPct も修正後のHigh52Week/Low52Weekを基準に再計算。
- alpha46で50/54一致していた他50項目は変更なし。
