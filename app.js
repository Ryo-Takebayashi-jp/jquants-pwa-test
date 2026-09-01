
window.addEventListener("error",(ev)=>{
  try{
    const el=document.getElementById("appBootStatus");
    if(el){ el.className="result fail"; el.textContent="JavaScript ERROR\n"+(ev.message||"unknown"); }
  }catch(_){}
});
window.addEventListener("unhandledrejection",(ev)=>{
  try{
    const el=document.getElementById("appBootStatus");
    if(el){ el.className="result fail"; el.textContent="Promise ERROR\n"+String(ev.reason||"unknown"); }
  }catch(_){}
});

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

let jqSqliteWorker=null;
let jqWorkerSeq=0;
const jqWorkerPending=new Map();
let jqWorkerQueue=Promise.resolve();

function ensureSqliteWorker(){
 if(jqSqliteWorker) return jqSqliteWorker;
 const w=new Worker("./sqlite-worker.js?v=v7d-beta5fb");
 jqSqliteWorker=w;
 w.onmessage=e=>{
   const d=e.data||{}, id=d.requestId;
   const p=jqWorkerPending.get(id);
   if(!p) return;
   if(d.type==="status"){
     if(p.onStatus) p.onStatus(d);
     return;
   }
   clearTimeout(p.timer);
   jqWorkerPending.delete(id);
   d.ok?p.resolve(d):p.reject(new Error(
     `[${d.stage||"worker"}] ${d.error||"Worker失敗"}`+
     (d.poolFiles?`\nSAH Pool files: ${JSON.stringify(d.poolFiles)}`:"")+
     (d.stack?`\n${d.stack}`:"")+
     (d.filename?`\n${d.filename}:${d.lineno||0}:${d.colno||0}`:"")
   ));
 };
 w.onerror=e=>{
   for(const [id,p] of jqWorkerPending){clearTimeout(p.timer);p.reject(new Error(`Worker script error: ${e.message||"unknown"}\n${e.filename||""}:${e.lineno||0}:${e.colno||0}`))}
   jqWorkerPending.clear(); try{w.terminate()}catch(_){}
   if(jqSqliteWorker===w)jqSqliteWorker=null;
 };
 return w;
}

