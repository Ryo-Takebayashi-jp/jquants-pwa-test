# v7e-alpha32b Master API Token Hotfix

症状:
- APIキーを入力してもMasterカードが「APIキーを入力してください」と表示する。
- 一度エラー表示後、再タップしても変化が分かりにくい。

原因:
- alpha32のMaster取得は `prodToken` / `jqToken` だけを参照。
- 画面には用途別のAPIキー欄が複数あり、ユーザーが別欄へ入力するとMaster側から見えなかった。

修正:
- Masterカード専用 `masterToken` を追加。
- 全APIキー欄をセッションメモリで同期。
- Masterボタンはfinallyで必ず再有効化。
- APIキーは永続保存しない。

実機確認:
1. MasterカードのAPIキー欄へ貼り付け。
2. 基準日 2026-09-01。
3. 「銘柄マスターを取得・保存」。
4. PASS / API rows / 保存 rows / quick_check=ok を確認。
