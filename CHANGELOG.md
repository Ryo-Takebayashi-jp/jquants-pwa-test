# CHANGELOG

## v7e-alpha57 — 2026-09-01
- alpha56で残った Screening統合母集団 `[05-calc] Worker失敗` を修正。
- 実機エラー行 `sqlite-worker.js:1672:47` を確認し、`historyDays: arr.length` が原因と特定。
- technical-screening-poc の現在銘柄系列は `a` なので、`historyDays: a.length` へ修正。
- `a` が存在しない異常状態を明示するローカル診断を追加。
- alpha56の①→②→③→④→⑤のScreening順序UIはそのまま維持。
