# J-Quants Local-first PWA PoC v5

v4で市場DataLakeのExport / 削除 / Import / sync_log継承 / Screening復元までiPhone実機PASS。

v5の目的は本番安全設計の確認。

## 実装
- market DB: `jq_poc3_datalake.sqlite` を継続
- private DB: `jq_private.sqlite` を新設
- Portfolio / Trades / Discovery / Watchlistをprivate側だけに配置
- privateバックアップをPBKDF2-SHA256 (250,000 iterations) + AES-GCM-256で暗号化
- private Import前に既存private DBを自動で平文SQLiteバックアップとしてダウンロード
- market/privateそれぞれにschema_version
- migration_history
- private削除は `DELETE` 入力を要求する二段階確認
- market側へprivateテーブルが混入していないことを検証

## 実機テスト順
1. GitHub Pagesへ5ファイル上書き + Commit
2. v5表示確認
3. 2DB初期化
4. privateへダミーデータ登録
5. 6文字以上のテスト用パスフレーズを入力して暗号化Export
6. private削除 → DELETE入力 → 確認
7. Exportした `.jqpriv` を選択し、同じパスフレーズでImport
8. migration履歴確認
9. 復元・分離確認
10. 総合判定

※ Import前自動バックアップは安全機構のPoCとして平文SQLiteをダウンロードします。
本番ではこの退避も暗号化する方針です。
