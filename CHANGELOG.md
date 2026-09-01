# CHANGELOG

## v7e-alpha62 — QVR first-divergence exactness diagnostics
- Screening選抜Parityで、QVRのPC/Web差を「元入力 → Quality / Value / ReRating → penalty → 最終Score → rank」の順に診断。
- 各銘柄について最初に不一致が発生した層を自動分類して画面へ表示。
- QVR診断対象を ROE・利益率・CF・自己資本比率・PER/PBR/配当利回り・Sector peer rank・相対強度・傾き・MACD・出来高・RSI・52週位置・需給まで拡張。
- Parity差分CSVへPC/Web双方のQVR入力・サブスコア・penalty・最終Score・rankを追加。
- 選抜ロジック自体はalpha61から変更せず、原因特定専用。87%が据え置きでも正常。
