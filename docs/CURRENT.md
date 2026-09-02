# CURRENT — v7e-alpha70

財務period resolverとQVR需給ペナルティを本実装。

- LatestDisclosureとFY型指標の参照期間を分離
- BPS/EquityRatio: latest actual -> FY carry-forward
- ROE: latest FY
- strict financial DiscDate semantics
- QVRCrowdingPenalty: PC式をWebへ移植

次の実機確認は9/1 Screening parity。診断用の新規データ取得は不要。
