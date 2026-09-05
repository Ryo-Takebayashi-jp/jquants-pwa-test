# J-Quants Local-first PWA v7e-alpha75

## 今回の目的
Discovery DailyのPC/Web差分を、過去履歴のvintage差と現在の計算ロジック差に分離し、PCと同じappend/freeze運用へ揃えます。同時に、長期需給バックフィルの再実行で同じ期間を最初からAPI照会し直す問題を改善します。

## Discovery Daily
- `discovery_episode_daily.csv` を一度だけ「PC Daily履歴をWebへ移行・固定」で `/jq_private_v1.sqlite` へseedします。
- 既存のEpisode×Dateは固定し、以後は新しい行だけappendします。
- 「Discovery Daily計算エンジンを再計算・Parity」はWeb DataLakeからfresh計算した行をPC CSVと比較し、基準日の差分を最優先表示します。
- Sector benchmarkはPCと同じ Screening investable universe（Prime/Standard/Growth + ProductCategory=011）へ統一しました。
- technicalはbars `raw_json` を使い、PC `datalake_access.price_rows` + `technical._adjusted_entries` と同じfield priorityで再構築します。

## 需給取得の再開
- 需給5種のraw DBへ `fetch_coverage` を追加し、既取得日をskipします。
- alpha75以前に保存済みのraw `data_date` もcoverageとして認識します。
- 0件だった直近日は配信遅延の可能性があるため7日間は再確認対象、古い0件日はskipします。
- 信用残の履歴必要開始はEpisode最古日-21日、大口空売りは-470日として別々に表示します。

## 日常更新
「次の取引日を全データ更新」をページ最上段へ固定しました。日足で次の配信済み取引日を確定してから各DataLakeを更新し、需給はcoverageを使って不要な再照会を避けます。

## alpha75実機確認
1. PC `discovery_episode_daily.csv` を選択。
2. 「PC Daily履歴をWebへ移行・固定」を1回だけ実行。
3. 「Discovery Daily計算エンジンを再計算・Parity」を実行。
4. まず「基準日のみ」の Base/Sector/Technical/Supply/Provenance/Market を確認。
5. Supply差だけ残った場合は「Web大口空売り診断CSVを書き出す」でraw報告をそのまま取り出せます。

Screening 87/87完全一致、Discovery Episode 23/23完全一致の既存基準は維持します。
