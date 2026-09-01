# CHANGELOG

## v7e-alpha66 — 2026-09-02
- 97.8%残差を1回の更新で広く診断する「残差フルトレース」を追加。
- 5戦略の全スコア母集団を保持し、Top20外にもUniverseRankを付与。
- PC_ONLY銘柄でもWeb母集団上のQVR/Quality/Value/ReRating/原材料/FinancialDataFlagを確認可能。
- QVR順位近傍（境界周辺）のコード・スコアを同時表示。
- 自動判定: 母集団欠落 / 財務フラグ除外 / QVR欠損 / Top20境界外 / 候補統合経路 / PC側境界差。
- alpha64までの97.8%選抜式は変更していない。
- データ再取得・財務履歴更新は不要。既存DataLakeから再計算のみ。
