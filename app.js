const $=id=>document.getElementById(id);
const state={env:null,direct:null,existing:null};
function box(id,cls,t){const e=$(id);e.className="result "+cls;e.textContent=t}
function fmt(n){const u=["B","KB","MB","GB"];let x=n,i=0;while(x>=1024&&i<u.length-1){x/=1024;i++}return `${x.toFixed(i>=2?2:1)} ${u[i]}`}
async function root(){if(!navigator.storage?.getDirectory)throw new Error("OPFS未対応");return navigator.storage.getDirectory()}

async function envCheck(){
  const r={
    secureContext:isSecureContext,
    crossOriginIsolated:globalThis.crossOriginIsolated===true,
    sharedArrayBuffer:typeof SharedArrayBuffer!=="undefined",
    opfs:!!navigator.storage?.getDirectory,
    worker:typeof Worker!=="undefined",
    serviceWorker:"serviceWorker" in navigator
  };
  state.env=r;
  const sqliteOpfsReady=r.secureContext&&r.crossOriginIsolated&&r.sharedArrayBuffer&&r.opfs&&r.worker;
  box("envResult",sqliteOpfsReady?"pass":"warnr",
`Secure Context: ${r.secureContext?"PASS":"FAIL"}
crossOriginIsolated: ${r.crossOriginIsolated?"PASS":"NO"}
SharedArrayBuffer: ${r.sharedArrayBuffer?"PASS":"NO"}
OPFS: ${r.opfs?"PASS":"FAIL"}
Web Worker: ${r.worker?"PASS":"FAIL"}
Service Worker: ${r.serviceWorker?"PASS":"FAIL"}

公式SQLite OPFS VFS前提: ${sqliteOpfsReady?"PASS":"未達"}
${sqliteOpfsReady?"この配信環境でSQLite-WASM OPFS VFSへ進めます。":"Direct OPFS自体を先に試し、SQLite-WASM側は配信ヘッダー/ホスト変更を含めて次段階で対応します。"}`);
}

async function directTest(){
  box("directResult","warnr","Workerを起動中…");
  let w;
  try{
    w=new Worker("./opfs-worker.js");
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("60秒タイムアウト")),60000);
      w.onmessage=e=>{clearTimeout(timer);e.data?.ok?resolve(e.data):reject(new Error(e.data?.error||"Worker失敗"))};
      w.onerror=e=>{clearTimeout(timer);reject(new Error(e.message||"Worker error"))};
      w.postMessage({cmd:"test"});
    });
    state.direct=result;
    box("directResult","pass",
`PASS
方式: Worker + OPFS SyncAccessHandle
テストファイル論理サイズ: ${fmt(result.fileSize)}
全体ArrayBuffer化: なし
書込位置: 先頭 / 中央 / 末尾
読出照合: PASS
処理時間: ${result.elapsedMs} ms
テストファイル削除: ${result.deleted?"PASS":"FAIL"}

「巨大ファイル全体をRAMへ載せずに直接ランダムアクセス」は成立しました。`);
  }catch(e){
    state.direct={ok:false,error:String(e)};
    box("directResult","fail","FAIL\n"+e);
  }finally{if(w)w.terminate()}
}

async function existing(){
  try{
    const r=await root(),h=await r.getFileHandle("jq_poc3_datalake.sqlite"),f=await h.getFile();
    const head=new Uint8Array(await f.slice(0,16).arrayBuffer());
    const exp=[83,81,76,105,116,101,32,102,111,114,109,97,116,32,51,0];
    const headerOk=exp.every((v,i)=>head[i]===v);
    state.existing={ok:true,size:f.size,headerOk,lastModified:f.lastModified};
    box("existingResult",headerOk?"pass":"warnr",
`DataLake: FOUND
容量: ${fmt(f.size)} (${f.size.toLocaleString()} bytes)
SQLite header: ${headerOk?"PASS":"不一致"}
更新日時: ${new Date(f.lastModified).toLocaleString()}

既存DBは変更していません。`);
  }catch(e){state.existing={ok:false,error:String(e)};box("existingResult","fail","既存DataLake確認FAIL\n"+e)}
}

function summary(){
  const direct=state.direct?.ok===true;
  const env=state.env;
  const sqliteReady=env?.secureContext&&env?.crossOriginIsolated&&env?.sharedArrayBuffer&&env?.opfs&&env?.worker;
  const old=state.existing?.ok&&state.existing?.headerOk;
  let cls=direct&&old?"pass":"warnr";
  let next=sqliteReady
    ?"次段階: 公式SQLite-WASM OPFS VFSで既存DBのimport/開閉PoCへ進む。"
    :"次段階: Direct OPFSは成立。公式SQLite-WASM OPFS VFS用にCOOP/COEPを設定できる配信環境へ切替える（またはヘッダー対応を先に実装）必要があります。";
  box("summaryResult",cls,
`Direct OPFS: ${direct?"PASS":"未PASS"}
既存DataLake保全: ${old?"PASS":"未確認/要確認"}
SQLite-WASM OPFS前提: ${sqliteReady?"PASS":"未達"}

総合: ${direct&&old?"旧sql.js方式を捨てる技術的方向は成立。":"未完了項目を確認してください。"}
${next}`);
}

$("envBtn").onclick=envCheck;
$("directBtn").onclick=directTest;
$("existingBtn").onclick=existing;
$("summaryBtn").onclick=summary;
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));