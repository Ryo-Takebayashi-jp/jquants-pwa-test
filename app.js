const DBNAME="jq_market_v7c.sqlite";
const $=id=>document.getElementById(id);
const state={env:null,imported:null,smoke:null,opened:null,quick:null};
function box(id,cls,t){const e=$(id);e.className="result "+cls;e.textContent=t}
function fmt(n){const u=["B","KB","MB","GB","TB"];let x=n,i=0;while(x>=1024&&i<u.length-1){x/=1024;i++}return `${x.toFixed(i>=2?2:1)} ${u[i]}`}
function sqliteHeaderOk(bytes){const exp=[83,81,76,105,116,101,32,102,111,114,109,97,116,32,51,0];return exp.every((v,i)=>bytes[i]===v)}
async function root(){if(!navigator.storage?.getDirectory)throw new Error("OPFS未対応");return navigator.storage.getDirectory()}

async function envCheck(){
 try{
  const est=await navigator.storage?.estimate?.();
  const r={
    secure:isSecureContext, isolated:globalThis.crossOriginIsolated===true,
    sab:typeof SharedArrayBuffer!=="undefined", opfs:!!navigator.storage?.getDirectory,
    worker:typeof Worker!=="undefined", usage:est?.usage??null, quota:est?.quota??null
  };
  r.ready=r.secure&&r.isolated&&r.sab&&r.opfs&&r.worker;
  state.env=r;
  box("envResult",r.ready?"pass":"warn",
`Secure Context: ${r.secure?"PASS":"FAIL"}
crossOriginIsolated: ${r.isolated?"PASS":"NO"}
SharedArrayBuffer: ${r.sab?"PASS":"NO"}
OPFS: ${r.opfs?"PASS":"FAIL"}
Worker: ${r.worker?"PASS":"FAIL"}
使用量: ${r.usage!=null?fmt(r.usage):"不明"}
Quota: ${r.quota!=null?fmt(r.quota):"不明"}
空き概算: ${r.quota!=null&&r.usage!=null?fmt(Math.max(0,r.quota-r.usage)):"不明"}

v7c前提: ${r.ready?"PASS":"未達"}`);
 }catch(e){state.env={ready:false,error:String(e)};box("envResult","fail","FAIL\n"+e)}
}

async function existingOpfsFile(){
 try{const r=await root(),h=await r.getFileHandle(DBNAME),f=await h.getFile();return f}catch(_){return null}
}

async function importDb(){
 const f=$("fileInput").files?.[0];
 if(!f){box("importResult","warn","レスキューした .sqlite を選択してください。");return}
 const head=new Uint8Array(await f.slice(0,16).arrayBuffer());
 if(!sqliteHeaderOk(head)){box("importResult","fail","SQLite header不一致。Importしません。");return}
 $("importBtn").disabled=true; $("importMeter").style.width="0%";
 try{
  const r=await workerCall("import",1800000,s=>{
   if(s.stage==="stream-import"){
    const m=String(s.detail||"").match(/(\d+) \/ (\d+)/);if(m){const pct=Number(m[1])/Number(m[2])*100;$("importMeter").style.width=Math.min(100,pct).toFixed(1)+"%";}
   }
   box("importResult","run",`SAH PoolへStreaming Import中…\nStage: ${s.stage}\n${s.detail||""}`);
  },f);
  state.imported={ok:true,...r};$("importMeter").style.width="100%";
  box("importResult","pass",`PASS\nImport先: jq-sahpool / ${DBNAME}\nサイズ: ${fmt(r.bytes)} (${Number(r.bytes).toLocaleString()} bytes)\nチャンク: ${r.chunks}\nVFS: ${r.vfsName}\n処理時間: ${(r.elapsedMs/1000).toFixed(1)}秒\n全体ArrayBuffer化: なし`);
 }catch(e){state.imported={ok:false,error:String(e)};box("importResult","fail","Import FAIL\n"+e)}finally{$("importBtn").disabled=false}
}

function workerCall(cmd,timeoutMs=180000,onStatus=null,file=null){
 return new Promise((resolve,reject)=>{
  const w=new Worker("./sqlite-worker.js");
  const timer=setTimeout(()=>{w.terminate();reject(new Error("タイムアウト"))},timeoutMs);
  w.onmessage=e=>{
    const d=e.data||{};
    if(d.type==="status"){
      if(onStatus)onStatus(d);
      return;
    }
    clearTimeout(timer);w.terminate();
    d.ok?resolve(d):reject(new Error(
      `[${d.stage||"worker"}] ${d.error||"Worker失敗"}`+
      (d.filename?`
${d.filename}:${d.lineno||0}:${d.colno||0}`:"")
    ));
  };
  w.onerror=e=>{
    clearTimeout(timer);w.terminate();
    reject(new Error(
      `Worker script error: ${e.message||"unknown"}
`+
      `${e.filename||""}:${e.lineno||0}:${e.colno||0}`
    ));
  };
  w.postMessage({cmd,dbName:"/"+DBNAME,file});
 });
}


