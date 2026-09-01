# CHANGELOG

## v7e-alpha63 — QVR raw-material validity audit
- QVRをPCへ盲目的に合わせず、PC/Web双方の原材料と計算過程を監査。
- Quality: ProfitType / ROE / OperatingMargin / MarginChange / CFO / FCF / EquityRatio を比較し、各部品scoreをPC/Web同一定義で再計算。
- Value: Sector33 / ForecastPER / PBR / DividendYield / ForecastProfitGrowth と sector peer rank を分離診断。
- 最初の不一致を「原材料」「計算式/欠損」「peer母集団/rank」「合成」に分類。
- 選抜式自体は変更しない診断リリース。

## v7e-alpha63 — QVR first-divergence exactness diagnostics
- Screening選抜Parityで、QVRのPC/Web差を「元入力 → Quality / Value / ReRating → penalty → 最終Score → rank」の順に診断。
- 各銘柄について最初に不一致が発生した層を自動分類して画面へ表示。
- QVR診断対象を ROE・利益率・CF・自己資本比率・PER/PBR/配当利回り・Sector peer rank・相対強度・傾き・MACD・出来高・RSI・52週位置・需給まで拡張。
- Parity差分CSVへPC/Web双方のQVR入力・サブスコア・penalty・最終Score・rankを追加。
- 選抜ロジック自体はalpha61から変更せず、原因特定専用。87%が据え置きでも正常。
