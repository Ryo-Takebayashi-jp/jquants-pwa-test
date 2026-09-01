# CHANGELOG

## v7e-alpha38 — 2026-09-01
- 財務raw_json正規化エンジンを追加。Sales/OP/OdP/NP/EPS/BPS/Eq/TA/CashEq/CFO/CFI/CFFと会社予想列を共通化。
- 最新開示を銘柄単位に集約するfinancial-normalize-latestを追加。
- Portfolio統合スナップショットを追加。
- PC版portfolio.csvを入力し、Master + 株価 + テクニカル + TOPIX相対強度 + 財務を1銘柄1行へ統合。
- JQP Web化の共通エンジンとしてScreening/Portfolio双方から再利用する設計へ移行。
- alpha37 TOPIX Parityおよび既存テクニカルParityを維持。
- READMEはdocs/配下運用を継続。
