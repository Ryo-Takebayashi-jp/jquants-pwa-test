# CHANGELOG

## v7e-alpha59 — 2026-09-01
- PC版 PostEarningsDrift を正式移植。
- TOPIXの日付列を取引日カレンダーとして EarningsElapsedTradingDays をPC版と同じ方法で算出。
- 決算開示前の最終終値をbaseとし、開示日以降の1/3/5/10営業日リターンを計算。
- EarningsFollowThrough5D = Return5D - Return1D。
- 3〜20取引日経過時のみ PED = Fundamental 35% + 5Dイベント形状30% + FollowThrough20% + Volume15%。
- 同日決算はReactionPendingとして通常Top20ランキングから除外し、別pending queueへ。
- PEDPercentileを追加。
- alpha58時点でPrimaryStrategy 61/62一致していた4戦略+QVRは変更最小限。
