# Development history alpha72–alpha79

---

## alpha72

# v7e-alpha72 — Discovery Episode migration / performance parity

2026-09-02のScreening 5戦略 PC/Web 87/87完全一致を基準点として、次のWeb移植対象をDiscoveryへ進めた版。

- PC `discovery_episode_master.csv` を `/jq_private_v1.sqlite` にupsert移行。
- EpisodeStartDateのInitialPrice固定、3暦月のEpisode期限を維持。
- Web DataLakeの日足とTOPIXから固定1/5/10/20/60営業日リターン、TOPIX相対、20/60日最大上昇、最大DDを再計算。
- `discovery_episode_analysis.csv` とPC/Web Performance Parityを実行可能。
- Web側再計算結果をCSV export可能。
- PC最新23 Episodes / 256 daily rowsを使ったローカル回帰テストでPerformance算式23/23一致を確認。

Discovery Dailyのhistorical technical / sector benchmark / supply snapshotは次段でParity対象とする。

---

## alpha73

v7e-alpha73

Discovery Daily PC/Web Parity

- ⑦ Discovery Daily PC/Web Parity を追加。
- Web private DBへ移行済みのDiscovery Episodeから、Episode×取引日の日次行をWeb DataLakeのみで再計算。
- 価格/TOPIX/sector benchmark/historical technical/Standard需給snapshot/DiscoveryV1 market regimeを42列でPC版 discovery_episode_daily.csv と比較。
- 差分を Base / Sector / Technical / Supply / Provenance / Market に分類。
- 大口空売り履歴は最古Episode日から430日前までを必要履歴としてcoverage診断。
- PC dataset_status JSON由来の AvailableFromHistory はWeb DB単独で完全復元できないためProvenance差として分離表示。
- Screening 87/87、Discovery Episode Performance 23/23 の既存PASSロジックは変更なし。

---

## alpha74

# J-Quants Local-first PWA v7e-alpha74

## 追加機能
Web版 DataLakeの最上段に「次の取引日を全データ更新」を追加しました。

- 日足DataLakeの最新日を読み取り、その次にJ-Quantsで配信済みの日足が存在する取引日を自動検出します。
- 週末・休場日は自動でスキップします。
- 検出した同一日について、日足、銘柄マスター、財務サマリー、決算予定、TOPIX、営業日カレンダー、Standard需給5種を順次取得・保存します。
- 需給5種の取得後、需給分析用正規化も自動実行します。
- 各カードの日付入力欄を対象日に自動同期します。翌日は同じボタンを押すだけで次の配信済み取引日へ進めます。
- 日足がまだ配信されていない場合は他データへ進まず、安全に「更新不要」で終了します。
- Plan依存の需給データが取得不能でも、主要DataLake更新は止めず、結果欄で該当項目だけNG表示します。

## 変更していないもの
Screening 5戦略、Discovery Episode、Discovery Dailyの計算・Parityロジックには変更を入れていません。

## 現在の基準点
- Screening: 2026-09-02 PC/Web 87/87 完全一致 PASS
- Discovery Episode Performance: 23/23 PASS
- Discovery Daily: 256/256行を比較中

---

## alpha75

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

---

## alpha76

# J-Quants Local-first PWA v7e-alpha76

2026-09-02 / Discovery Daily diagnostic parity

## 目的
alpha75で基準日差が Technical=12 / Supply=18 まで縮小した後、更新版を増やさず残差を掘れるよう診断出力を強化する。

## 変更
- 固定Daily CSVとWeb計算エンジンCSVを分離。
- Discovery Daily差分診断CSVを追加。
- Technical差コードだけのbars/raw採用値診断CSVを追加。
- 大口空売りはPCと同じく各as-of日ごとの470日窓でsubject stateを復元。
- 空売りrawのdata_date/coverageを修正。旧DBの空欄data_dateもraw_jsonからcoverage復元。

