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
