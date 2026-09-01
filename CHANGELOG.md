# CHANGELOG

## v7e-alpha65c — 2026-09-02
- 残差財務監査をalpha64安定版から作り直し。
- Worker初期化前のDBアクセス、未定義API、誤テーブル名に依存しない構造へ変更。
- 実DB `/jq_fins_summary_v1.sqlite`、実テーブル `fins_summary`、既存 `execRows()`、SAH Pool DBを使用。
- Screening候補状態に依存しない「残差財務監査（単独実行）」を追加。
- ③→④→⑤の再実行なしで6176/3989/7846/4246/2593/3300を監査可能。
- Screening選抜ロジックは97.8%のalpha64から変更なし。