async function sqliteProxyCheck(){
 try{const targets=[{url:"/sqlite/index.mjs",type:"javascript"},{url:"/sqlite/sqlite3.wasm",type:"application/wasm"}],lines=[];
 for(const t of targets){const r=await fetch(t.url,{cache:"no-store"}),ct=(r.headers.get("content-type")||"").toLowerCase(),px=r.headers.get("x-jq-sqlite-proxy")||"-";const typeOk=t.type==="application/wasm"?ct.includes("application/wasm"):ct.includes("javascript");if(!r.ok||!typeOk||px!=="3.53.0-build1")throw new Error(`${t.url}: HTTP=${r.status} type=${ct} proxy=${px}`);lines.push(`${t.url}: PASS / ${ct} / proxy=${px}`);} box("proxyResult","pass","Same-origin SQLite core assets: PASS\n"+lines.join("\n"));}
 catch(e){box("proxyResult","fail","Same-origin SQLite core assets: FAIL\n"+e)}}

$("proxyBtn").onclick=sqliteProxyCheck;


async function initOnly(){box("initResult","run","SQLite-WASM opfs-sahpool初期化中…");try{const r=await workerCall("init",180000,s=>box("initResult","run",`Stage: ${s.stage}\n${s.detail||""}`));state.init=r;const ok=r.vfs&&r.poolClass;box("initResult",ok?"pass":"fail",`${ok?"PASS":"FAIL"}\nSQLite version: ${r.sqliteVersion}\nVFS: ${r.vfsName} / ${r.vfs?"PASS":"FAIL"}\nOpfsSAHPoolDb class: ${r.poolClass?"PASS":"FAIL"}\nPool capacity: ${r.capacity}\n既存DB: ${(r.files||[]).join(", ")||"なし"}\n初期化時間: ${(r.elapsedMs/1000).toFixed(2)}秒`);}catch(e){state.init={ok:false,error:String(e)};box("initResult","fail","SQLite Init FAIL\n"+e)}}

$("initBtn").onclick=initOnly;

async function smokeTest(){
 box("smokeResult","run","小型DBを書き込み中…");
 try{
  const w=await workerCall("smoke-write",180000,s=>box("smokeResult","run",`書込Worker: ${s.stage}\n${s.detail||""}`));
  box("smokeResult","run",`書込PASS: ${w.rows}行\nWorkerを終了し、別Workerで再Openします…`);
  const r=await workerCall("smoke-read",180000,s=>box("smokeResult","run",`再Open Worker: ${s.stage}\n${s.detail||""}`));
  state.smoke=r;
  const ok=r.persisted===true;
  box("smokeResult",ok?"pass":"fail",`${ok?"PASS":"FAIL"}\n別Worker再Open: ${ok?"PASS":"FAIL"}\n行数: ${r.rows}\n値: ${r.value}\n永続化: ${ok?"PASS":"FAIL"}\n処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒`);
 }catch(e){state.smoke={ok:false,error:String(e)};box("smokeResult","fail","SAH Pool基本動作 FAIL\n"+e)}
}
$("smokeBtn").onclick=smokeTest;

async function openDb(){
 box("openResult","run","SQLite-WASMを起動してDBを開いています…");
 try{
  const r=await workerCall("open",180000,(s)=>{
   box("openResult","run",`SQLite-WASM起動中…\nStage: ${s.stage}\n${s.detail||""}`);
  });
  state.opened=r;
  box("openResult","pass",
`PASS
SQLite version: ${r.sqliteVersion}
OPFS VFS: ${r.vfsUsed}
DB filename: ${r.filename}
open + query時間: ${(r.elapsedMs/1000).toFixed(2)}秒
テーブル数: ${r.tableCount}
bars_daily: ${Number(r.barsCount).toLocaleString()}行
期間: ${r.minDate||"-"} ～ ${r.maxDate||"-"}
sync_log OK: ${Number(r.syncOk||0).toLocaleString()}日

DB全体RAM展開: なし`);
 }catch(e){state.opened={ok:false,error:String(e)};box("openResult","fail","Direct Open FAIL\n"+e)}
}

async function quickCheck(){
 box("quickResult","run","quick_check実行中… 1GB超のため時間がかかる場合があります。");
 try{
  const r=await workerCall("quick",600000,(s)=>{
   box("quickResult","run",`quick_check準備/実行中…\nStage: ${s.stage}\n${s.detail||""}`);
  });
  state.quick=r;
  box("quickResult",r.quick==="ok"?"pass":"warn",
`quick_check: ${r.quick}
処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒`);
 }catch(e){state.quick={ok:false,error:String(e)};box("quickResult","fail","quick_check FAIL\n"+e)}
}

