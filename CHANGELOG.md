# CHANGELOG

## v7e-alpha53 — 2026-09-01
- Screening選抜PC/Web Parityの `undefined is not an object (evaluating 'pc.rows.map')` を修正。
- 原因: parseSimpleCsv() は2次元配列を返すのに、Parity処理側で `{rows: ...}` 型として扱っていた。
- 既存の共通 parseCsv() に統一し、`pc.rows` を正しく取得。
- PC CSV解析失敗時の明示診断を追加。
- Parity結果にPC CSV行数を表示。
- alpha52の5戦略Top20選抜・候補CSV出力は変更なし。
