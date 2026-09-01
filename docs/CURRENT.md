# v7e-alpha40

今回の実機順:
1. A. SQLite基盤セルフテスト
2. Workflow buttons: 4/4 DOM ready を確認
3. 財務履歴バックフィル
4. 財務正規化
5. 需給統合監査
6. Portfolio統合

alpha39のボタン無反応は、app.js読込位置が早すぎたことが原因。alpha40でbody末尾読込へ修正。
