# CHANGELOG

## v7e-alpha72 — 2026-09-02
- Screening 5戦略 PC/Web 87/87完全一致を基準点として固定。
- Discovery EpisodeのPC→Web移行を追加。`discovery_episode_master.csv` を `/jq_private_v1.sqlite` にupsert保存。
- Web DataLakeの日足/TOPIXからEpisode成績を再計算。固定1/5/10/20/60営業日、TOPIX相対、20/60日最大上昇・最大DD、3か月期限をPC仕様に合わせた。
- `discovery_episode_analysis.csv` とのPerformance ParityとWeb CSV exportを追加。
- alpha71のEarningsEventDate分離、alpha70のQVR/Crowding修正を維持。
- app/worker/service-workerのcache bustをalpha72へ更新。