function summary(){
 const env=state.env?.ready===true, imp=state.imported?.ok===true, ini=state.init?.ok===true, smoke=state.smoke?.persisted===true, op=state.opened?.ok===true;
 const q=state.quick?.quick==="ok";
 box("summaryResult",env&&imp&&ini&&op?"pass":"warn",
`Cloudflare/OPFS前提: ${env?"PASS":"未PASS"}
1.12GB Streaming Import: ${imp?"PASS":"未PASS"}
SQLite-WASM Init(opfs-sahpool): ${ini?"PASS":"未PASS"}
SAH Pool小型DB永続化: ${smoke?"PASS":"未PASS"}
SQLite-WASM Direct Open: ${op?"PASS":"未PASS"}
quick_check: ${q?"PASS":state.quick?"要確認":"未実行（任意）"}

総合: ${env&&imp&&ini&&op?"新保存エンジン方式は実機成立。旧sql.js全体RAM展開方式を廃止できます。":"未完了項目を確認してください。"}
${env&&imp&&ini&&op?"次段階v7dで、このDBへJ-Quants差分/残り期間をSQLite-WASM経由で直接追記し、10年完走テストへ進めます。":""}`);
}

$("envBtn").onclick=envCheck;
$("importBtn").onclick=importDb;
$("openBtn").onclick=openDb;
$("quickBtn").onclick=quickCheck;

$("migrateBtn").onclick=async()=>{
 box("migrateResult","run","Runtime migration適用中…");
 try{const r=await workerCall("runtime-migrate",180000);state.migrate=r;box("migrateResult","pass",`PASS\nmigration: ${r.migration}\n処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒`)}
 catch(e){box("migrateResult","fail","FAIL\n"+e)}
};
$("appendBtn").onclick=async()=>{
 box("appendResult","run","Direct write / checkpointテスト中…");
 try{const r=await workerCall("append-test",180000);state.append=r;box("appendResult","pass",`PASS\n${JSON.stringify(r.rows,null,2)}\nDB全体RAM展開: なし`)}
 catch(e){box("appendResult","fail","FAIL\n"+e)}
};
$("resumeBtn").onclick=async()=>{
 box("resumeResult","run","新しいWorkerでcheckpoint再読込中…");
 try{const r=await workerCall("resume-test",180000);state.resume=r;box("resumeResult",r.resumed?"pass":"fail",`${r.resumed?"PASS":"FAIL"}\nWorker再起動後Resume: ${r.resumed}\n${JSON.stringify(r.after,null,2)}`)}
 catch(e){box("resumeResult","fail","FAIL\n"+e)}
};

$("summaryBtn").onclick=summary;

async function showHistory(){
 try{
  const r=await fetch("./release_history.json",{cache:"no-store"});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const j=await r.json();
  const recent=(j.releases||[]).slice(-8).reverse();
  const lines=[
    `Version: ${j.current?.version||"-"}`,
    `Build date: ${j.current?.build_date||"-"}`,
    `Schema version: ${j.current?.schema_version||"-"}`,
    `Migration version: ${j.current?.migration_version||"-"}`,
    "",
    "最近の更新:"
  ];
  for(const x of recent) lines.push(`• ${x.product} ${x.version} [${x.status}] — ${x.summary}`);
  box("historyResult","pass",lines.join("\n"));
 }catch(e){box("historyResult","fail","更新履歴の読み込みFAIL\n"+e)}
}
$("historyBtn").onclick=showHistory;

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));

$("schemaBtn").onclick=async()=>{
 box("schemaResult","run","1.12GB DataLakeの実スキーマ検査中…");
 try{
  const r=await workerCall("schema-probe",180000);
  state.schemaProbe=r;
  const summary=r.tables.map(t=>`${t}: cols=${r.details[t].columns.length} / PK=[${r.details[t].pk.join(",")}] / date=[${r.details[t].dateCols.join(",")}]`).join("\n");
  box("schemaResult","pass",`PASS\nテーブル数: ${r.tables.length}\n${summary}`);
 }catch(e){box("schemaResult","fail","FAIL\n"+e)}
};
$("batchBtn").onclick=async()=>{
 box("batchResult","run","日付単位Transaction/Commit/Checkpointテスト中…");
 try{
  const r=await workerCall("date-batch-test",180000,s=>box("batchResult","run",`Stage: ${s.stage}\n${s.detail||""}`));
  state.batch=r;
  box("batchResult","pass",`PASS\n4日ではなく初期3日を日単位Commit\nDB行数: ${r.count}\nCheckpoint: ${JSON.stringify(r.checkpoint,null,2)}\nDB全体RAM展開: なし`);
 }catch(e){box("batchResult","fail","FAIL\n"+e)}
};
$("batchResumeBtn").onclick=async()=>{
 box("batchResumeResult","run","新WorkerでCheckpointを読んで次日を追記中…");
 try{
  const r=await workerCall("date-batch-resume",180000);
  state.batchResume=r;
  box("batchResumeResult","pass",`PASS\nResume元: ${r.resumedFrom}\n次日Commit: ${r.next}\n累計行数: ${r.count}\n${JSON.stringify(r.checkpoint,null,2)}`);
 }catch(e){box("batchResumeResult","fail","FAIL\n"+e)}
};