## 実機確認
1. 既存のPC `discovery_episode_daily.csv` を選択。固定履歴はalpha75で移行済みなら再移行不要。
2. 「Discovery Daily計算エンジンを再計算・Parity」。
3. 基準日差分の Technical / Supply を確認。
4. 残差があれば「Discovery Daily差分診断CSV」を出力。Technicalが残れば「Webテクニカル入力診断CSV」も出力。

---

## alpha77

# v7e-alpha77

## 修正内容
- 最上段「次の取引日を全データ更新」の需給5種で発生した `writerCmd` 未定義エラーを修正。
- 日足が既に最新で次取引日が未配信でも、同ボタンで最新日の任意需給を再確認・補完できるようにしました。
- 取得済みcoverageは再利用し、古い取得済み日を無駄に再照会しません。

## 9/3で主要データだけ更新済みの場合
alpha77へ更新後、最上段の「次の取引日を全データ更新」をもう一度押してください。新しい日足が無ければ9/3を維持したまま需給5種と需給正規化だけを再試行します。

---

## alpha78

# v7e-alpha78 — Discovery Daily technical / mutable supply snapshot fix

## 目的
9/3 Discovery Daily Parityで残った Technical 13セル / Supply 16セルを、診断CSVから入力レベルまで追跡して修正する。

## Technical
`web_technical_trace_20260903.csv`を使った再現では、7685 / 7409 / 4116 / 6834の全13差分が、raw `C`をtechnical入力とし`AdjFactor`を一度だけ適用するとPC値へ一致した。Web historical shardの`AdjC`は既にretroactive調整済みのため、これをさらにAdjFactor loopへ渡すと二重調整になる。alpha78ではDiscoveryの表示/Return用closeとtechnical raw closeを分離した。

## Supply
`web_large_short_trace_20260903.csv`からWebの16差分値は全て再現できたため、Web集計式自体ではなくraw snapshot差と判定。J-Quants/JPXの大口空売りは同日中に複数回更新され得るため、取得済みcoverageを永久固定せず、一括更新時は直近3日を再確認する。再照会したDiscDateはDB内snapshotを置換する。

## Discovery Daily freeze
過去日は固定するが、現在のasOf日だけは同日中の再実行で置換する。これにより17時台/18時台に作った行を、需給の最終更新後に再計算できる。

## 実機手順
1. alpha78へ更新。
2. 最上段「次の取引日を全データ更新」をもう一度押す（新規日足なしでも最新日の需給を補完）。
3. PC alpha26a13側でも「最新データ更新」→ Screening再分析を実行し、最新`discovery_episode_daily.csv`を生成。
4. Web⑦で最新PC Dailyを選び「Discovery Daily計算エンジンを再計算・Parity」。
5. 残差があれば差分診断CSVだけを書き出して調査する。

---

## alpha79

# v7e-alpha79 — JST/UTC date scan fix

## 原因
`isoDays()` が `new Date("YYYY-MM-DDT00:00:00")`（端末ローカル時刻）を作った後に `toISOString()` へ変換していたため、日本時間では日付が1日前へずれていました。

例: 2026-08-31 ～ 2026-09-03 を指定しても、JST端末では API 照会日が 2026-08-30 ～ 2026-09-02 になっていました。
そのため9/3の大口空売り開示をWebだけ取り込めず、Discovery Dailyの基準日Supply 16セル差が残る原因になりました。

## 修正
- ISO日付をUTCの年月日演算だけで進める純粋な日付helperへ変更。
- `isoDays` / `isoWeekdays` / 信用残の金曜判定 / 最上段一括更新 / 旧5日同期を同じ日付意味論へ統一。
- Screeningの既定基準日も端末ローカル日付を使用。
- Screening / Discoveryのスコア・計算式そのものには変更なし。

## 実機確認
1. alpha79をデプロイ。
2. 最上段「次の取引日を全データ更新」を1回押す（新規日足なしでも9/3の任意データを再確認）。
3. Discovery Daily計算エンジンを再計算・Parity。
4. Supplyが残る場合のみ差分診断CSVと大口空売り診断CSVを再出力。