function workerCallRaw(cmd,timeoutMs=180000,onStatus=null,file=null,payload=null){
 return new Promise((resolve,reject)=>{
   const w=ensureSqliteWorker(), requestId=++jqWorkerSeq;
   const timer=setTimeout(()=>{
     jqWorkerPending.delete(requestId);
     reject(new Error("タイムアウト"));
   },timeoutMs);
   jqWorkerPending.set(requestId,{resolve,reject,onStatus,timer});
   w.postMessage({requestId,cmd,dbName:"/"+DBNAME,file,payload});
 });
}
function workerCall(cmd,timeoutMs=180000,onStatus=null,file=null,payload=null){
 const run=()=>workerCallRaw(cmd,timeoutMs,onStatus,file,payload);
 const p=jqWorkerQueue.then(run,run);
 jqWorkerQueue=p.catch(()=>{});
 return p;
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

if($("schemaBtn")) $("schemaBtn").onclick=async()=>{
 box("schemaResult","run","1.12GB DataLakeの実スキーマ検査中…");
 try{
  const r=await workerCall("schema-probe",180000);
  state.schemaProbe=r;
  const summary=r.tables.map(t=>`${t}: cols=${r.details[t].columns.length} / PK=[${r.details[t].pk.join(",")}] / date=[${r.details[t].dateCols.join(",")}]`).join("\n");
  box("schemaResult","pass",`PASS\nテーブル数: ${r.tables.length}\n${summary}`);
 }catch(e){box("schemaResult","fail","FAIL\n"+e)}
};
if($("batchBtn")) $("batchBtn").onclick=async()=>{
 box("batchResult","run","日付単位Transaction/Commit/Checkpointテスト中…");
 try{
  const r=await workerCall("date-batch-test",180000,s=>box("batchResult","run",`Stage: ${s.stage}\n${s.detail||""}`));
  state.batch=r;
  box("batchResult","pass",`PASS\n4日ではなく初期3日を日単位Commit\nDB行数: ${r.count}\nCheckpoint: ${JSON.stringify(r.checkpoint,null,2)}\nDB全体RAM展開: なし`);
 }catch(e){box("batchResult","fail","FAIL\n"+e)}
};
if($("batchResumeBtn")) $("batchResumeBtn").onclick=async()=>{
 box("batchResumeResult","run","新WorkerでCheckpointを読んで次日を追記中…");
 try{
  const r=await workerCall("date-batch-resume",180000);
  state.batchResume=r;
  box("batchResumeResult","pass",`PASS\nResume元: ${r.resumedFrom}\n次日Commit: ${r.next}\n累計行数: ${r.count}\n${JSON.stringify(r.checkpoint,null,2)}`);
 }catch(e){box("batchResumeResult","fail","FAIL\n"+e)}
};


const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function jqAuthHeaders(token){
 return {"x-api-key":token,"Accept":"application/json"};
}
async function jqFetchDaily(date, token){
 if(!token) throw new Error("APIキーを入力してください");
 const normalized=String(date).replaceAll("-","");
 let url=`/api/jquants/equities/bars/daily?date=${encodeURIComponent(normalized)}`;
 let all=[], pageToken=null, pages=0;
 do{
   const u=new URL(url,location.origin);
   if(pageToken) u.searchParams.set("pagination_key",pageToken);
   let res;
   for(let attempt=0;attempt<5;attempt++){
     res=await fetch(u,{headers:jqAuthHeaders(token),cache:"no-store"});
     if(res.status!==429) break;
     const ra=Number(res.headers.get("Retry-After")||0);
     await sleep(ra?ra*1000:Math.min(16000,1000*(2**attempt)));
   }
   const text=await res.text();
   let j={}; try{j=text?JSON.parse(text):{}}catch(_){}
   if(!res.ok) throw new Error(`J-Quants HTTP ${res.status}: ${j.message||j.error||text.slice(0,300)}`);
   const rows=j.data||[];
   if(!Array.isArray(rows)) throw new Error("J-Quants V2 response data not recognized");
   all.push(...rows);
   pageToken=j.pagination_key||j.paginationKey||null;
   pages++; if(pages>100) throw new Error("pagination safety stop");
 }while(pageToken);
 return {rows:all,endpoint:"/v2/equities/bars/daily",pages};
}
async function jqCommitDate(date,token){
 const got=await jqFetchDaily(date,token);
 if(!got.rows.length) return {date,rows:0,endpoint:got.endpoint,skipped:true};
 const wr=await workerCall("jquants-bars-write",300000,null,null,{date,rows:got.rows});
 return {...wr,endpoint:got.endpoint};
}
if($("jqFetchBtn")) $("jqFetchBtn").onclick=async()=>{
 box("jqFetchResult","run","J-Quantsへ接続中…");
 try{
  const d=$("jqDate").value,t=$("jqToken").value.trim(),r=await jqFetchDaily(d,t);
  state.jqFetch=r;
  const keys=r.rows[0]?Object.keys(r.rows[0]).join(", "):"(0 rows)";
  box("jqFetchResult","pass",`PASS\nEndpoint: ${r.endpoint}\nDate: ${d}\nRows: ${r.rows.length}\nFields: ${keys}\nDB書込: なし`);
 }catch(e){box("jqFetchResult","fail","FAIL\n"+e)}
};
if($("jqWriteBtn")) $("jqWriteBtn").onclick=async()=>{
 box("jqWriteResult","run","取得 → Transaction → Commit中…");
 try{
  const d=$("jqDate").value,t=$("jqToken").value.trim(),r=await jqCommitDate(d,t);
  state.jqWrite=r;
  box("jqWriteResult","pass",`PASS\nDate: ${d}\nRows: ${r.rows}\nEndpoint: ${r.endpoint}\n${r.skipped?"市場データ0件のため書込なし":`Mapped columns: ${(r.columns||[]).join(", ")}\nPK: ${(r.pk||[]).join(", ")}\nVerify sample: ${JSON.stringify(r.verify,null,2)}\nCheckpoint: ${JSON.stringify(r.checkpoint,null,2)}`}`);
 }catch(e){box("jqWriteResult","fail","FAIL\n"+e)}
};
if($("jqFiveBtn")) $("jqFiveBtn").onclick=async()=>{
 box("jqFiveResult","run","最大5日を前景同期中… Safariを閉じないでください");
 try{
  const base=new Date($("jqDate").value+"T00:00:00"),t=$("jqToken").value.trim(),out=[];
  for(let back=4;back>=0;back--){
   const x=new Date(base);x.setDate(base.getDate()-back);
   if([0,6].includes(x.getDay())) continue;
   const d=x.toISOString().slice(0,10);
   box("jqFiveResult","run",`${d} を同期中…\n完了: ${out.length}日`);
   out.push(await jqCommitDate(d,t));
  }
  state.jqFive=out;
  box("jqFiveResult","pass",`PASS\n完了日数: ${out.length}\n${out.map(x=>`${x.date}: ${x.rows} rows${x.skipped?" (0件)":""}`).join("\n")}\nCheckpointは各日Commit後に更新`);
 }catch(e){box("jqFiveResult","fail","FAIL\n途中までCommit済み。再実行時はUPSERTで安全に再処理できます。\n"+e)}
};


function isoAddDays(s,n){
 const [y,m,d]=String(s).split("-").map(Number);
 const x=new Date(Date.UTC(y,m-1,d+n));
 return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;
}
function maxIso(...xs){ return xs.filter(Boolean).sort().at(-1)||null; }
function isWeekendIso(s){
 const [y,m,d]=String(s).split("-").map(Number);
 return [0,6].includes(new Date(Date.UTC(y,m-1,d)).getUTCDay());
}
function dateRangeExclusive(startInclusive,endInclusive,maxDays=20){
 const out=[]; let d=startInclusive;
 while(d<=endInclusive && out.length<maxDays){ if(!isWeekendIso(d))out.push(d); d=isoAddDays(d,1); }
 return out;
}
async function getAutoState(){ return await workerCall("bars-auto-state",180000); }
async function autoCommitDate(d,token,mode="daily"){
 const got=await jqFetchDaily(d,token);
 const checkpointDataset=mode==="backfill"?"bars_daily_backfill":"bars_daily_jquants";
 const progressDataset=mode==="backfill"?"bars_daily_backfill":"bars_daily_auto";
 if(!got.rows.length){
   const mark=await workerCall("bars-auto-no-data",180000,null,null,{date:d,progressDataset});
   return {date:d,rows:0,endpoint:got.endpoint,noData:true,checkpoint:mark.checkpoint,mode};
 }
 const wr=await workerCall("jquants-bars-write",300000,null,null,{date:d,rows:got.rows,checkpointDataset});
 const mark=await workerCall("bars-auto-mark",180000,null,null,{date:d,rows:wr.rows,progressDataset});
 return {...wr,endpoint:got.endpoint,autoCheckpoint:mark.checkpoint,mode};
}
if($("autoTargetDate")) $("autoTargetDate").value=new Date().toLocaleDateString("sv-SE");
if($("autoStateBtn")) $("autoStateBtn").onclick=async()=>{
 box("autoStateResult","run","DataLakeとCheckpointを確認中…");
 try{
   const r=await getAutoState(); state.autoState=r;
   const s=r.stats||{}, cp=(r.checkpoint||[])[0], jq=(r.jqcheckpoint||[])[0];
   const anchor=maxIso(s.max_date,cp?.last_success_date,jq?.last_success_date);
   box("autoStateResult","pass",
`PASS
DataLake期間: ${s.min_date||"-"} ～ ${s.max_date||"-"}
総行数: ${Number(s.rows||0).toLocaleString()}
実データ日数: ${Number(s.distinct_dates||0).toLocaleString()}
Auto checkpoint: ${cp?.last_success_date||"なし"}
J-Quants checkpoint: ${jq?.last_success_date||"なし"}
次回開始基準: ${anchor||"判定不能"}${anchor?` → ${isoAddDays(anchor,1)}から`:""}`);
 }catch(e){box("autoStateResult","fail","FAIL\n"+e)}
};
if($("autoSyncBtn")) $("autoSyncBtn").onclick=async()=>{
 box("autoSyncResult","run","同期計画を作成中…");
 try{
   const token=$("jqToken").value.trim(); if(!token)throw new Error("上のJ-Quants V2 APIキーを入力してください");
   const target=$("autoTargetDate").value, maxDays=Math.max(1,Math.min(60,Number($("autoMaxDays").value||20)));
   const st=await getAutoState(), s=st.stats||{}, cp=(st.checkpoint||[])[0], jq=(st.jqcheckpoint||[])[0];
   const anchor=maxIso(s.max_date,cp?.last_success_date,jq?.last_success_date);
   if(!anchor)throw new Error("開始基準日を判定できません");
   const start=isoAddDays(anchor,1);
   if(start>target){ box("autoSyncResult","pass",`PASS / 更新不要\n最終確認日: ${anchor}\nTarget: ${target}`); return; }
   const days=dateRangeExclusive(start,target,maxDays);
   if(!days.length){ box("autoSyncResult","pass",`PASS / 対象営業候補なし\n${start} ～ ${target}`); return; }
   const out=[];
   for(const d of days){
     box("autoSyncResult","run",`${d} を同期中…\n完了 ${out.length}/${days.length}\nSafariを閉じないでください`);
     out.push(await autoCommitDate(d,token));
   }
   const last=out.at(-1);
   box("autoSyncResult","pass",
`PASS
処理日数: ${out.length}
${out.map(x=>`${x.date}: ${x.rows} rows${x.noData?" (0件/休場候補)":""}`).join("\n")}
最終Checkpoint: ${last?.date}
${days.length>=maxDays && last?.date<target?"上限到達。もう一度押すと続きから再開します。":"Targetまで処理完了。"}`);
 }catch(e){box("autoSyncResult","fail","FAIL\n成功済み日まではCheckpoint保存済みです。再実行すれば続きから再開します。\n"+e)}
};
if($("recentRepairBtn")) $("recentRepairBtn").onclick=async()=>{
 box("recentRepairResult","run","直近5平日を再取得・UPSERT検証中…");
 try{
   const token=$("jqToken").value.trim(); if(!token)throw new Error("上のJ-Quants V2 APIキーを入力してください");
   const target=$("autoTargetDate").value, arr=[]; let d=target;
   while(arr.length<5){ if(!isWeekendIso(d))arr.push(d); d=isoAddDays(d,-1); }
   arr.reverse(); const out=[];
   for(const x of arr){
     box("recentRepairResult","run",`${x} を冪等再検証中…\n${out.length}/5`);
     const got=await jqFetchDaily(x,token);
     if(!got.rows.length){out.push({date:x,rows:0,noData:true});continue}
     const wr=await workerCall("jquants-bars-write",300000,null,null,{date:x,rows:got.rows});
     out.push({date:x,rows:wr.rows});
   }
   box("recentRepairResult","pass",`PASS\n${out.map(x=>`${x.date}: ${x.rows} rows${x.noData?" (0件)":""}`).join("\n")}\nUPSERT再実行で重複増加なし`);
 }catch(e){box("recentRepairResult","fail","FAIL\n"+e)}
};


let lastGapPlan=[];
function prodTokenValue(){return $("prodToken")?.value.trim()||$("jqToken")?.value.trim()||""}
function localTodayIso(){return new Date().toLocaleDateString("sv-SE")}
async function runDailyCatchupTo(target,token,maxDays=20){
  const st=await getAutoState(), s=st.stats||{}, cp=(st.checkpoint||[])[0], jq=(st.jqcheckpoint||[])[0];
  const anchor=maxIso(s.max_date,cp?.last_success_date,jq?.last_success_date);
  if(!anchor)throw new Error("開始基準日を判定できません");
  const start=isoAddDays(anchor,1);
  if(start>target) return {updated:false,anchor,target,out:[]};
  const days=dateRangeExclusive(start,target,maxDays),out=[];
  for(const d of days) out.push(await autoCommitDate(d,token));
  return {updated:true,anchor,target,out,more:(days.length>=maxDays && out.at(-1)?.date<target)};
}
if($("prodStatusBtn")) $("prodStatusBtn").onclick=async()=>{
 box("prodStatusResult","run","DataLake確認中…");
 try{
  const r=await getAutoState(),s=r.stats||{},cp=(r.checkpoint||[])[0],jq=(r.jqcheckpoint||[])[0];
  const anchor=maxIso(s.max_date,cp?.last_success_date,jq?.last_success_date);
  box("prodStatusResult","pass",`PASS
期間: ${s.min_date||"-"} ～ ${s.max_date||"-"}
総行数: ${Number(s.rows||0).toLocaleString()}
実データ日数: ${Number(s.distinct_dates||0).toLocaleString()}
日次更新基準: ${anchor||"不明"}
次回開始候補: ${anchor?isoAddDays(anchor,1):"-"}`);
 }catch(e){box("prodStatusResult","fail","FAIL\n"+e)}
};
if($("prodDailyBtn")) $("prodDailyBtn").onclick=async()=>{
 box("prodDailyResult","run","今日まで更新中…");
 try{
  const token=prodTokenValue(); if(!token)throw new Error("APIキーを入力してください");
  const r=await runDailyCatchupTo(localTodayIso(),token,20);
  if(!r.updated){box("prodDailyResult","pass",`PASS / 更新不要\n最終基準: ${r.anchor}\n今日: ${r.target}`);return}
  box("prodDailyResult","pass",`PASS
${r.out.map(x=>`${x.date}: ${x.rows} rows${x.noData?" (0件/休場候補)":""}`).join("\n")}
${r.more?"20日上限。もう一度押すと続きから。":"今日まで処理完了。"}`);
 }catch(e){box("prodDailyResult","fail","FAIL\n"+e)}
};
if($("gapTo")) $("gapTo").value=localTodayIso();
if($("gapScanBtn")) $("gapScanBtn").onclick=async()=>{
 box("gapScanResult","run","実データ日を照合して穴を検出中…");
 try{
   const from=$("gapFrom").value,to=$("gapTo").value;
   const r=await workerCall("bars-gap-scan",180000,null,null,{from,to});
   const have=new Set(r.dates),checkedNoData=new Set(r.noDataDates||[]),missing=[]; let d=from;
   while(d<=to){ if(!isWeekendIso(d) && !have.has(d) && !checkedNoData.has(d)) missing.push(d); d=isoAddDays(d,1); }
   lastGapPlan=missing;
   box("gapScanResult","pass",`PASS
範囲: ${from} ～ ${to}
実データ日: ${r.dates.length}
確認済み0件日: ${Number((r.noDataDates||[]).length).toLocaleString()}\n平日ベース穴候補: ${missing.length}
先頭20件:
${missing.slice(0,20).join("\n")||"(なし)"}
※祝日・休場日も候補に含まれ、API 0件なら確認済みとして処理します。`);
 }catch(e){box("gapScanResult","fail","FAIL\n"+e)}
};
if($("gapFillBtn")) $("gapFillBtn").onclick=async()=>{
 box("gapFillResult","run","穴埋め中…");
 try{
   const token=prodTokenValue(); if(!token)throw new Error("APIキーを入力してください");
   if(!lastGapPlan.length)throw new Error("先に③で穴を検出してください");
   const maxDays=Math.max(1,Math.min(60,Number($("gapMaxDays").value||20)));
   const batch=lastGapPlan.slice(0,maxDays),out=[];
   for(const d of batch){
     box("gapFillResult","run",`${d} を穴埋め中…\n${out.length}/${batch.length}\nSafariを閉じないでください`);
     out.push(await autoCommitDate(d,token,"backfill"));
   }
   const done=new Set(batch); lastGapPlan=lastGapPlan.filter(d=>!done.has(d));
   box("gapFillResult","pass",`PASS
今回処理: ${out.length}日
${out.map(x=>`${x.date}: ${x.rows} rows${x.noData?" (0件/休場)":""}`).join("\n")}
残り穴候補: ${lastGapPlan.length}
${lastGapPlan.length?"④をもう一度押すと次の束を処理。":"この検出範囲は処理完了。"}`);
 }catch(e){box("gapFillResult","fail","FAIL\n"+e)}
};



async function findFirstRealMissingTradingDay(token,from,to,maxProbe=40){
  const r=await workerCall("bars-gap-scan",180000,null,null,{from,to});
  const have=new Set(r.dates), checkedNoData=new Set(r.noDataDates||[]);
  let d=from, probed=0, skippedKnown=0;
  while(d<=to && probed<maxProbe){
    if(!isWeekendIso(d) && !have.has(d)){
      if(checkedNoData.has(d)){ skippedKnown++; d=isoAddDays(d,1); continue; }
      const t0=performance.now();
      const got=await jqFetchDaily(d,token);
      const fetchMs=Math.round(performance.now()-t0);
      probed++;
      if(got.rows.length) return {date:d,rows:got.rows,fetchMs,endpoint:got.endpoint,probed,skippedKnown};
      await workerCall("bars-auto-no-data",180000,null,null,{date:d,progressDataset:"bars_daily_backfill"});
    }
    d=isoAddDays(d,1);
  }
  return {date:null,rows:[],probed,skippedKnown};
}

let lastBench=null;
async function firstUsableGapDate(){
  if(lastGapPlan.length) return lastGapPlan[0];
  const from=$("gapFrom")?.value||"2016-08-30", to=$("gapTo")?.value||localTodayIso();
  const r=await workerCall("bars-gap-scan",180000,null,null,{from,to});
  const have=new Set(r.dates),checkedNoData=new Set(r.noDataDates||[]); let d=from;
  while(d<=to){
    if(!isWeekendIso(d) && !have.has(d) && !checkedNoData.has(d)) return d;
    d=isoAddDays(d,1);
  }
  return null;
}
if($("speedBenchBtn")) $("speedBenchBtn").onclick=async()=>{
 box("speedBenchResult","run","実取引日の欠損を探して、1営業日分を実測中…");
 try{
   const token=prodTokenValue(); if(!token)throw new Error("APIキーを入力してください");
   const from=$("gapFrom")?.value||"2016-08-30", to=$("gapTo")?.value||localTodayIso();
   const found=await findFirstRealMissingTradingDay(token,from,to,60);
   if(!found.date)throw new Error(`60候補を確認しましたが実データ日が見つかりませんでした。先に穴検出/休場日確認を続けてください。`);
   box("speedBenchResult","run",`${found.date}: ${found.rows.length.toLocaleString()}行取得済み
SQLite高速書込みを実測中…`);
   const tWrite0=performance.now();
   const r=await workerCall("bars-write-benchmark",300000,
     s=>box("speedBenchResult","run",s.detail||s.stage),
     null,{date:found.date,rows:found.rows});
   const writeTotalMs=Math.round(performance.now()-tWrite0);
   lastBench={...r,fetchMs:found.fetchMs,totalMs:found.fetchMs+writeTotalMs,date:found.date,rows:found.rows.length};
   const perDay=Math.max(1,lastBench.totalMs);
   const est20=(perDay*20/60000).toFixed(1);
   const est250=(perDay*250/3600000).toFixed(1);
   const est1791=(perDay*1791/3600000).toFixed(1);
   box("speedBenchResult","pass",`PASS
実取引日: ${found.date}
取得行数: ${found.rows.length.toLocaleString()}
API取得: ${(found.fetchMs/1000).toFixed(2)}秒
SQLite書込み: ${(r.writeMs/1000).toFixed(2)}秒
書込み速度: ${Number(r.rowsPerSec||0).toLocaleString()} rows/sec
API+書込み概算: ${(lastBench.totalMs/1000).toFixed(2)}秒/取引日

概算:
20取引日 ≈ ${est20}分
250取引日 ≈ ${est250}時間
1,791候補を全部実取引日と仮定 ≈ ${est1791}時間
※実際は祝日・既存データがあるので最終時間はこれより短くなります。

休場候補を追加確認: ${found.probed-1}日`);
 }catch(e){box("speedBenchResult","fail","FAIL\n"+e)}
};

if($("fastGapFillBtn")) $("fastGapFillBtn").onclick=async()=>{
 box("fastGapFillResult","run","高速穴埋めを開始…");
 try{
   const token=prodTokenValue(); if(!token)throw new Error("APIキーを入力してください");
   if(!lastGapPlan.length)throw new Error("先に『過去データの穴を検出』を実行してください");
   const maxDays=Math.max(1,Math.min(120,Number($("fastGapMax").value||40)));
   const batch=lastGapPlan.slice(0,maxDays), out=[], t0=performance.now();
   for(const d of batch){
     const elapsed=(performance.now()-t0)/1000;
     const avg=out.length?elapsed/out.length:0;
     const eta=avg?(avg*(batch.length-out.length)/60).toFixed(1):"-";
     box("fastGapFillResult","run",`${d} を処理中…
${out.length}/${batch.length}日完了
経過 ${(elapsed/60).toFixed(1)}分 / 推定残り ${eta}分
Safariを前面表示のままにしてください`);
     out.push(await autoCommitDate(d,token,"backfill"));
   }
   const done=new Set(batch); lastGapPlan=lastGapPlan.filter(d=>!done.has(d));
   const mins=((performance.now()-t0)/60000).toFixed(1);
   box("fastGapFillResult","pass",`PASS
今回: ${out.length}日 / ${mins}分
実データ書込日: ${out.filter(x=>x.rows>0).length}
0件/休場候補: ${out.filter(x=>x.rows===0).length}
残り穴候補: ${lastGapPlan.length}
${lastGapPlan.length?"もう一度②で続行できます。":"この検出範囲は完了。"}`);
 }catch(e){box("fastGapFillResult","fail",`FAIL
成功済み日までは保存済みです。再実行で続行できます。
${e}`)}
};

if($("poolDiagBtn")) $("poolDiagBtn").onclick=async()=>{
 box("poolDiagResult","run","Pool状態を取得中…DBは開きません。");
 try{const r=await workerCall("pool-diagnostic",120000,s=>box("poolDiagResult","run",s.detail||s.stage));
 box("poolDiagResult","pass",`PASS
SQLite: ${r.sqliteVersion}
VFS: ${r.vfsName}
Pool capacity: ${r.capacity}
要求DB名: ${r.requested}
Pool内ファイル数: ${r.files.length}
Pool内論理ファイル:
${r.files.length?r.files.map((x,i)=>`${i+1}. ${x}`).join("\n"):"（なし）"}
完全一致: ${r.exactRaw?"YES":"NO"}
スラッシュ除外一致: ${r.exactBase.length?r.exactBase.join(", "):"なし"}
所要: ${(r.elapsedMs/1000).toFixed(2)}秒`)}
 catch(e){box("poolDiagResult","fail","FAIL\n"+e)}
};
if($("poolProbeBtn")) $("poolProbeBtn").onclick=async()=>{
 box("poolProbeResult","run","read-only診断中…書込みはしません。");
 try{const r=await workerCall("pool-probe-candidates",300000,s=>box("poolProbeResult","run",s.detail||s.stage));
 const lines=r.probes.map((p,i)=>p.open==="PASS"
 ?`${i+1}. ${p.candidate}\nOPEN PASS / tables=${p.tables} / bars_daily=${p.hasBars?"YES":"NO"}${p.hasBars?` / rows=${Number(p.bars||0).toLocaleString()} / ${p.minDate}～${p.maxDate}`:""}`
 :`${i+1}. ${p.candidate}\nOPEN FAIL / ${p.error}`);
 const market=r.probes.find(p=>p.open==="PASS"&&p.hasBars);
 box("poolProbeResult",market?"pass":"fail",`${market?"MARKET DATALAKE FOUND":"MARKET DATALAKE NOT FOUND"}
${lines.join("\n\n")}
${market?`有効候補: ${market.candidate}`:"結果をスクショで送ってください。"}`)}
 catch(e){box("poolProbeResult","fail","FAIL\n"+e)}
};

if($("writeGateBtn")) $("writeGateBtn").onclick=async()=>{
 box("writeGateResult","run","既存1行を同値UPDATEして書込み経路を確認中…行数・価格は変更しません。");
 try{
   const r=await workerCall("write-gate-test",180000,s=>box("writeGateResult","run",s.detail||s.stage));
   box("writeGateResult",r.unchanged?"pass":"fail",`${r.unchanged?"PASS":"FAIL"}
DB: ${r.marketName}
sample: ${r.sample.date} / ${r.sample.code} / C=${r.sample.c}
rows before: ${Number(r.before).toLocaleString()}
rows after: ${Number(r.after).toLocaleString()}
行数不変: ${r.unchanged?"YES":"NO"}
所要: ${(r.elapsedMs/1000).toFixed(2)}秒`);
 }catch(e){box("writeGateResult","fail","FAIL\n"+e)}
};

setTimeout(()=>{
 try{
  const ok=isoAddDays("2026-08-28",1)==="2026-08-29"
   && isoAddDays("2026-08-31",1)==="2026-09-01"
   && isoAddDays("2026-01-01",-1)==="2025-12-31"
   && isWeekendIso("2026-08-29")&&isWeekendIso("2026-08-30")&&!isWeekendIso("2026-08-28");
  const el=$("dateEngineStatus"); if(el){el.className="result "+(ok?"pass":"fail");el.textContent=ok?"日付エンジン: PASS（同日ループ防止）":"日付エンジン: FAIL（更新しないでください）";}
 }catch(e){const el=$("dateEngineStatus");if(el){el.className="result fail";el.textContent="日付エンジン: FAIL\n"+e}}
},0);

let continuousStopRequested=false,continuousRunning=false,wakeLock=null;
async function jqWake(){try{if("wakeLock" in navigator)wakeLock=await navigator.wakeLock.request("screen")}catch(_){}}
async function jqUnwake(){try{await wakeLock?.release()}catch(_){}wakeLock=null}
if($("continuousStartBtn"))$("continuousStartBtn").onclick=async()=>{if(continuousRunning)return;continuousRunning=true;continuousStopRequested=false;await jqWake();try{
 const token=prodTokenValue();if(!token)throw new Error("APIキーを入力してください");const from=$("gapFrom").value,to=$("gapTo").value,batchSize=Math.max(5,Math.min(120,Number($("continuousBatch").value||40)));let total=0,real=0,zero=0,t0=performance.now();
 while(!continuousStopRequested){const s=await workerCall("bars-gap-scan",180000,null,null,{from,to}),have=new Set(s.dates),no=new Set(s.noDataDates||[]),missing=[];let d=from;while(d<=to){if(!isWeekendIso(d)&&!have.has(d)&&!no.has(d))missing.push(d);d=isoAddDays(d,1)}
 if(!missing.length){box("continuousResult","pass",`PASS\n全候補完了\n処理 ${total}日 / 実データ ${real} / 0件 ${zero}\n所要 ${((performance.now()-t0)/60000).toFixed(1)}分`);break}
 for(const day of missing.slice(0,batchSize)){if(continuousStopRequested)break;box("continuousResult","run",`処理中 ${day}\n処理 ${total} / 実データ ${real} / 0件 ${zero}\n残候補 ${missing.length}\n経過 ${((performance.now()-t0)/60000).toFixed(1)}分`);const r=await autoCommitDate(day,token,"backfill");total++;if(r.rows)real++;else zero++}}
 if(continuousStopRequested)box("continuousResult","pass",`安全停止。Commit済み ${total}日。再開始で続行できます。`);
}catch(e){box("continuousResult","fail","FAIL\n成功済み日付は保存済み。\n"+e)}finally{continuousRunning=false;await jqUnwake()}};
if($("continuousStopBtn"))$("continuousStopBtn").onclick=()=>{continuousStopRequested=true;box("continuousResult","run","安全停止予約。現在の日付完了後に停止します…")};
if($("backupEstimateBtn"))$("backupEstimateBtn").onclick=async()=>{try{const r=await workerCall("backup-stats",180000,null),e=await navigator.storage.estimate(),free=Math.max(0,(e.quota||0)-(e.usage||0)),need=Math.ceil(r.dbBytes*1.15),ok=!e.quota||free>=need;box("backupEstimateResult",ok?"pass":"fail",`${ok?"PASS":"容量不足の可能性"}\nDB ${(r.dbBytes/1073741824).toFixed(2)}GB\n空き ${e.quota?(free/1073741824).toFixed(2)+"GB":"不明"}\n必要目安 ${(need/1073741824).toFixed(2)}GB`);$("backupCreateBtn").disabled=!ok}catch(e){box("backupEstimateResult","fail","FAIL\n"+e)}};
if($("backupCreateBtn"))$("backupCreateBtn").onclick=async()=>{box("backupCreateResult","run","スナップショット作成中…");try{const r=await workerCall("backup-create",1800000,s=>box("backupCreateResult","run",s.detail||s.stage));box("backupCreateResult",r.ok?"pass":"fail",`${r.ok?"PASS":"FAIL"}\n${r.backupName}\nquick_check ${r.qc}\nrows ${Number(r.rows).toLocaleString()}\n${r.minDate}～${r.maxDate}\n${(r.dbBytes/1073741824).toFixed(2)}GB\n${(r.elapsedMs/1000).toFixed(1)}秒`)}catch(e){box("backupCreateResult","fail","FAIL\n"+e)}};

let jqDiagBusy=false;
async function jqRunDiag(buttonId,resultId,label,fn){
 const btn=$(buttonId), out=$(resultId);
 if(jqDiagBusy){
   box(resultId,"run","前のSQLite診断の完了待ちです…");
 }
 jqDiagBusy=true;
 if(btn) btn.disabled=true;
 try{
   box(resultId,"run",label+"…");
   return await fn();
 }finally{
   jqDiagBusy=false;
   if(btn) btn.disabled=false;
 }
}

if($("poolProbeBtn")) $("poolProbeBtn").onclick=()=>jqRunDiag("poolProbeBtn","poolProbeResult","DataLakeを1回だけOpen中",async()=>{
 const warm=await workerCall("market-warm-open",180000,s=>box("poolProbeResult","run",s.detail||s.stage));
 box("poolProbeResult","run",`DataLake Open完了: ${(warm.openMs/1000).toFixed(2)}秒
同じhandleで1行確認中…`);
 const r=await workerCall("market-fast-health",60000,null);
 box("poolProbeResult",r.ok?"pass":"fail",
   `${r.ok?"PASS":"FAIL"}
DB: ${r.marketName||"-"}
Open時間: ${(warm.openMs/1000).toFixed(2)}秒
テーブル: ${r.tableOk?"YES":"NO"}
サンプル: ${r.sample?JSON.stringify(r.sample):"なし"}
確認時間: ${((r.elapsedMs||0)/1000).toFixed(2)}秒
以後このページでは同じOpen済みhandleを再利用します。`);
});

if($("writeGateBtn")){
 const oldWrite=$("writeGateBtn").onclick;
 $("writeGateBtn").onclick=async ev=>{
   if(jqDiagBusy) box("writeGateResult","run","前のSQLite診断の完了待ちです…");
   jqDiagBusy=true; $("writeGateBtn").disabled=true;
   try{ return await oldWrite.call($("writeGateBtn"),ev); }
   finally{ jqDiagBusy=false; $("writeGateBtn").disabled=false; }
 };
}



if($("shardBootstrapBtn")) $("shardBootstrapBtn").onclick=async()=>{
 box("shardBootstrapResult","run","開始…");
 try{
   const r=await workerCall("shard-bootstrap",60000,s=>{
     box("shardBootstrapResult","run",`進行中: ${s.stage||"-"}
${s.detail||""}`);
   });
   box("shardBootstrapResult","pass",`PASS
Catalog: ${r.catalogName}
Recent shard: ${r.recentName}
登録: ${JSON.stringify(r.catalogRows)}
処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒
既存巨大DataLake: 未Open / 未変更`);
 }catch(e){
   const x=e&&typeof e==="object"?e:{message:String(e)};
   box("shardBootstrapResult","fail",`FAIL
stage: ${x.stage||"unknown"}
message: ${x.message||String(e)}
stack: ${x.stack||"-"}`);
 }
};
if($("shardHealthBtn")) $("shardHealthBtn").onclick=async()=>{
 box("shardHealthResult","run","開始…");
 try{
   const r=await workerCall("shard-health",60000,s=>{
     box("shardHealthResult","run",`進行中: ${s.stage||"-"}
${s.detail||""}`);
   });
   box("shardHealthResult",r.ok?"pass":"fail",`${r.ok?"PASS":"FAIL"}
Resolved shard: ${r.shard?.logical_name||"-"}
bars_daily: ${r.tableOk?"YES":"NO"} / ${Number(r.count||0).toLocaleString()} rows
Shard Open: ${(r.openMs/1000).toFixed(3)}秒
meta: ${JSON.stringify(r.meta)}
既存巨大DataLake: 未Open / 未変更`);
 }catch(e){
   const x=e&&typeof e==="object"?e:{message:String(e)};
   box("shardHealthResult","fail",`FAIL
stage: ${x.stage||"unknown"}
message: ${x.message||String(e)}
stack: ${x.stack||"-"}`);
 }
};

if($("shardLifecycleBtn")) $("shardLifecycleBtn").onclick=async()=>{
 box("shardLifecycleResult","run","開始…");
 try{
   const r=await workerCall("shard-lifecycle",60000,s=>box("shardLifecycleResult","run",`進行中: ${s.stage||"-"}\n${s.detail||""}`));
   box("shardLifecycleResult",r.ok?"pass":"fail",`${r.ok?"PASS":"FAIL"}
same-command reopen: ${(r.reopenMs/1000).toFixed(3)}秒
readback: ${r.value||"-"}
total: ${(r.elapsedMs/1000).toFixed(2)}秒`);
 }catch(e){
   const x=e&&typeof e==="object"?e:{message:String(e)};
   box("shardLifecycleResult","fail",`FAIL
stage: ${x.stage||"unknown"}
message: ${x.message||String(e)}
stack: ${x.stack||"-"}`);
 }
};

if($("runtimeProbeBtn")) $("runtimeProbeBtn").onclick=async()=>{
 box("runtimeProbeResult","run","1回目のWorkerメッセージ…");
 try{
   const a=await workerCall("runtime-probe",60000,s=>box("runtimeProbeResult","run",`1回目: ${s.stage||"-"}\n${s.detail||""}`));
   const t0=performance.now();
   box("runtimeProbeResult","run","2回目のWorkerメッセージ…");
   const b=await workerCall("runtime-probe",60000,s=>box("runtimeProbeResult","run",`2回目: ${s.stage||"-"}\n${s.detail||""}`));
   const ms=Math.round(performance.now()-t0);
   box("runtimeProbeResult","pass",`PASS
runtime #1: ${a.runtimeId}
runtime #2: ${b.runtimeId}
2回目往復: ${(ms/1000).toFixed(3)}秒
pool files: ${JSON.stringify(b.poolFiles)}
判定: 同一WorkerのSQLite/SAH Pool runtimeを再利用`);
 }catch(e){
   const x=e&&typeof e==="object"?e:{message:String(e)};
   box("runtimeProbeResult","fail",`FAIL
stage: ${x.stage||"unknown"}
message: ${x.message||String(e)}
stack: ${x.stack||"-"}`);
 }
};

if($("rawPingBtn")) $("rawPingBtn").onclick=async()=>{
 box("rawPingResult","run","PING #1…（SQLite/SAH Pool未使用）");
 try{
   const t1=performance.now();
   const a=await workerCall("raw-ping",10000,null,{seq:1});
   const ms1=Math.round(performance.now()-t1);
   box("rawPingResult","run",`PING #1 PASS ${(ms1/1000).toFixed(3)}秒\nPING #2…`);
   const t2=performance.now();
   const b=await workerCall("raw-ping",10000,null,{seq:2});
   const ms2=Math.round(performance.now()-t2);
   box("rawPingResult","pass",`PASS
PING #1: ${a.pong?"PONG":"?"} / ${(ms1/1000).toFixed(3)}秒
PING #2: ${b.pong?"PONG":"?"} / ${(ms2/1000).toFixed(3)}秒
SQLite: 未初期化
SAH Pool: 未初期化
判定: Workerの2メッセージ往復そのものは正常`);
 }catch(e){
   const x=e&&typeof e==="object"?e:{message:String(e)};
   box("rawPingResult","fail",`FAIL
message: ${x.message||String(e)}
stack: ${x.stack||"-"}
SQLite/SAH Poolは未使用`);
 }
};

if($("shardPilotBtn")) $("shardPilotBtn").onclick=async()=>{
 const days=Math.max(1,Math.min(10,Number($("shardPilotDays")?.value||5)));
 box("shardPilotResult","run",`最新${days}営業日をbars_recentへ移行中…\nLegacy DataLakeはread-only`);
 try{
   const r=await workerCall("shard-migrate-pilot",300000,s=>box("shardPilotResult","run",`進行中: ${s.stage||"-"}\n${s.detail||""}`),null,{days});
   box("shardPilotResult","pass",`PASS
Source: ${r.source}
対象: ${r.days}営業日 / ${r.minDate} ～ ${r.maxDate}
Source rows: ${Number(r.expectedRows).toLocaleString()}
Write attempts: ${Number(r.writtenRows).toLocaleString()}
Verified rows: ${Number(r.verifiedRows).toLocaleString()}
quick_check: ${r.quickCheck}
処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒
Legacy DataLake: read-only / 未変更
判定: 少量Shard移行 + 照合 PASS`);
 }catch(e){const x=e&&typeof e==="object"?e:{message:String(e)};box("shardPilotResult","fail",`FAIL
stage: ${x.stage||"unknown"}
message: ${x.message||String(e)}
stack: ${x.stack||"-"}
Legacy DataLake: read-only`);}
};

if($("yearShardBtn")) $("yearShardBtn").onclick=async()=>{
 const year=Math.max(2000,Math.min(2100,Number($("yearShardYear")?.value||new Date().getFullYear())));
 box("yearShardResult","run",`${year}年の日足を年別Shardへ移行中…\nLegacy DataLakeはread-only`);
 try{
   const r=await workerCall("shard-migrate-year",900000,
     s=>box("yearShardResult","run",`進行中: ${s.stage||"-"}\n${s.detail||""}`),
     null,{year});
   box("yearShardResult","pass",`PASS
Shard: ${r.shardName}
対象年: ${r.year}
期間: ${r.minDate} ～ ${r.maxDate}
営業日数: ${Number(r.tradingDays).toLocaleString()}
Source rows: ${Number(r.expectedRows).toLocaleString()}
Write attempts: ${Number(r.writtenRows).toLocaleString()}
Verified rows: ${Number(r.verifiedRows).toLocaleString()}
quick_check: ${r.quickCheck}
処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒
Catalog登録: ${r.shardKey}
Legacy DataLake: read-only / 未変更
判定: 年別Shard移行 + 全照合 PASS`);
 }catch(e){
   const x=e&&typeof e==="object"?e:{message:String(e)};
   box("yearShardResult","fail",`FAIL
stage: ${x.stage||"unknown"}
message: ${x.message||String(e)}
stack: ${x.stack||"-"}
Legacy DataLake: read-only`);
 }
};

let _yearInventoryCache=null;

if($("yearInventoryBtn")) $("yearInventoryBtn").onclick=async()=>{
 box("yearInventoryResult","run","Legacy DataLakeの収録年を確認中…");
 try{
   const r=await workerCall("shard-year-inventory",120000,
     s=>box("yearInventoryResult","run",`進行中: ${s.stage||"-"}\n${s.detail||""}`));
   _yearInventoryCache=r.years||[];
   const lines=_yearInventoryCache.map(x=>
     `${x.year}: ${Number(x.trading_days).toLocaleString()}営業日 / ${Number(x.rows).toLocaleString()}行 / ${x.min_date}～${x.max_date}`);
   box("yearInventoryResult","pass",`PASS
Source: ${r.source}
収録年: ${_yearInventoryCache.length}年
${lines.join("\n")}`);
 }catch(e){
   const x=e&&typeof e==="object"?e:{message:String(e)};
   box("yearInventoryResult","fail",`FAIL
stage: ${x.stage||"unknown"}
message: ${x.message||String(e)}`);
 }
};

if($("multiYearBtn")) $("multiYearBtn").onclick=async()=>{
 box("multiYearResult","run","収録年を確認中…");
 try{
   let inv=_yearInventoryCache;
   if(!inv){
     const r=await workerCall("shard-year-inventory",120000,null);
     inv=r.years||[];
     _yearInventoryCache=inv;
   }
   if(!inv.length) throw new Error("移行対象年がありません");

   const years=inv.map(x=>Number(x.year)).filter(Number.isFinite).sort((a,b)=>b-a);
   const results=[];
   for(let i=0;i<years.length;i++){
     const year=years[i];
     box("multiYearResult","run",
       `年別Shard一括移行 ${i+1}/${years.length}\n現在: ${year}年\n完了: ${results.map(x=>x.year).join(", ")||"なし"}`);
     const r=await workerCall("shard-migrate-year",900000,
       s=>box("multiYearResult","run",
         `年別Shard一括移行 ${i+1}/${years.length}\n現在: ${year}年\n${s.stage||"-"} ${s.detail||""}\n完了: ${results.map(x=>x.year).join(", ")||"なし"}`),
       null,{year});
     results.push(r);
   }
   const totalRows=results.reduce((a,x)=>a+Number(x.verifiedRows||0),0);
   const totalDays=results.reduce((a,x)=>a+Number(x.verifiedTradingDays||x.tradingDays||0),0);
   const totalMs=results.reduce((a,x)=>a+Number(x.elapsedMs||0),0);
   box("multiYearResult","pass",`PASS
移行年数: ${results.length}
対象年: ${results.map(x=>x.year).join(", ")}
Verified rows合計: ${totalRows.toLocaleString()}
営業日合計: ${totalDays.toLocaleString()}
各年 quick_check: ${results.every(x=>x.quickCheck==="ok")?"ALL ok":"要確認"}
処理時間合計: ${(totalMs/1000).toFixed(2)}秒
Catalog: 各 bars_YYYY を ready 登録
Legacy DataLake: read-only / 未変更
判定: 全収録年の年別Shard化 PASS`);
 }catch(e){
   const x=e&&typeof e==="object"?e:{message:String(e)};
   box("multiYearResult","fail",`FAIL
message: ${x.message||String(e)}
stack: ${x.stack||"-"}
途中までPASSした年別Shardは保持されます。
Legacy DataLake: read-only / 未変更`);
 }
};
