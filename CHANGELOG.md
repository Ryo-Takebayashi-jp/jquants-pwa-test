# CHANGELOG

## v7e-alpha32 — 2026-09-01
- 日足テクニカルParity PASS後の次工程として、J-Quants V2 銘柄マスター層を追加。
- `/v2/equities/master` を基準日指定で取得するクライアントを追加。
- `/jq_equities_master_v1.sqlite` Shardを新設。
- Code / Date / Company / Market / Sector17 / Sector33 / Scale / Margin / ProductCategory / BasePrice と raw_json を保存。
- Catalogへ equities_master shard のcoverage/stateを登録。
- APIキーは従来どおりセッション入力のみ。DB/localStorageへ保存しない。
- alpha31の日足テクニカル完全Parityを維持。
