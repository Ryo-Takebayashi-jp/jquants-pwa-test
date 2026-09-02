# v7e-alpha73 - 2026-09-02

- Discovery Daily 42-column PC/Web Parityを追加。
- Episode×取引日の価格/TOPIX/sector/historical technical/Standard需給/MarketRegimeをWeb DataLakeからpoint-in-time再計算。
- 差分をBase/Sector/Technical/Supply/Provenance/Marketへ分類し、空売り履歴coverageも表示。
- Screening 100% PASSとDiscovery Episode 23/23 PASSの既存ロジックは変更なし。

# CHANGELOG

## v7e-alpha72 — 2026-09-02
- Screening 5戦略 PC/Web 87/87完全一致を基準点として固定。
- Discovery EpisodeのPC→Web移行を追加。`discovery_episode_master.csv` を `/jq_private_v1.sqlite` にupsert保存。
- Web DataLakeの日足/TOPIXからEpisode成績を再計算。固定1/5/10/20/60営業日、TOPIX相対、20/60日最大上昇・最大DD、3か月期限をPC仕様に合わせた。
- `discovery_episode_analysis.csv` とのPerformance ParityとWeb CSV exportを追加。
- alpha71のEarningsEventDate分離、alpha70のQVR/Crowding修正を維持。
- app/worker/service-workerのcache bustをalpha72へ更新。
