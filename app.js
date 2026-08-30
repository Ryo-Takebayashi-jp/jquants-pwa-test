const $=id=>document.getElementById(id);
const state={env:null,direct:null,file:null};
function box(id,cls,t){const e=$(id);e.className="result "+cls;e.textContent=t}
function fmt(n){const u=["B","KB","MB","GB","TB"];let x=n,i=0;while(x>=1024&&i<u.length-1){x/=1024;i++}return `${x.toFixed(i>=2?2:1)} ${u[i]}`}
function sqliteHeaderOk(bytes){const exp=[83,81,76,105,116,101,32,102,111,114,109,97,116,32,51,0];return exp.every((v,i)=>bytes[i]===v)}

async function envCheck(){
 const r={
   url:location.href,
   secure:isSecureContext,
   isolated:globalThis.crossOriginIsolated===true,
   sab:typeof SharedArrayBuffer!=="undefined",
   opfs:!!navigator.storage?.getDirectory,
   worker:typeof Worker!=="undefined",
   sw:"serviceWorker" in navigator
 };
 state.env=r;
 const ready=r.secure&&r.isolated&&r.sab&&r.opfs&&r.worker;
 box("envResult",ready?"pass":"warn",
`URL: ${r.url}
Secure Context: ${r.secure?"PASS":"FAIL"}
crossOriginIsolated: ${r.isolated?"PASS":"NO"}
SharedArrayBuffer: ${r.sab?"PASS":"NO"}
OPFS: ${r.opfs?"PASS":"FAIL"}
Web Worker: ${r.worker?"PASS":"FAIL"}
Service Worker: ${r.sw?"PASS":"FAIL"}

SQLite-WASM OPFS VFS前提: ${ready?"PASS":"未達"}

${ready?"Cloudflare Pages側の配信条件は成立しました。":"もし pages.dev 上で未達なら _headers の反映状況を確認します。"}`);
}

async function directTest(){
 let w;box("directResult","warn","Worker起動中…");
 try{
   w=new Worker("./opfs-worker.js");
   const r=await new Promise((resolve,reject)=>{
     const tm=setTimeout(()=>reject(new Error("60秒タイムアウト")),60000);
     w.onmessage=e=>{clearTimeout(tm);e.data?.ok?resolve(e.data):reject(new Error(e.data?.error||"Worker失敗"))};
     w.onerror=e=>{clearTimeout(tm);reject(new Error(e.message||"Worker error"))};
     w.postMessage({cmd:"test"});
   });
   state.direct=r;
   box("directResult","pass",
`PASS
Worker + SyncAccessHandle: PASS
論理ファイルサイズ: ${fmt(r.fileSize)}
全体RAM読込: なし
先頭/中央/末尾の照合: PASS
処理時間: ${r.elapsedMs} ms
テストファイル削除: ${r.deleted?"PASS":"FAIL"}`);
 }catch(e){state.direct={ok:false,error:String(e)};box("directResult","fail","FAIL\n"+e)}
 finally{if(w)w.terminate()}
}

async function fileCheck(){
 try{
   const f=$("fileInput").files?.[0];
   if(!f)throw new Error("レスキューした .sqlite ファイルを選択してください。");
   const head=new Uint8Array(await f.slice(0,16).arrayBuffer());
   const ok=sqliteHeaderOk(head);
   state.file={ok, size:f.size, name:f.name, lastModified:f.lastModified};
   box("fileResult",ok?"pass":"warn",
`ファイル: ${f.name}
容量: ${fmt(f.size)} (${f.size.toLocaleString()} bytes)
SQLite header: ${ok?"PASS":"不一致"}
更新日時: ${new Date(f.lastModified).toLocaleString()}

${ok?"レスキューSQLiteはImport候補として正常です。":"SQLiteとして要調査です。"}`);
 }catch(e){state.file={ok:false,error:String(e)};box("fileResult","fail","FAIL\n"+e)}
}

function summary(){
 const e=state.env;
 const ready=e?.secure&&e?.isolated&&e?.sab&&e?.opfs&&e?.worker;
 const direct=state.direct?.ok===true;
 const file=state.file?.ok===true;
 box("summaryResult",ready&&direct?"pass":"warn",
`Cloudflare配信前提: ${ready?"PASS":"未PASS"}
Direct OPFS: ${direct?"PASS":"未PASS"}
レスキューSQLite: ${file?"PASS":state.file?"要確認":"未確認（任意）"}

総合: ${ready&&direct?"SQLite-WASM Direct OPFSエンジン導入へ進めます。":"配信環境またはDirect OPFSの未達項目を確認してください。"}
${ready&&direct?"次版v7cで、レスキューした1.12GB SQLiteをCloudflare側OPFSへストリーミングImportし、公式SQLite-WASMで直接開く試験へ進みます。":""}`);
}

$("envBtn").onclick=envCheck;
$("directBtn").onclick=directTest;
$("fileBtn").onclick=fileCheck;
$("summaryBtn").onclick=summary;
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));