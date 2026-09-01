# CHANGELOG

## v7e-alpha56 — 2026-09-01
- alpha55のScreening母集団 `[05-calc] Worker失敗` を修正。
- 原因1: technical-screening-poc内の新しい出来高計算が存在しない `arr` を参照していた。現在の銘柄系列 `a` に修正。
- 原因2: barsから取得した turnover_value を時系列rowへ保持していなかった。`tv` をbyCode系列へ保存。
- Screeningの実機テストUIを完全に上から順番へ整理。
- ①財務履歴補完 → ②財務正規化 → ③統合母集団 → ④5戦略選抜 → ⑤PC/Web Parity に固定。
- 旧Core1は「旧テスト・詳細ツール」へ折りたたみ、通常テスト導線から外した。
- 役目を終えた「今回の実機テスト」カードを削除。
