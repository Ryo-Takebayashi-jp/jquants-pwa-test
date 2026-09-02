# CHANGELOG

## v7e-alpha70 — 2026-09-02
- 6039検証を反映し、LatestDisclosure と BPS/ROE/自己資本比率のSourcePeriodを分離。
- BPS/自己資本比率は最新実績期を優先し、無い場合のみ直近FY carry-forward。ROEは直近FY実績。
- `latestFY || cur` のFY偽装fallbackを廃止。FYが無ければFY指標を四半期扱いしない。
- Financial Summaryの開示日は `DiscDate/DisclosedDate` のみに限定し、汎用 `Date` を開示日として誤用しない。
- 2593の2026-09-01実決算はReactionPendingとして維持でき、3300のような非開示日誤判定を抑止。
- PCと同じQVR CrowdingPenaltyを実装: MarginLongChangePct1W + fresh/recent LargeShortRatioChange1W、上限15点。
- Screening母集団構築時に必要な需給履歴をWeb DBから再構成して結合。
- 2120/6039・7846・2593/3300の根本原因をまとめて修正。
