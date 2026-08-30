# J-Quants Local-first PWA PoC v6

目的:
iPhoneのみで10年級の市場DataLakeを段階バックフィルできるかを検証する。

## 機能
- 既存market DataLakeを継続利用
- 月/年単位の保存チャンク
- 日単位のsync_log
- 同期済み日はAPIアクセスせずskip
- STOP要求 → 現在日保存後に停止
- 429指数バックオフ
- ERROR日だけ再取得
- backfill_runs履歴
- DB容量 before/after
- 処理時間/API回数/行数ログ
- バッテリー/発熱の手動観察ログ
- delete確認は今後本番UIで小文字 `delete` 対応予定

## 推奨テスト
まず3か月:
1. GitHub Pagesへ上書き + Commit
2. DataLake状態確認
3. APIキー入力
4. 初期値3か月でバックフィル
5. 耐久ログ
6. iPhoneの開始/終了バッテリーと発熱を記録
7. 同じ期間を再実行し、大半/全部がskipされることを確認
8. 総合判定

3か月が安定したら1年。
1年も安定後に10年へ拡張する。
