# CHANGELOG

## v7e-alpha71 — 2026-09-02
- LatestFinancialDisclosureDate / LatestEarningsEventDate を分離。
- 同じ CurPerType + CurPerEn/FYEn の最初の開示日を決算イベント日とする。
- 後日の訂正決算短信は最新財務値として採用するが ReactionPending を再発火させない。
- 2593: 9/1新規1Qは ReactionPending を維持。
- 3300: 9/1 FY訂正版は財務値へ反映し、EarningsEventDate は8/13。
- alpha70のPeriod Resolver / QVR CrowdingPenaltyを維持。
