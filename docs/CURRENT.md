# v7e-alpha68

## 根本原因
PC:
`_linear_score(None, ...) -> 50`

Web旧版:
`Number(null) -> 0`
その後0点相当の実値として採点。

6176 / 3989 はPC CSV上で ROE / EquityRatioPct が両方空欄。
そのため:
- ROE: PC 50 / Web旧 20 → 7.50pt差
- Equity: PC 50 / Web旧 25 → 3.75pt差
- 合計 11.25pt

観測されたQVRQualityScore差と完全一致。

## テスト
データ更新不要。
既存DataLakeのまま ③ → ④ → ⑤。
⑤の共通率、PCのみ/Webのみ、6176/3989のQVRQualityScoreを確認。
