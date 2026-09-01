# CHANGELOG
## v7e-alpha65b — 2026-09-02
- alpha65の「残差銘柄 財務JOIN監査」が未定義の callSqliteWorker を呼んでいた不具合を修正。
- 既存の正式な workerCall() 経路へ統一。
- codes は workerCall の payload 契約で渡し、Worker側も payload.codes を優先して受信。
- 選抜・スコア・財務計算ロジックは変更なし。97.8%の結果自体には触れていない。
