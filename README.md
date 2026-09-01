# J-Quants Local-first PWA v7e-alpha5

## 今回のテスト
まず新しい「⓪ 同一Worker内 create→close→reOpen」だけ押してください。

- ⓪ PASS: reopen自体は可能。別ボタン/別Workerメッセージを跨ぐSAH Pool状態管理が主因候補。
- ⓪ が 04-reopen で停止: SAH Poolのclose→reopen lifecycle自体がiPhoneで不安定。
- ⓪ がそれ以前で失敗: 表示stageを基にさらに下層を修正。

既存1.12GB DataLakeには触れません。
