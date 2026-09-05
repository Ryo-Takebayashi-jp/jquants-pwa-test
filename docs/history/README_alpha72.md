# v7e-alpha72 — Discovery Episode migration / performance parity

2026-09-02のScreening 5戦略 PC/Web 87/87完全一致を基準点として、次のWeb移植対象をDiscoveryへ進めた版。

- PC `discovery_episode_master.csv` を `/jq_private_v1.sqlite` にupsert移行。
- EpisodeStartDateのInitialPrice固定、3暦月のEpisode期限を維持。
- Web DataLakeの日足とTOPIXから固定1/5/10/20/60営業日リターン、TOPIX相対、20/60日最大上昇、最大DDを再計算。
- `discovery_episode_analysis.csv` とPC/Web Performance Parityを実行可能。
- Web側再計算結果をCSV export可能。
- PC最新23 Episodes / 256 daily rowsを使ったローカル回帰テストでPerformance算式23/23一致を確認。

Discovery Dailyのhistorical technical / sector benchmark / supply snapshotは次段でParity対象とする。
