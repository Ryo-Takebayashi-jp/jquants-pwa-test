# v7e-alpha18
- 正式バックアップUIを開発者診断の外へ移動。
- 内部Catalog+Shardsは維持、外部のみJQB v1の1ファイル化。
- JQB復元はFile.sliceで1DBずつ既存Streaming Importへ渡す。
- iPhone Safariで外部Streaming書込APIが使えない場合、3GB巨大Blob化は安全上実行しない。
- alpha17の複数SQLiteバックアップ/復元は互換・非常用として保持。
