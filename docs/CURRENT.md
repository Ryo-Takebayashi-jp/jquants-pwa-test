# v7e-alpha65b
alpha65の監査呼び出しだけを修正しました。

テスト:
1. ③母集団
2. ④5戦略選抜
3. ⑤Parity
4. ⑤下部【残差銘柄 財務JOIN監査】を確認

今回は `raw監査 ERROR: Can't find variable: callSqliteWorker` が消え、
各残差銘柄に `raw財務DB:` と `判定:` が出ればPASSです。
