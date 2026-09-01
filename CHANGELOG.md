# CHANGELOG
## v7e-alpha65 — 2026-09-02
- alpha64の選抜ロジックは変更せず固定。
- 残差銘柄をFinancial Summary raw DBまで自動追跡する「残差銘柄 財務JOIN監査」を追加。
- raw件数・最新開示・主要raw項目・PC/Web正規化値を一か所に集約。
- ①raw欠落 / ②JOIN脱落 / ③正規化・最新決算選択 / ④スコア・Top20境界 の4段階で自動判定。
