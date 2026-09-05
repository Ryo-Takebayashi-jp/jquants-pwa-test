v7e-alpha73

Discovery Daily PC/Web Parity

- ⑦ Discovery Daily PC/Web Parity を追加。
- Web private DBへ移行済みのDiscovery Episodeから、Episode×取引日の日次行をWeb DataLakeのみで再計算。
- 価格/TOPIX/sector benchmark/historical technical/Standard需給snapshot/DiscoveryV1 market regimeを42列でPC版 discovery_episode_daily.csv と比較。
- 差分を Base / Sector / Technical / Supply / Provenance / Market に分類。
- 大口空売り履歴は最古Episode日から430日前までを必要履歴としてcoverage診断。
- PC dataset_status JSON由来の AvailableFromHistory はWeb DB単独で完全復元できないためProvenance差として分離表示。
- Screening 87/87、Discovery Episode Performance 23/23 の既存PASSロジックは変更なし。
