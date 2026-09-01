# CHANGELOG

## v7e-alpha36 — 2026-09-01
- alpha35がiPhoneで古い需給ロジックを実行していた問題を修正。Service Worker cache名がalpha29のまま残っていたため、alpha36へ明示更新。
- index.htmlのapp.js、Worker、Service Worker登録にalpha36のquery cache-bustを付与。
- 空売り比率はAPI仕様どおり `date` 単位走査へ変更（rangeのみは不可）。
- 空売り報告はAPI仕様どおり `disc_date` 単位走査へ変更（disc_date_from/toだけに依存しない）。
- 信用週末残高は金曜日 `date`、日々公表信用は平日 `date` の既存alpha35方式を維持。
- 投資部門別はrange取得を維持。
- J-Quants APIキー共通入力欄をページ最上部に移設。全取得処理が同じセッショントークンを利用。
- 銘柄マスター内の重複APIキー入力欄は廃止し、上部共通欄へ統一。
