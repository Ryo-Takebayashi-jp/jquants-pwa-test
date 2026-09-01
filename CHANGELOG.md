# v7e-alpha62

- Screening統合母集団へ `ProfitType` を正式伝播。Web QVR Quality の営業利益率スコアが常時50点になる欠落を修正。
- QVR監査でPC空欄を `Number("")=0` と誤表示しない blank-safe 比較へ修正。
- 6838等について ProfitType / BPS / PBR / ForecastPER / ForecastDividendYieldPct のPC/Web原材料を同時表示。
- PBR差はPCへ盲目的に合わせず、BPS原材料の妥当性を確認してから判断する方針。

# v7e-alpha62

- Screening選抜ParityにQVR差分の自動監査を追加。
- 6838を優先サンプルとして、Quality/Value/ReRatingとその原材料をPC/Webで直接比較。
- 最初にズレる原材料を画面内に短く表示し、長い診断ログを追わずに原因特定できるよう改善。
- 選抜ロジック自体はalpha60から変更せず、診断専用リリース。
