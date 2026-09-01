# v7e-alpha25 — My Stocks / private registry

## 追加
- `/jq_private_v1.sqlite` に `user_stocks` を作成
- 銘柄コード＋口座区分をキーに追加/更新
- 個別削除
- PC版 `portfolio.csv` の一括Import
- 登録一覧表示
- 現物 / NISA / 信用買 / 信用売 / WATCH

## 設計
個人の保有・管理銘柄は市場DataLakeから分離してprivate DBへ保存。
同じコードでも口座区分が違えば別レコードとして保持。

## 次
Web Screening CoreとMy Stocksを接続し、
保有/Watch銘柄の順位・テクニカル状態を一覧化。
PC版9/1 ScreeningとのParity Testも並行する。
