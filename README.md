# J-Quants Local-first PWA PoC v3

v2で以下がiPhone実機PASS:
- 512MB OPFS
- SQLite-WASM 100万行
- J-Quants API直接接続
- 実日足 → SQLite → OPFS永続保存
- PWA再起動後のDB再読込
- ブラウザ内分析

v3は「小型本番DataLake」です。

## 実装
- equities/master
- equities/bars/daily を日付単位で全市場同期
- fins/summary を日付単位で同期
- SQLite/OPFS永続化
- sync_log による同期済み日スキップ
- 1日単位コミットによる中断/再開
- 429指数バックオフ
- Local-only簡易Screening

## 推奨実機テスト
1. GitHub Pagesの既存リポジトリへ5ファイルを上書きしてCommit
2. iPhone PWAを完全終了 → 再起動
3. 「1. DataLake初期化」
4. APIキー入力
5. 「2. 銘柄Master同期」
6. 期間は初期値（直近45暦日）のまま「3. 全市場日足」
7. 「4. 財務」
8. 「5. 簡易Screening」
9. 「6. 差分更新」
10. 総合判定をスクショ

APIキーは保存しません。入力欄はPWA再起動で消えます。
PoC DBはiPhoneのOPFSにのみ保存されます。

## 注意
J-Quants APIにはレート制限があります。広い期間を一気に試さず、
まず30〜45暦日でPoCしてください。
