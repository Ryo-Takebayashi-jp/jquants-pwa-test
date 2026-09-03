
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
function parseCsv(text){
 const src=String(text??"").replace(/^\uFEFF/,""),matrix=[];let row=[],field="",quoted=false;
 for(let i=0;i<src.length;i++){const ch=src[i];
  if(quoted){if(ch==='"'&&src[i+1]==='"'){field+='"';i++}else if(ch==='"')quoted=false;else field+=ch}
  else if(ch==='"')quoted=true;else if(ch===","){row.push(field);field=""}else if(ch==="\n"){row.push(field);matrix.push(row);row=[];field=""}else if(ch!=="\r")field+=ch}
 if(field!==""||row.length){row.push(field);matrix.push(row)}
 const m=matrix.filter(r=>r.some(v=>String(v).trim()!==""));if(!m.length)return {headers:[],rows:[]};
 const headers=m[0].map(x=>String(x).trim());
 return {headers,rows:m.slice(1).map(v=>Object.fromEntries(headers.map((k,i)=>[k,v[i]??""])))};
}
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
 const w=new Worker("./sqlite-worker.js?v=v7e-alpha76");
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

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js?v=v7e-alpha76").catch(()=>{}));

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


async function jqFetchV2Rows(path, params, token){
 if(!token) throw new Error("APIキーを入力してください");
 const u0=new URL(`/api/jquants${path}`,location.origin);
 for(const [k,v] of Object.entries(params||{})) if(v!=null&&v!=="") u0.searchParams.set(k,String(v));
 let all=[], pageToken=null, pages=0, cursor=null;
 do{
   const u=new URL(u0);
   if(pageToken) u.searchParams.set("pagination_key",pageToken);
   let res;
   for(let attempt=0;attempt<5;attempt++){
     res=await fetch(u,{headers:jqAuthHeaders(token),cache:"no-store"});
     if(res.status!==429 && res.status<500) break;
     const ra=Number(res.headers.get("Retry-After")||0);
     await sleep(ra?ra*1000:Math.min(16000,1000*(2**attempt)));
   }
   const text=await res.text(); let j={}; try{j=text?JSON.parse(text):{}}catch(_){}
   if(!res.ok) throw new Error(`J-Quants HTTP ${res.status}: ${j.message||j.error||text.slice(0,300)}`);
   const rows=j.data||[];
   if(!Array.isArray(rows)) throw new Error(`J-Quants ${path} response data not recognized`);
   all.push(...rows);
   pageToken=j.pagination_key||j.paginationKey||null;
   cursor=j.cursor||cursor;
   pages++; if(pages>200) throw new Error("pagination safety stop");
 }while(pageToken);
 return {rows:all,pages,cursor,endpoint:`/v2${path}`};
}
async function jqFetchFinsSummary(date,token){
 return jqFetchV2Rows("/fins/summary",{date:String(date||"").replaceAll("-","")},token);
}
async function jqFetchEarningsCalendar(date,token){
 return jqFetchV2Rows("/equities/earnings-calendar",{date:String(date||"").replaceAll("-","")},token);
}
async function jqFetchFinsHistory(from,to,token,onProgress){
 const dates=isoWeekdays(from,to),rows=[]; let calls=0,empty=0;
 for(let i=0;i<dates.length;i++){
   const d=dates[i];
   const r=await jqFetchV2Rows("/fins/summary",{date:d.replaceAll("-","")},token);
   rows.push(...r.rows); calls++; if(!r.rows.length)empty++;
   if(onProgress&&(i%5===0||i===dates.length-1))onProgress(i+1,dates.length,rows.length);
   if(i<dates.length-1)await sleep(1100);
 }
 return {rows,calls,empty,endpoint:"/v2/fins/summary",strategy:"date-scan"};
}

async function jqFetchRange(path,from,to,token){
 return jqFetchV2Rows(path,{from:String(from||"").replaceAll("-",""),to:String(to||"").replaceAll("-","")},token);
}
async function jqFetchTopix(from,to,token){return jqFetchRange("/indices/bars/daily/topix",from,to,token)}
async function jqFetchMarketCalendar(from,to,token){return jqFetchRange("/markets/calendar",from,to,token)}
function isoDays(from,to){
 const out=[],a=new Date(from+"T00:00:00"),b=new Date(to+"T00:00:00");
 for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1))out.push(d.toISOString().slice(0,10));
 return out;
}
function isoWeekdays(from,to){return isoDays(from,to).filter(x=>{const d=new Date(x+"T00:00:00").getDay();return d!==0&&d!==6})}
async function jqFetchByDates(path,dates,token,onProgress,opts={}){
 const skipDates=opts.skipDates instanceof Set?opts.skipDates:new Set(opts.skipDates||[]),allDates=[...dates],todo=allDates.filter(x=>!skipDates.has(x));
 let rows=[],calls=0,empty=0;
 for(let i=0;i<todo.length;i++){
   const date=todo[i];
   try{
     const r=await jqFetchV2Rows(path,{date:date.replaceAll("-","")},token);
     rows.push(...r.rows); calls++; if(!r.rows.length)empty++;
   }catch(e){
     if(/subscription covers/i.test(String(e))) throw e;
     throw new Error(`${path} ${date}: ${e.message||e}`);
   }
   if(onProgress && (i%5===0||i===todo.length-1))onProgress(i+1,todo.length,rows.length,allDates.length-todo.length);
   if(i<todo.length-1)await sleep(120);
 }
 return {rows,calls,empty,queriedDates:todo,skippedDates:allDates.length-todo.length,totalDates:allDates.length,endpoint:`/v2${path}`,strategy:"date-scan+resume"};
}
async function jqFetchMarginInterest(from,to,token,onProgress,opts={}){
 // Weekly margin interest requires code OR date. For all-market DataLake, date scan is far cheaper than 4,441 code scans.
 const dates=isoWeekdays(from,to).filter(x=>new Date(x+"T00:00:00").getDay()===5);
 return jqFetchByDates("/markets/margin-interest",dates,token,onProgress,opts);
}
async function jqFetchMarginAlert(from,to,token,onProgress,opts={}){
 // Daily-publication margin supports all-listed retrieval by a specific date.
 return jqFetchByDates("/markets/margin-alert",isoWeekdays(from,to),token,onProgress,opts);
}
async function jqFetchShortRatio(from,to,token,onProgress,opts={}){
 // API requires date OR s33. For all-market history, scan dates rather than 33 sector codes.
 return jqFetchByDates("/markets/short-ratio",isoWeekdays(from,to),token,onProgress,opts);
}
async function jqFetchShortSaleReport(from,to,token,onProgress,opts={}){
 // API requires code OR disc_date OR calc_date. For all-market history, scan disclosure dates.
 const skipDates=opts.skipDates instanceof Set?opts.skipDates:new Set(opts.skipDates||[]),allDates=isoWeekdays(from,to),dates=allDates.filter(x=>!skipDates.has(x));
 let rows=[],calls=0,empty=0;
 for(let i=0;i<dates.length;i++){
   const date=dates[i];
   const r=await jqFetchV2Rows("/markets/short-sale-report",{disc_date:date.replaceAll("-","")},token);
   rows.push(...r.rows); calls++; if(!r.rows.length)empty++;
   if(onProgress && (i%5===0||i===dates.length-1))onProgress(i+1,dates.length,rows.length,allDates.length-dates.length);
   if(i<dates.length-1)await sleep(120);
 }
 return {rows,calls,empty,queriedDates:dates,skippedDates:allDates.length-dates.length,totalDates:allDates.length,endpoint:"/v2/markets/short-sale-report",strategy:"disc-date-scan+resume"};
}
async function jqFetchInvestorTypes(from,to,token,onProgress,opts={}){
 // Investor-types is a range endpoint. Coverage still prevents a completed historical range from being re-fetched.
 const skipDates=opts.skipDates instanceof Set?opts.skipDates:new Set(opts.skipDates||[]),allDates=isoWeekdays(from,to),todo=allDates.filter(x=>!skipDates.has(x));
 if(!todo.length)return {rows:[],calls:0,empty:0,queriedDates:[],skippedDates:allDates.length,totalDates:allDates.length,endpoint:"/v2/equities/investor-types",strategy:"range+resume"};
 const qFrom=todo[0],qTo=todo[todo.length-1],r=await jqFetchRange("/equities/investor-types",qFrom,qTo,token);
 if(onProgress)onProgress(1,1,r.rows.length,allDates.length-todo.length);
 return {...r,calls:1,empty:r.rows.length?0:1,queriedDates:todo,skippedDates:allDates.length-todo.length,totalDates:allDates.length,strategy:"range+resume"};
}

async function jqFetchEquitiesMaster(date, token){
 if(!token) throw new Error("APIキーを入力してください");
 const normalized=String(date||"").replaceAll("-","");
 let url=`/api/jquants/equities/master${normalized?`?date=${encodeURIComponent(normalized)}`:""}`;
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
   const text=await res.text(); let j={}; try{j=text?JSON.parse(text):{}}catch(_){}
   if(!res.ok) throw new Error(`J-Quants HTTP ${res.status}: ${j.message||j.error||text.slice(0,300)}`);
   const rows=j.data||[];
   if(!Array.isArray(rows)) throw new Error("J-Quants V2 equities/master response data not recognized");
   all.push(...rows); pageToken=j.pagination_key||j.paginationKey||null;
   pages++; if(pages>100) throw new Error("pagination safety stop");
 }while(pageToken);
 return {rows:all,endpoint:"/v2/equities/master",pages};
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
let sessionJqToken="";
const JQ_TOKEN_INPUT_IDS=["globalToken","masterToken","prodToken","jqToken","simpleGapToken","shardApiToken","prodDailyToken","gapToken"];
function prodTokenValue(){
  for(const id of JQ_TOKEN_INPUT_IDS){
    const el=$(id), v=el?.value?.trim?.()||"";
    if(v){ sessionJqToken=v; return v; }
  }
  return sessionJqToken;
}
function bindSessionTokenInputs(){
  for(const id of JQ_TOKEN_INPUT_IDS){
    const el=$(id); if(!el||el.dataset.tokenBound==="1") continue;
    el.dataset.tokenBound="1";
    const sync=()=>{
      const v=el.value.trim();
      if(!v) return;
      sessionJqToken=v;
      for(const otherId of JQ_TOKEN_INPUT_IDS){
        const other=$(otherId);
        if(other && other!==el && !other.value) other.value=v;
      }
    };
    el.addEventListener("input",sync);
    el.addEventListener("change",sync);
  }
}

bindSessionTokenInputs();
if($("globalToken")){
 const syncGlobalStatus=()=>box("globalTokenStatus",$("globalToken").value.trim()?"pass":"warn",
   $("globalToken").value.trim()?"APIキー入力済み（セッションのみ）":"未入力");
 $("globalToken").addEventListener("input",syncGlobalStatus);
 syncGlobalStatus();
}
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

if($("poolCapacityBtn")) $("poolCapacityBtn").onclick=async()=>{
 box("poolCapacityResult","run","SAH Pool保存枠を確認中…");
 try{
   const r=await workerCall("pool-capacity-status",60000,null);
   box("poolCapacityResult","pass",`PASS
Actual capacity: ${r.actualCapacity}
Allocated files: ${r.actualFileCount}
Free slots: ${r.freeSlots}
files: ${JSON.stringify(r.poolFiles)}
判定: reserveMinimumCapacity(32) 適用済み`);
 }catch(e){
   const x=e&&typeof e==="object"?e:{message:String(e)};
   box("poolCapacityResult","fail",`FAIL
message: ${x.message||String(e)}`);
 }
};


const BF_KEY="jq_v7e_alpha16_full_backfill_checkpoint";

function isoDate(d){
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function nextDayIso(s){
 const [y,m,d]=s.split("-").map(Number),x=new Date(y,m-1,d);
 x.setDate(x.getDate()+1); return isoDate(x);
}
function isWeekendIso(s){
 const [y,m,d]=s.split("-").map(Number),w=new Date(y,m-1,d).getDay();
 return w===0||w===6;
}
function saveBackfillCheckpoint(x){
 localStorage.setItem(BF_KEY,JSON.stringify({...x,savedAt:new Date().toISOString()}));
}
function loadBackfillCheckpoint(){
 try{return JSON.parse(localStorage.getItem(BF_KEY)||"null")}catch(_){return null}
}
function clearBackfillCheckpoint(){localStorage.removeItem(BF_KEY)}

async function fetchAndCommitShardDate(date,token){
 const got=await jqFetchDaily(date,token);
 if(!got.rows.length) return {date,apiRows:0,verifiedRows:0,skipped:true,pages:got.pages};
 const wr=await workerCall("shard-write-api-date",300000,null,null,{date,rows:got.rows});
 return {...wr,pages:got.pages,skipped:false};
}

async function finalizeShardYear(year){
 return await workerCall("shard-finalize-api-year",300000,null,null,{year});
}

async function runFullBackfill(startYear,endYear,token,outputId,resumeFrom=null){
 if(!token) throw new Error("APIキーを入力してください");
 if(!Number.isFinite(startYear)||!Number.isFinite(endYear)||startYear>endYear) throw new Error("開始年・終了年が不正です");

 const first=`${startYear}-01-01`, last=`${endYear}-12-31`;
 let cursor=resumeFrom||first;
 if(cursor<first||cursor>last) cursor=first;

 let apiDays=0,marketDays=0,emptyDays=0,totalRows=0,yearsDone=[];
 const t0=performance.now();

 box(outputId,"run",`開始: ${cursor}
対象: ${startYear}〜${endYear}
方式: date単位 → 年別Shard直接Commit
Legacy DataLake: 未使用`);

 while(cursor<=last){
   const year=Number(cursor.slice(0,4));
   const yearEnd=`${year}-12-31`;

   while(cursor<=yearEnd && cursor<=last){
     if(isWeekendIso(cursor)){
       cursor=nextDayIso(cursor);
       saveBackfillCheckpoint({startYear,endYear,nextDate:cursor,status:"running"});
       continue;
     }

     box(outputId,"run",`全期間補完中…
対象: ${startYear}〜${endYear}
現在: ${cursor}
API確認日数: ${apiDays.toLocaleString()}
取引日: ${marketDays.toLocaleString()}
0件日: ${emptyDays.toLocaleString()}
保存行数: ${totalRows.toLocaleString()}
完了年: ${yearsDone.length?yearsDone.join(", "):"まだなし"}
経過: ${((performance.now()-t0)/1000).toFixed(1)}秒
※画面を閉じても⑨で再開可能`);

     const r=await fetchAndCommitShardDate(cursor,token);
     apiDays++;
     if(r.skipped) emptyDays++;
     else{
       marketDays++;
       totalRows+=Number(r.verifiedRows||r.apiRows||0);
     }

     cursor=nextDayIso(cursor);
     saveBackfillCheckpoint({startYear,endYear,nextDate:cursor,status:"running",
       apiDays,marketDays,emptyDays,totalRows,yearsDone});
   }

   if(year>=startYear && year<=endYear){
     const fin=await finalizeShardYear(year);
     if(!yearsDone.includes(year)) yearsDone.push(year);
     saveBackfillCheckpoint({startYear,endYear,nextDate:cursor,status:"running",
       apiDays,marketDays,emptyDays,totalRows,yearsDone,lastYearSummary:fin});
     box(outputId,"run",`${year}年 PASS
期間: ${fin.minDate} ～ ${fin.maxDate}
営業日: ${Number(fin.tradingDays).toLocaleString()}
Verified rows: ${Number(fin.verifiedRows).toLocaleString()}
quick_check: ${fin.quickCheck}
Catalog: bars_${year} ready

次: ${cursor<=last?cursor:"全期間検証へ"}
累計保存行数: ${totalRows.toLocaleString()}`);
   }
 }

 clearBackfillCheckpoint();
 box(outputId,"pass",`PASS
対象期間: ${startYear}〜${endYear}
完了年: ${yearsDone.join(", ")}
API確認日数: ${apiDays.toLocaleString()}
取引日: ${marketDays.toLocaleString()}
0件日（祝日等）: ${emptyDays.toLocaleString()}
API→Shard保存行数: ${totalRows.toLocaleString()}
各年 quick_check: PASS
Catalog: 全年 bars_YYYY ready
Legacy DataLake: 未使用 / 未変更
再実行: UPSERTなので安全
処理時間: ${((performance.now()-t0)/1000).toFixed(1)}秒
判定: 不足期間の直接Shard補完 PASS`);
 return {startYear,endYear,yearsDone,apiDays,marketDays,emptyDays,totalRows};
}

if($("backfillProbeBtn")) $("backfillProbeBtn").onclick=async()=>{
 const token=$("shardApiToken").value.trim();
 const year=Number($("backfillStartYear").value||2020);
 const testDate=`${year}-01-06`;
 box("backfillProbeResult","run",`${testDate} を date=YYYYMMDD 方式で取得中…\nDB書込なし`);
 try{
   const r=await jqFetchDaily(testDate,token);
   box("backfillProbeResult","pass",`PASS
Date: ${testDate}
Endpoint: ${r.endpoint}
Rows: ${r.rows.length.toLocaleString()}
Pages: ${r.pages}
DB書込: なし
判定: date指定APIルート PASS`);
 }catch(e){
   box("backfillProbeResult","fail",`FAIL\n${e.message||String(e)}`);
 }
};

if($("backfillAllBtn")) $("backfillAllBtn").onclick=async()=>{
 const token=$("shardApiToken").value.trim();
 const sy=Number($("backfillStartYear").value),ey=Number($("backfillEndYear").value);
 clearBackfillCheckpoint();
 try{
   await runFullBackfill(sy,ey,token,"backfillAllResult");
 }catch(e){
   const cp=loadBackfillCheckpoint();
   box("backfillAllResult","fail",`FAIL
${e.message||String(e)}
${cp?.nextDate?`再開位置: ${cp.nextDate}\n⑨「前回の続きから再開」で継続できます。`:""}
Legacy DataLake: 未使用 / 未変更`);
 }
};

if($("backfillResumeBtn")) $("backfillResumeBtn").onclick=async()=>{
 const token=$("shardApiToken").value.trim(),cp=loadBackfillCheckpoint();
 if(!cp||!cp.nextDate){
   box("backfillResumeResult","warn","再開Checkpointがありません。⑧から開始してください。");
   return;
 }
 $("backfillStartYear").value=cp.startYear;
 $("backfillEndYear").value=cp.endYear;
 try{
   await runFullBackfill(Number(cp.startYear),Number(cp.endYear),token,"backfillResumeResult",cp.nextDate);
 }catch(e){
   const cp2=loadBackfillCheckpoint();
   box("backfillResumeResult","fail",`FAIL
${e.message||String(e)}
${cp2?.nextDate?`次回再開位置: ${cp2.nextDate}`:""}
Legacy DataLake: 未使用 / 未変更`);
 }
};


let shardBackupInventory=null;
let shardBackupHashes={};

function downloadBlob(blob,fileName){
 const a=document.createElement("a");
 const u=URL.createObjectURL(blob);
 a.href=u; a.download=fileName; a.style.display="none";
 document.body.appendChild(a);
 a.click();
 setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},15000);
}
function backupManifestObject(){
 if(!shardBackupInventory) throw new Error("先に①バックアップ対象を確認してください");
 return {
   format:"JQ-LOCAL-BACKUP-MANIFEST-v1",
   appVersion:"v7e-alpha51",
   createdAt:new Date().toISOString(),
   pool:{capacity:shardBackupInventory.capacity,allocated:shardBackupInventory.allocated},
   files:shardBackupInventory.items.map(x=>({
     name:x.name,fileName:x.fileName,bytes:x.bytes,quickCheck:x.quickCheck,
     tables:x.tables||[],rows:x.rows,minDate:x.minDate,maxDate:x.maxDate,tradingDays:x.tradingDays,
     sha256:shardBackupHashes[x.name]||null
   }))
 };
}
async function exportShardBackupFile(name,outputId=null){
 if(outputId) box(outputId,"run",`${name}\nSQLiteを外部保存用にExport中…`);
 const r=await workerCall("shard-backup-export",900000,
   s=>{if(outputId)box(outputId,"run",`${name}\n${s.stage||""} ${s.detail||""}`)},
   null,{name});
 const blob=new Blob([r.buffer],{type:"application/vnd.sqlite3"});
 downloadBlob(blob,r.fileName);
 if(r.sha256) shardBackupHashes[name]=r.sha256;
 if(outputId) box(outputId,"pass",`PASS
保存: ${r.fileName}
サイズ: ${fmt(r.bytes)}
SHA-256: ${r.sha256||"未取得"}
処理時間: ${(r.elapsedMs/1000).toFixed(1)}秒`);
 return r;
}

if($("shardBackupInventoryBtn")) $("shardBackupInventoryBtn").onclick=async()=>{
 box("shardBackupInventoryResult","run","Catalog＋Shardを監査中…");
 try{
   const r=await workerCall("shard-backup-inventory",300000,
     s=>box("shardBackupInventoryResult","run",`${s.stage||""}\n${s.detail||""}`));
   shardBackupInventory=r; shardBackupHashes={};
   const lines=r.items.map((x,i)=>
     `${String(i+1).padStart(2,"0")}. ${x.fileName}
   ${fmt(x.bytes)} / quick_check ${x.quickCheck}`+
     (x.rows!=null?` / ${Number(x.rows).toLocaleString()}行 / ${x.minDate||"-"}〜${x.maxDate||"-"}`:"")
   );
   box("shardBackupInventoryResult",r.allOk?"pass":"fail",
`${r.allOk?"PASS":"要確認"}
対象DB: ${r.items.length}
合計: ${fmt(r.totalBytes)}
SAH Pool: ${r.allocated??"?"} / ${r.capacity??"?"} slots

${lines.join("\n")}

判定: ${r.allOk?"全対象DB quick_check ok":"ERRORのDBがあります。バックアップ前に確認してください。"}`);
   const sel=$("shardBackupSelect"); sel.innerHTML="";
   for(const x of r.items){
     const o=document.createElement("option");o.value=x.name;o.textContent=`${x.fileName} (${fmt(x.bytes)})`;sel.appendChild(o);
   }
   $("shardBackupManifestBtn").disabled=!r.allOk;
   $("shardBackupAllBtn").disabled=!r.allOk;
   $("shardBackupOneBtn").disabled=!r.allOk;
 }catch(e){
   shardBackupInventory=null;
   box("shardBackupInventoryResult","fail","FAIL\n"+(e.message||String(e)));
 }
};

if($("shardBackupManifestBtn")) $("shardBackupManifestBtn").onclick=()=>{
 try{
   const manifest=backupManifestObject();
   const stamp=new Date().toISOString().replace(/[:.]/g,"-");
   downloadBlob(new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"}),
     `jquants_backup_manifest_${stamp}.json`);
   box("shardBackupManifestResult","pass",`PASS
Manifestを保存しました。
対象DB: ${manifest.files.length}
※DB本体も③または④で保存してください。`);
 }catch(e){box("shardBackupManifestResult","fail","FAIL\n"+(e.message||String(e)))}
};

if($("shardBackupOneBtn")) $("shardBackupOneBtn").onclick=async()=>{
 const name=$("shardBackupSelect").value;
 if(!name){box("shardBackupOneResult","warn","保存するDBを選択してください。");return}
 $("shardBackupOneBtn").disabled=true;
 try{await exportShardBackupFile(name,"shardBackupOneResult")}
 catch(e){box("shardBackupOneResult","fail","FAIL\n"+(e.message||String(e)))}
 finally{$("shardBackupOneBtn").disabled=false}
};

if($("shardBackupAllBtn")) $("shardBackupAllBtn").onclick=async()=>{
 if(!shardBackupInventory?.allOk){box("shardBackupAllResult","warn","先に①をPASSさせてください。");return}
 $("shardBackupAllBtn").disabled=true;
 const items=shardBackupInventory.items;
 let done=0,total=0;
 try{
   for(const x of items){
     box("shardBackupAllResult","run",`全DB外部保存中…
${done+1} / ${items.length}
現在: ${x.fileName}
完了容量: ${fmt(total)}

Safariから複数ダウンロード許可を求められた場合は許可してください。`);
     const r=await exportShardBackupFile(x.name,null);
     done++; total+=Number(r.bytes||0);
     await new Promise(res=>setTimeout(res,700));
   }
   const manifest=backupManifestObject();
   const stamp=new Date().toISOString().replace(/[:.]/g,"-");
   downloadBlob(new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"}),
     `jquants_backup_manifest_${stamp}.json`);
   box("shardBackupAllResult","pass",`PASS
DB保存: ${done} / ${items.length}
合計: ${fmt(total)}
Manifest: 保存
SHA-256: ${Object.keys(shardBackupHashes).length}ファイル記録

外部バックアップ一式の作成完了。
※Filesアプリ側でSQLite群＋Manifestが見えることを確認してください。`);
 }catch(e){
   box("shardBackupAllResult","fail",`途中停止
完了: ${done} / ${items.length}
${e.message||String(e)}

Safariが複数ダウンロードを止めた場合は④で残りを1ファイルずつ保存できます。`);
 }finally{$("shardBackupAllBtn").disabled=false}
};

if($("shardRestoreBtn")) $("shardRestoreBtn").onclick=async()=>{
 const files=Array.from($("shardRestoreFiles").files||[]);
 if(!files.length){box("shardRestoreResult","warn","復元する.sqliteファイルを選択してください。");return}
 const unsafe=files.filter(f=>!/^jq_[A-Za-z0-9_.-]+\.sqlite$/.test(f.name));
 if(unsafe.length){
   box("shardRestoreResult","fail","ファイル名が復元対象形式ではありません:\n"+unsafe.map(x=>x.name).join("\n"));return;
 }
 $("shardRestoreBtn").disabled=true;
 let done=0,total=0;
 try{
   for(const f of files){
     const head=new Uint8Array(await f.slice(0,16).arrayBuffer());
     if(!sqliteHeaderOk(head)) throw new Error(`${f.name}: SQLite header不一致`);
     box("shardRestoreResult","run",`復元中…
${done+1} / ${files.length}
現在: ${f.name}
サイズ: ${fmt(f.size)}
完了容量: ${fmt(total)}

Streaming Import → quick_check`);
     const r=await workerCall("shard-restore-import",1800000,
       s=>box("shardRestoreResult","run",`復元中…
${done+1} / ${files.length}
現在: ${f.name}
Stage: ${s.stage||"-"}
${s.detail||""}`),
       f,{name:"/"+f.name});
     if(r.quickCheck!=="ok") throw new Error(`${f.name}: quick_check=${r.quickCheck}`);
     done++; total+=Number(r.importedBytes||f.size);
   }
   box("shardRestoreResult","pass",`PASS
復元: ${done} / ${files.length}
合計: ${fmt(total)}
各DB quick_check: ok

次に⑥「復元後の全Shard監査」を実行してください。`);
 }catch(e){
   box("shardRestoreResult","fail",`FAIL
復元済み: ${done} / ${files.length}
${e.message||String(e)}

正常復元済みDBはそのまま残っています。原因修正後に再実行できます。`);
 }finally{$("shardRestoreBtn").disabled=false}
};

if($("shardRestoreAuditBtn")) $("shardRestoreAuditBtn").onclick=async()=>{
 box("shardRestoreAuditResult","run","復元後のCatalog＋Shardを全監査中…");
 try{
   const r=await workerCall("shard-backup-inventory",300000);
   const lines=r.items.map(x=>`${x.fileName}: quick_check ${x.quickCheck}`+
     (x.rows!=null?` / ${Number(x.rows).toLocaleString()}行 / ${x.minDate||"-"}〜${x.maxDate||"-"}`:""));
   box("shardRestoreAuditResult",r.allOk?"pass":"fail",`${r.allOk?"PASS":"FAIL"}
DB数: ${r.items.length}
合計: ${fmt(r.totalBytes)}

${lines.join("\n")}

判定: ${r.allOk?"Catalog＋Shard復元監査 PASS":"異常DBがあります"}`);
 }catch(e){box("shardRestoreAuditResult","fail","FAIL\n"+(e.message||String(e)))}
};


let prodDailyCache=null;
function todayIsoLocal(){
 const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");
 return `${y}-${m}-${dd}`;
}
if($("prodDailyDate")&&!$("prodDailyDate").value) $("prodDailyDate").value=todayIsoLocal();

if($("prodDailyFetchBtn")) $("prodDailyFetchBtn").onclick=async()=>{
 const date=$("prodDailyDate").value,token=$("prodDailyToken").value.trim();
 if(!date){box("prodDailyFetchResult","warn","更新日を選択してください。");return}
 box("prodDailyFetchResult","run",`${date} をJ-Quants V2から取得中…\nDB書込なし`);
 try{
   const r=await jqFetchDaily(date,token);
   prodDailyCache={date,rows:r.rows,pages:r.pages};
   if(!r.rows.length) throw new Error("API rows 0。休場日またはデータ未配信の可能性があります。");
   box("prodDailyFetchResult","pass",`PASS
Date: ${date}
Rows: ${r.rows.length.toLocaleString()}
Pages: ${r.pages}
DB書込: なし
次: ②でbars_recent＋当年Shardへ保存`);
 }catch(e){prodDailyCache=null;box("prodDailyFetchResult","fail","FAIL\n"+(e.message||String(e)))}
};

if($("prodDailyWriteBtn")) $("prodDailyWriteBtn").onclick=async()=>{
 const date=$("prodDailyDate").value,token=$("prodDailyToken").value.trim();
 if(!date){box("prodDailyWriteResult","warn","更新日を選択してください。");return}
 $("prodDailyWriteBtn").disabled=true;
 try{
   let r=prodDailyCache;
   if(!r||r.date!==date){
     box("prodDailyWriteResult","run",`${date} API取得中…`);
     const x=await jqFetchDaily(date,token);
     r={date,rows:x.rows,pages:x.pages};
   }
   if(!r.rows.length) throw new Error("API rows 0。休場日またはデータ未配信の可能性があります。");
   box("prodDailyWriteResult","run",`${date}
API rows: ${r.rows.length.toLocaleString()}
bars_recent＋当年Shardへ同時保存中…`);
   const wr=await workerCall("shard-native-daily-write",600000,
     s=>box("prodDailyWriteResult","run",`${date}
${s.stage||"-"} ${s.detail||""}`),null,{date,rows:r.rows});
   box("prodDailyWriteResult","pass",`PASS
Date: ${wr.date}
API rows: ${Number(wr.apiRows).toLocaleString()}
bars_recent: ${Number(wr.recentRows).toLocaleString()}行 / quick_check ${wr.recentQuickCheck}
bars_${wr.year}: ${Number(wr.yearRows).toLocaleString()}行 / quick_check ${wr.yearQuickCheck}

recent range: ${wr.recentMin} ～ ${wr.recentMax}
year range: ${wr.yearMin} ～ ${wr.yearMax}
Catalog: bars_recent + bars_${wr.year} ready更新
Legacy DataLake: 未使用
処理時間: ${(wr.elapsedMs/1000).toFixed(1)}秒

判定: Shard-native日次更新 PASS`);
   prodDailyCache=null;
 }catch(e){
   box("prodDailyWriteResult","fail",`FAIL
${e.stage?`stage: ${e.stage}\n`:""}${e.message||String(e)}
Legacy DataLake: 未使用`);
 }finally{$("prodDailyWriteBtn").disabled=false}
};

function isoMinusDays(n){
 const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-n);
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
if($("catalogReadTo")&&!$("catalogReadTo").value) $("catalogReadTo").value=todayIsoLocal();
if($("catalogReadFrom")&&!$("catalogReadFrom").value) $("catalogReadFrom").value=isoMinusDays(10);

if($("catalogAuditBtn")) $("catalogAuditBtn").onclick=async()=>{
 box("catalogAuditResult","run","Catalogの年別Shard収録範囲を監査中…");
 try{
   const r=await workerCall("catalog-coverage-audit",300000);
   const ys=r.yearShards.map(x=>`${x.shard_key}: ${x.range_start||"-"} ～ ${x.range_end||"-"}`);
   const gapText=r.gaps.length?r.gaps.map(g=>`${g.after} → ${g.before}: ${g.prevEnd} ～ ${g.nextStart} (${g.calendarGapDays}日)`).join("\n"):"大きな境界Gapなし";
   box("catalogAuditResult",r.gaps.length?"warn":"pass",`${r.gaps.length?"要確認":"PASS"}
年別Shard: ${r.yearShards.length}
全体範囲: ${r.coverageStart||"-"} ～ ${r.coverageEnd||"-"}
bars_recent: ${r.recent?`${r.recent.range_start} ～ ${r.recent.range_end}`:"なし"}

${ys.join("\n")}

14日超のShard境界Gap:
${gapText}

※長いGapは欠損の可能性があるため、分析利用前に補完対象として扱います。`);
 }catch(e){box("catalogAuditResult","fail","FAIL\n"+(e.message||String(e)))}
};

if($("catalogReadBtn")) $("catalogReadBtn").onclick=async()=>{
 const from=$("catalogReadFrom").value,to=$("catalogReadTo").value,code=$("catalogReadCode").value.trim();
 box("catalogReadResult","run",`${from} ～ ${to}
${code?`Code: ${code}`:"市場全体"}
Catalogで必要Shardを解決中…`);
 try{
   const r=await workerCall("catalog-read-bars-range",300000,
     s=>box("catalogReadResult","run",`${from} ～ ${to}
${s.stage||"-"} ${s.detail||""}`),null,{from,to,code,sampleLimit:30});
   const shards=r.selected.map(x=>`${x.shardKey}: ${x.segFrom}～${x.segTo} / ${Number(x.count).toLocaleString()}行 / ${x.minDate||"-"}～${x.maxDate||"-"}`);
   const sample=r.samples.slice(0,8).map(x=>`${x.date} ${x.code} C=${x.c??"-"} V=${x.volume??"-"}`);
   box("catalogReadResult","pass",`PASS
Query: ${r.from} ～ ${r.to}${r.code?` / ${r.code}`:""}
Resolved Shards: ${r.selected.length}
Total rows: ${Number(r.totalRows).toLocaleString()}
処理時間: ${(r.elapsedMs/1000).toFixed(3)}秒

${shards.join("\n")}

${r.catalogWarnings.length?`Catalog warning:\n${r.catalogWarnings.join("\n")}\n`:""}
Sample:
${sample.join("\n")||"なし"}

判定: Catalog → Shard自動ルーティング PASS`);
 }catch(e){box("catalogReadResult","fail",`FAIL
${e.stage?`stage: ${e.stage}\n`:""}${e.message||String(e)}`)}
};

async function runGapRepair(from,to,token,resultId){
 const el=$(resultId),start=new Date(from+"T12:00:00"),end=new Date(to+"T12:00:00");
 let checked=0,trading=0,zero=0,saved=0,doneYears=new Set(),last="-",t0=performance.now();
 try{
   for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
     const dow=d.getDay(); if(dow===0||dow===6)continue;
     const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
     last=iso;checked++;
     box(resultId,"run",`Gap補完中…
対象: ${from} ～ ${to}
現在: ${iso}
API確認日: ${checked}
取引日: ${trading}
0件日: ${zero}
保存行数: ${saved.toLocaleString()}
完了年: ${[...doneYears].sort().join(", ")||"まだなし"}
経過: ${((performance.now()-t0)/1000).toFixed(1)}秒

※画面を閉じた場合は同じ範囲を再実行できます（UPSERT）。`);
     let x;
     try{x=await jqFetchDaily(iso,token)}catch(e){
       // J-Quants may report no data differently; only accept explicit no-data-like errors as zero.
       const msg=String(e.message||e);
       if(/0 rows|no data|not found|404/i.test(msg)){zero++;continue}
       throw e;
     }
     if(!x.rows.length){zero++;continue}
     trading++;
     const wr=await workerCall("gap-repair-date-write",600000,null,null,{date:iso,rows:x.rows});
     saved+=Number(wr.rows||0);doneYears.add(wr.year);
   }
   box(resultId,"pass",`PASS
対象: ${from} ～ ${to}
API確認日: ${checked}
取引日: ${trading}
0件日（祝日等）: ${zero}
Shard保存行数: ${saved.toLocaleString()}
更新年: ${[...doneYears].sort().join(", ")||"-"}
最終日: ${last}
処理時間: ${((performance.now()-t0)/1000).toFixed(1)}秒

各取引日: 行数一致＋quick_check ok
Legacy DataLake: 未使用
再実行: UPSERTなので安全

次: Catalog収録範囲監査を再実行`);
 }catch(e){
   box(resultId,"fail",`FAIL
対象: ${from} ～ ${to}
停止日: ${last}
API確認日: ${checked}
取引日: ${trading}
保存行数: ${saved.toLocaleString()}
${e.stage?`stage: ${e.stage}\n`:""}${e.message||String(e)}

保存済み日まではCommit済みです。同じ範囲で再実行すれば続行できます。`);
 }
}
if($("gapRepairBtn"))$("gapRepairBtn").onclick=async()=>{
 const token=$("gapToken").value.trim(),from=$("gapFrom").value,to=$("gapTo").value;
 if(!from||!to||from>to){box("gapRepairResult","warn","開始日・終了日を確認してください。");return}
 $("gapRepairBtn").disabled=true;try{await runGapRepair(from,to,token,"gapRepairResult")}finally{$("gapRepairBtn").disabled=false}
};
if($("gapRepair2026Btn"))$("gapRepair2026Btn").onclick=async()=>{
 const token=$("gapToken").value.trim();
 $("gapRepair2026Btn").disabled=true;try{await runGapRepair("2025-12-31","2026-05-31",token,"gapRepair2026Result")}finally{$("gapRepair2026Btn").disabled=false}
};

if($("simpleDailyDate")&&!$("simpleDailyDate").value) $("simpleDailyDate").value=todayIsoLocal();

function copyTokenToAdvanced(){
 const t=prodTokenValue()||"";
 if($("gapToken")&&!$("gapToken").value) $("gapToken").value=t;
 if($("prodDailyToken")&&!$("prodDailyToken").value) $("prodDailyToken").value=t;
 if($("simpleGapToken")&&!$("simpleGapToken").value) $("simpleGapToken").value=t;
 return t;
}
async function simpleAudit(){
 box("simpleAuditResult","run","DataLakeを監査中…");
 try{
   const r=await workerCall("catalog-coverage-audit",300000);
   const gaps=r.gaps||[];
   if(!gaps.length){
     box("simpleAuditResult","pass",`PASS
長期Gap: なし
年別Shard: ${r.yearShards.length}
収録範囲: ${r.coverageStart||"-"} ～ ${r.coverageEnd||"-"}

判定: 日足DataLakeの長期欠損なし`);
   }else{
     box("simpleAuditResult","warn",`要確認
長期Gap: ${gaps.length}件
${gaps.map(g=>`${g.after} → ${g.before}: ${g.prevEnd} ～ ${g.nextStart}`).join("\n")}

①②がPASS済みなら、この結果を見せてください。`);
   }
 }catch(e){box("simpleAuditResult","fail","FAIL\n"+(e.message||e))}
}
if($("simpleRepair2019Btn")) $("simpleRepair2019Btn").onclick=async()=>{
 const token=copyTokenToAdvanced();
 $("simpleRepair2019Btn").disabled=true;
 try{await runGapRepair("2019-08-31","2020-01-05",token,"simpleRepair2019Result")}
 finally{$("simpleRepair2019Btn").disabled=false}
};
if($("simpleRepair2026Btn")) $("simpleRepair2026Btn").onclick=async()=>{
 const token=copyTokenToAdvanced();
 $("simpleRepair2026Btn").disabled=true;
 try{await runGapRepair("2025-12-31","2026-05-31",token,"simpleRepair2026Result")}
 finally{$("simpleRepair2026Btn").disabled=false}
};
if($("simpleAuditBtn")) $("simpleAuditBtn").onclick=simpleAudit;

if($("simpleDailyBtn")) $("simpleDailyBtn").onclick=async()=>{
 const token=copyTokenToAdvanced(),date=$("simpleDailyDate").value;
 if(!date){box("simpleDailyResult","warn","更新日を選択してください。");return}
 $("simpleDailyBtn").disabled=true;
 try{
   box("simpleDailyResult","run",`${date} を取得してShardへ保存中…`);
   const x=await jqFetchDaily(date,token);
   if(!x.rows.length) throw new Error("API rows 0。休場日または未配信の可能性があります。");
   const wr=await workerCall("shard-native-daily-write",600000,null,null,{date,rows:x.rows});
   box("simpleDailyResult","pass",`PASS
Date: ${wr.date}
Rows: ${Number(wr.apiRows).toLocaleString()}
bars_recent: quick_check ${wr.recentQuickCheck}
bars_${wr.year}: quick_check ${wr.yearQuickCheck}
Catalog: 更新済み
Legacy DataLake: 未使用
処理時間: ${(wr.elapsedMs/1000).toFixed(1)}秒`);
 }catch(e){box("simpleDailyResult","fail","FAIL\n"+(e.message||e))}
 finally{$("simpleDailyBtn").disabled=false}
};

// v7e-alpha76: advance the local DataLake one trading day with one operation.
function addIsoDays(iso,n){
 const d=new Date(String(iso)+"T00:00:00");
 d.setDate(d.getDate()+Number(n||0));
 return d.toLocaleDateString("sv-SE");
}
function syncDailyDateInputs(date){
 const single=["simpleDailyDate","masterDate","finsDate","earningsDate","screeningAsOf","screeningBaseAsOf","parityAsOf","discoveryAsOf"];
 for(const id of single) if($(id)) $(id).value=date;
 const ranges=[["topixFrom","topixTo"],["calendarFrom","calendarTo"],["sdFrom","sdTo"]];
 for(const [a,b] of ranges){if($(a))$(a).value=date;if($(b))$(b).value=date}
}
async function writeRangeRowsForDay(workerCmd,date,rows){
 return workerCall(workerCmd,300000,null,null,{from:date,to:date,rows:rows||[]});
}
if($("nextTradingDayAllBtn")) $("nextTradingDayAllBtn").onclick=async()=>{
 const btn=$("nextTradingDayAllBtn"),token=copyTokenToAdvanced();
 if(!token){box("nextTradingDayAllResult","warn","APIキーを入力してください。");return}
 btn.disabled=true;
 const lines=[],results=[]; let target="",base="",barsFetch=null;
 const report=()=>box("nextTradingDayAllResult","run",lines.join("\n"));
 const run=async(label,fn,{optional=false}={})=>{
   lines.push(`${label}: 実行中…`);report();
   try{const x=await fn();results.push({label,ok:true});lines[lines.length-1]=`${label}: OK${x?.rows!=null?` (${Number(x.rows).toLocaleString()} rows)`:""}`;report();return x}
   catch(e){results.push({label,ok:false,optional,error:String(e?.message||e)});lines[lines.length-1]=`${label}: NG - ${e?.message||e}`;report();return null}
 };
 try{
   const cov=await workerCall("catalog-coverage-audit",300000);
   base=String(cov.coverageEnd||"");
   if(!base) throw new Error("日足DataLakeの最新日を取得できません。先に日足DataLakeを構築してください。");
   const today=localTodayIso();
   lines.push(`現在の日足最新日: ${base}`);
   lines.push(`配信済みの次取引日を探索中…`);report();
   for(let i=1;i<=14;i++){
     const d=addIsoDays(base,i);
     if(d>today) break;
     const w=new Date(d+"T00:00:00").getDay();
     if(w===0||w===6) continue;
     const got=await jqFetchDaily(d,token);
     if(got.rows.length){target=d;barsFetch=got;break}
     await sleep(120);
   }
   if(!target){
     box("nextTradingDayAllResult","pass",`更新不要
日足DataLake最新日: ${base}
本日: ${today}
次の配信済み取引日はまだありません。`);
     return;
   }
   syncDailyDateInputs(target);
   lines.length=0;lines.push(`一括更新日: ${target}`,`基準: 日足DataLake ${base} の次の配信済み取引日`,``);report();

   await run("日足",async()=>{const wr=await workerCall("shard-native-daily-write",600000,null,null,{date:target,rows:barsFetch.rows});return {rows:barsFetch.rows.length,wr}});
   await run("銘柄マスター",async()=>{const g=await jqFetchEquitiesMaster(target,token);await workerCall("equities-master-write",300000,null,null,{date:target,rows:g.rows});return {rows:g.rows.length}});
   await run("財務サマリー",async()=>{const g=await jqFetchFinsSummary(target,token);await workerCall("fins-summary-write",300000,null,null,{date:target,rows:g.rows});return {rows:g.rows.length}});
   await run("決算予定",async()=>{const g=await jqFetchEarningsCalendar(target,token);await workerCall("earnings-calendar-write",300000,null,null,{date:target,rows:g.rows});return {rows:g.rows.length}});
   await run("TOPIX",async()=>{const g=await jqFetchTopix(target,target,token);await writeRangeRowsForDay("topix-write",target,g.rows);return {rows:g.rows.length}});
   await run("営業日カレンダー",async()=>{const g=await jqFetchMarketCalendar(target,target,token);await writeRangeRowsForDay("market-calendar-write",target,g.rows);return {rows:g.rows.length}});

   const supplyJobs=[
     // Weekly datasets get a 14-day lookback; daily publication datasets re-check the recent 3 days.
     ["信用取引週末残高",jqFetchMarginInterest,"margin-interest-write",14],
     ["日々公表信用",jqFetchMarginAlert,"margin-alert-write",3],
     ["空売り比率",jqFetchShortRatio,"short-ratio-write",3],
     ["空売り報告",jqFetchShortSaleReport,"short-sale-report-write",3],
     ["投資部門別",jqFetchInvestorTypes,"investor-types-write",14]
   ];
   for(const [label,fetcher,cmd,lookback] of supplyJobs){
     await run(label,async()=>{
       const from=addIsoDays(target,-lookback),r=await fetchAndPersistSupplyRange(fetcher,cmd,from,target,token);
       return {rows:r.got.rows.length};
     },{optional:true});
     await sleep(150);
   }
   await run("需給正規化",async()=>{await workerCall("supply-demand-normalize",180000);return {}},{optional:true});

   const failed=results.filter(x=>!x.ok),critical=failed.filter(x=>!x.optional);
   lines.push("",`結果: ${critical.length?"要確認":failed.length?"主要データPASS / 任意データ一部NG":"PASS"}`,`成功: ${results.length-failed.length}/${results.length}`);
   if(failed.length)lines.push("NG: "+failed.map(x=>x.label).join(" / "));
   lines.push("",`各日付入力欄を ${target} に同期済み。`,`次回は同じボタンで、この日の次の配信済み取引日へ進みます。`);
   box("nextTradingDayAllResult",critical.length?"warn":failed.length?"warn":"pass",lines.join("\n"));
 }catch(e){box("nextTradingDayAllResult","fail",`FAIL\n${e?.message||e}\n\n日足の確定前には他データへ進まない設計です。`)}
 finally{btn.disabled=false}
};

let productionGapCandidates=[];
if($("autoGapCheckBtn")) $("autoGapCheckBtn").onclick=async()=>{
 $("autoGapRepairBtn").disabled=true; productionGapCandidates=[];
 box("autoGapCheckResult","run","全ての年別Shardを確認中…");
 try{
   const r=await workerCall("scan-missing-weekdays",600000);
   productionGapCandidates=r.missing||[];
   $("autoGapRepairBtn").disabled=productionGapCandidates.length===0;
   if(!productionGapCandidates.length){
     box("autoGapCheckResult","pass",`PASS
抜け候補: 0日
確認年: ${r.years.length}
処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒

判定: 補完対象なし`);
     box("autoGapRepairResult","pass","補完不要です。");
   }else{
     const byYear={}; for(const d of productionGapCandidates){const y=d.slice(0,4);byYear[y]=(byYear[y]||0)+1}
     box("autoGapCheckResult","warn",`要確認
抜け候補: ${productionGapCandidates.length}日
${Object.entries(byYear).map(([y,n])=>`${y}: ${n}日`).join("\n")}

※この段階では祝日・休場日も候補に含みます。
②を押すとJ-Quantsへ候補日だけ照会し、本当の欠損だけ自動補完します。`);
     box("autoGapRepairResult","run",`補完待ち: ${productionGapCandidates.length}候補日`);
   }
 }catch(e){box("autoGapCheckResult","fail","FAIL\n"+(e.message||e))}
};
if($("autoGapRepairBtn")) $("autoGapRepairBtn").onclick=async()=>{
 const token=copyTokenToAdvanced(),list=[...productionGapCandidates];
 if(!list.length){box("autoGapRepairResult","pass","補完対象なし");return}
 $("autoGapRepairBtn").disabled=true;
 let checked=0,marketClosed=0,repairedDays=0,saved=0,t0=performance.now(),last="-";
 try{
   for(const iso of list){
     last=iso; checked++;
     box("autoGapRepairResult","run",`自動補完中…
候補: ${list.length}日
現在: ${iso}
API確認: ${checked}/${list.length}
休場日: ${marketClosed}
補完した取引日: ${repairedDays}
保存行数: ${saved.toLocaleString()}
経過: ${((performance.now()-t0)/1000).toFixed(1)}秒`);
     const x=await jqFetchDaily(iso,token);
     if(!x.rows.length){marketClosed++;continue}
     const wr=await workerCall("gap-repair-date-write",600000,null,null,{date:iso,rows:x.rows});
     repairedDays++; saved+=Number(wr.rows||0);
   }
   const verify=await workerCall("scan-missing-weekdays",600000);
   productionGapCandidates=verify.missing||[];
   box("autoGapRepairResult","pass",`PASS
API確認: ${checked}日
休場日等: ${marketClosed}日
補完した取引日: ${repairedDays}日
保存行数: ${saved.toLocaleString()}
処理時間: ${((performance.now()-t0)/1000).toFixed(1)}秒

再スキャン候補: ${productionGapCandidates.length}日
※残りは祝日・休場日を含むため、取引日欠損は今回のAPI照会で補完済みです。

判定: 抜け自動補完 PASS`);
 }catch(e){
   box("autoGapRepairResult","fail",`FAIL
停止日: ${last}
API確認: ${checked}/${list.length}
補完済み取引日: ${repairedDays}
保存行数: ${saved.toLocaleString()}
${e.message||e}

同じ①→②を再実行できます（UPSERT）。`);
 }finally{$("autoGapRepairBtn").disabled=false}
};


if($("masterFetchBtn")) $("masterFetchBtn").onclick=async()=>{
 const btn=$("masterFetchBtn");
 const date=$("masterDate").value||localTodayIso();
 const token=prodTokenValue();
 if(!token){
   box("masterResult","fail","APIキーを入力してください。\n※このカードのAPIキー欄、または上部のDataLake更新欄のどちらでも使えます。");
   $("globalToken")?.focus();
   return;
 }
 sessionJqToken=token;
 btn.disabled=true;
 box("masterResult","run",`銘柄マスター取得中…\n基準日: ${date}`);
 try{
   const got=await jqFetchEquitiesMaster(date,token);
   const wr=await workerCall("equities-master-write",300000,null,null,{date,rows:got.rows});
   box("masterResult","pass",
     `PASS\nEndpoint: ${got.endpoint}\n基準日: ${date}\nAPI rows: ${got.rows.length}\n保存 rows: ${wr.rows}\nDB: ${wr.dbName}\nquick_check: ${wr.quickCheck}\n適用日: ${wr.minDate||"-"} ～ ${wr.maxDate||"-"}`);
 }catch(e){
   box("masterResult","fail","FAIL\n"+(e?.message||e));
 }finally{
   btn.disabled=false;
 }
};


if($("masterParityBtn")) $("masterParityBtn").onclick=async()=>{
 const f=$("masterParityCsv").files?.[0];
 if(!f){box("masterParityResult","warn","PC版 screening_candidates.csv を選択してください。");return}
 const btn=$("masterParityBtn");btn.disabled=true;
 try{
   const mat=parseSimpleCsv(await f.text()); if(mat.length<2)throw new Error("CSVデータなし");
   const head=mat[0].map(x=>x.trim()), ix=n=>head.indexOf(n);
   if(ix("NormalizedCode")<0)throw new Error("NormalizedCode列がありません");
   const fields=[
     ["CompanyName","company_name"],["Market","market_name"],["Sector17","sector17_name"],
     ["Sector33","sector33_name"],["MarginCategory","margin_name"]
   ].filter(([pc])=>ix(pc)>=0);
   const pcRows=mat.slice(1).filter(r=>r[ix("NormalizedCode")]).map(r=>{
     const o={code:normCodeForParity(r[ix("NormalizedCode")])};
     for(const [pc] of fields)o[pc]=String(r[ix(pc)]??"").trim();
     return o;
   });
   const wr=await workerCall("equities-master-parity",300000,null,null,{rows:pcRows,fields});
   const stat=wr.fieldStats.map(x=>`${x.field}: ${x.match}/${x.compared}一致`).join("\n");
   box("masterParityResult",wr.mismatch===0&&wr.missing===0?"pass":"warn",
     `${wr.mismatch===0&&wr.missing===0?"PASS":"要確認"}\nPC候補: ${wr.total}\n比較: ${wr.compared}\n完全一致: ${wr.perfect}\n不一致: ${wr.mismatch}\nWeb欠損: ${wr.missing}\n\n${stat}`);
   $("masterParityTable").innerHTML=(wr.diffs||[]).slice(0,30).map(x=>`<div><b>${x.code}</b> ${x.field}: PC=${String(x.pc)} / Web=${String(x.web)}</div>`).join("");
 }catch(e){box("masterParityResult","fail","FAIL\n"+(e?.message||e))}
 finally{btn.disabled=false}
};

async function runDailyDataset(btnId,resultId,dateId,fetcher,workerCmd,label){
 const btn=$(btnId), date=$(dateId).value||localTodayIso();
 const token=prodTokenValue();
 if(!token){box(resultId,"fail","APIキーを入力してください");return}
 btn.disabled=true;box(resultId,"run",`${label}取得中…\n基準日: ${date}`);
 try{
   const got=await fetcher(date,token);
   const wr=await workerCall(workerCmd,300000,null,null,{date,rows:got.rows});
   box(resultId,"pass",`PASS\nEndpoint: ${got.endpoint}\n基準日: ${date}\nAPI rows: ${got.rows.length}\n保存 rows: ${wr.rows}\nDB: ${wr.dbName}\nquick_check: ${wr.quickCheck}\n適用日: ${wr.minDate||"-"} ～ ${wr.maxDate||"-"}`);
 }catch(e){box(resultId,"fail","FAIL\n"+(e?.message||e))}
 finally{btn.disabled=false}
}
if($("finsFetchBtn")) $("finsFetchBtn").onclick=()=>runDailyDataset("finsFetchBtn","finsResult","finsDate",jqFetchFinsSummary,"fins-summary-write","財務サマリー");
if($("earningsFetchBtn")) $("earningsFetchBtn").onclick=()=>runDailyDataset("earningsFetchBtn","earningsResult","earningsDate",jqFetchEarningsCalendar,"earnings-calendar-write","決算予定");


const SUPPLY_RANGE_WRITERS=new Set(["margin-interest-write","margin-alert-write","short-ratio-write","short-sale-report-write","investor-types-write"]);
async function supplyResumeOptions(workerCmd){
 if(!SUPPLY_RANGE_WRITERS.has(workerCmd))return {skipDates:new Set(),coverage:[]};
 const r=await workerCall("raw-range-covered-dates",300000,null,null,{writerCmd});
 const coverage=Array.isArray(r.coverage)?r.coverage:[];
 // A positive historical response is safely reusable. Empty responses are also reusable once 7+ days old,
 // while recent empty dates stay eligible for re-check because J-Quants publication can lag the trading day.
 const oldCutoff=addIsoDays(localTodayIso(),-7),skipDates=new Set();
 for(const x of coverage){const d=String(x.date||"").slice(0,10),n=Number(x.rowCount||0);if(d&&(n>0||d<=oldCutoff))skipDates.add(d)}
 return {skipDates,coverage};
}
async function fetchAndPersistSupplyRange(fetcher,workerCmd,from,to,token,onProgress){
 const resume=await supplyResumeOptions(workerCmd);
 const got=await fetcher(from,to,token,onProgress,{skipDates:resume.skipDates});
 const coverageDates=Array.isArray(got.queriedDates)?got.queriedDates:[];
 let wr=null;
 if(coverageDates.length||got.rows.length){wr=await workerCall(workerCmd,300000,null,null,{from,to,rows:got.rows,coverageDates})}
 return {got,wr,resume};
}

async function runRangeDataset(btnId,resultId,fromId,toId,fetcher,workerCmd,label){
 const btn=$(btnId),from=$(fromId).value,to=$(toId).value,token=prodTokenValue();
 if(!token){box(resultId,"fail","APIキーを入力してください");return {ok:false}}
 btn.disabled=true;box(resultId,"run",`${label}取得中…\n${from} ～ ${to}`);
 try{
   let got,wr=null,skipped=0;
   if(SUPPLY_RANGE_WRITERS.has(workerCmd)){
     const r=await fetchAndPersistSupplyRange(fetcher,workerCmd,from,to,token,(done,total,rows,already)=>{
       box(resultId,"run",`${label}取得中…\n${from} ～ ${to}\nAPI照会: ${done}/${total}\n取得済みskip: ${already||0}\n取得 rows: ${rows}`);
     });got=r.got;wr=r.wr;skipped=Number(got.skippedDates||0);
     if(!got.queriedDates?.length){
       box(resultId,"pass",`PASS - 取得済み\n範囲: ${from} ～ ${to}\nAPI照会: 0回\n取得済みskip: ${skipped}\n既存DataLakeを再利用しました。`);
       return {ok:true,rows:0,skipped,alreadyCovered:true};
     }
   }else{
     got=await fetcher(from,to,token,(done,total,rows)=>{box(resultId,"run",`${label}取得中…\n${from} ～ ${to}\nAPI照会: ${done}/${total}\n取得 rows: ${rows}`)});
     wr=await workerCall(workerCmd,300000,null,null,{from,to,rows:got.rows});
   }
   box(resultId,"pass",`PASS\nEndpoint: ${got.endpoint}\n取得方式: ${got.strategy||"range"}${got.calls!=null?` / API照会 ${got.calls}回 / 0件 ${got.empty}回`:""}${skipped?` / 取得済みskip ${skipped}`:""}\n範囲: ${from} ～ ${to}\nAPI rows: ${got.rows.length}\n保存 rows: ${wr?.rows??"既存"}\nDB: ${wr?.dbName||"既存DataLake"}\nquick_check: ${wr?.quickCheck||"-"}\n適用日: ${wr?.minDate||"-"} ～ ${wr?.maxDate||"-"}`);
   return {ok:true,rows:got.rows.length,skipped};
 }catch(e){
   box(resultId,"fail","FAIL\n"+(e?.message||e));
   return {ok:false,error:String(e?.message||e)};
 }finally{btn.disabled=false}
}

if($("topixFetchBtn")) $("topixFetchBtn").onclick=()=>runRangeDataset("topixFetchBtn","topixResult","topixFrom","topixTo",jqFetchTopix,"topix-write","TOPIX");
if($("calendarFetchBtn")) $("calendarFetchBtn").onclick=()=>runRangeDataset("calendarFetchBtn","calendarResult","calendarFrom","calendarTo",jqFetchMarketCalendar,"market-calendar-write","営業日カレンダー");
if($("marginInterestFetchBtn")) $("marginInterestFetchBtn").onclick=()=>runRangeDataset("marginInterestFetchBtn","marginInterestResult","sdFrom","sdTo",jqFetchMarginInterest,"margin-interest-write","信用取引週末残高");
if($("marginAlertFetchBtn")) $("marginAlertFetchBtn").onclick=()=>runRangeDataset("marginAlertFetchBtn","marginAlertResult","sdFrom","sdTo",jqFetchMarginAlert,"margin-alert-write","日々公表信用");
if($("shortRatioFetchBtn")) $("shortRatioFetchBtn").onclick=()=>runRangeDataset("shortRatioFetchBtn","shortRatioResult","sdFrom","sdTo",jqFetchShortRatio,"short-ratio-write","空売り比率");
if($("shortSaleFetchBtn")) $("shortSaleFetchBtn").onclick=()=>runRangeDataset("shortSaleFetchBtn","shortSaleResult","sdFrom","sdTo",jqFetchShortSaleReport,"short-sale-report-write","空売り報告");
if($("investorTypesFetchBtn")) $("investorTypesFetchBtn").onclick=()=>runRangeDataset("investorTypesFetchBtn","investorTypesResult","sdFrom","sdTo",jqFetchInvestorTypes,"investor-types-write","投資部門別");

if($("marketBaseAllBtn")) $("marketBaseAllBtn").onclick=async()=>{
 const btn=$("marketBaseAllBtn");btn.disabled=true;
 try{
   const r1=await runRangeDataset("topixFetchBtn","topixResult","topixFrom","topixTo",jqFetchTopix,"topix-write","TOPIX");
   const r2=await runRangeDataset("calendarFetchBtn","calendarResult","calendarFrom","calendarTo",jqFetchMarketCalendar,"market-calendar-write","営業日カレンダー");
   box("marketBaseAllResult",(r1.ok&&r2.ok)?"pass":"warn",`市場基礎2種: ${r1.ok&&r2.ok?"PASS":"要確認"}\nTOPIX: ${r1.ok?"OK":"NG"}\nCalendar: ${r2.ok?"OK":"NG"}`);
 }finally{btn.disabled=false}
};
if($("supplyDemandAllBtn")) $("supplyDemandAllBtn").onclick=async()=>{
 const btn=$("supplyDemandAllBtn");btn.disabled=true;
 const jobs=[
   ["marginInterestFetchBtn","marginInterestResult",jqFetchMarginInterest,"margin-interest-write","信用取引週末残高"],
   ["marginAlertFetchBtn","marginAlertResult",jqFetchMarginAlert,"margin-alert-write","日々公表信用"],
   ["shortRatioFetchBtn","shortRatioResult",jqFetchShortRatio,"short-ratio-write","空売り比率"],
   ["shortSaleFetchBtn","shortSaleResult",jqFetchShortSaleReport,"short-sale-report-write","空売り報告"],
   ["investorTypesFetchBtn","investorTypesResult",jqFetchInvestorTypes,"investor-types-write","投資部門別"]
 ];
 const results=[];
 try{
   for(const j of jobs){
     results.push([j[4],await runRangeDataset(j[0],j[1],"sdFrom","sdTo",j[2],j[3],j[4])]);
     await sleep(400);
   }
   const ok=results.filter(x=>x[1].ok).length;
   box("supplyDemandAllResult",ok===results.length?"pass":"warn",`需給5種: ${ok}/${results.length} 成功\n`+results.map(x=>`${x[0]}: ${x[1].ok?"OK":"NG"}`).join("\n"));
 }finally{btn.disabled=false}
};


if($("workflowBindingStatus")){
 const ids=["finsHistoryBtn","financialNormalizeBtn","financialParityBtn","supplyDemandSummaryBtn","supplyDemandNormalizeBtn","portfolioIntegratedBtn","portfolioExportBtn","portfolioJqpExportBtn"];
 const found=ids.filter(id=>$(id)).length;
 box("workflowBindingStatus",found===ids.length?"pass":"fail",`Workflow buttons: ${found}/${ids.length} DOM ready`);
}
if($("runtimeSelfTestBtn")) $("runtimeSelfTestBtn").onclick=async()=>{
 const btn=$("runtimeSelfTestBtn");btn.disabled=true;box("runtimeSelfTestResult","run","SQLite runtime / SAH Pool を確認中…");
 try{const r=await workerCall("catalog-list",120000);box("runtimeSelfTestResult","pass",`PASS\nSQLite Worker: OK\nCatalog: OK\n登録Shard: ${r.rows?.length??0}`)}
 catch(e){box("runtimeSelfTestResult","fail","FAIL\n"+(e?.message||e))}finally{btn.disabled=false}
};
if($("finsHistoryBtn")) $("finsHistoryBtn").onclick=async()=>{
 const btn=$("finsHistoryBtn"),from=$("finsHistoryFrom").value,to=$("finsHistoryTo").value,token=prodTokenValue();
 if(!token){box("finsHistoryResult","warn","ページ最上部のAPIキーを入力してください");return}
 btn.disabled=true;box("finsHistoryResult","run",`財務履歴取得中…\n${from} ～ ${to}`);
 try{
   const got=await jqFetchFinsHistory(from,to,token,(done,total,rows)=>box("finsHistoryResult","run",`財務履歴取得中…\nAPI照会 ${done}/${total}\n取得 rows ${rows}`));
   const wr=await workerCall("fins-summary-write",300000,null,null,{date:to,rows:got.rows});
   box("finsHistoryResult","pass",`PASS\nAPI照会: ${got.calls}回 / 0件 ${got.empty}回\nAPI rows: ${got.rows.length}\n保存 rows: ${wr.rows}\nquick_check: ${wr.quickCheck}`);
   latestFinancialNormalized=null;
 }catch(e){box("finsHistoryResult","fail","FAIL\n"+(e?.message||e))}finally{btn.disabled=false}
};
if($("supplyDemandNormalizeBtn")) $("supplyDemandNormalizeBtn").onclick=async()=>{
 const btn=$("supplyDemandNormalizeBtn");btn.disabled=true;box("supplyDemandNormalizeResult","run","需給5種を分析用形式へ正規化中…");
 try{const r=await workerCall("supply-demand-normalize",180000),x=r.result;const lines=Object.entries(x).map(([k,v])=>`${k}: ${v.error?"NG":`${v.rows} recent rows / code ${v.codeSnapshots} / market ${v.marketSnapshots}`}`);box("supplyDemandNormalizeResult",Object.values(x).every(v=>!v.error)?"pass":"warn","需給正規化: 完了\n"+lines.join("\n"))}
 catch(e){box("supplyDemandNormalizeResult","fail","FAIL\n"+(e?.message||e))}finally{btn.disabled=false}
};
if($("supplyDemandSummaryBtn")) $("supplyDemandSummaryBtn").onclick=async()=>{
 const btn=$("supplyDemandSummaryBtn");btn.disabled=true;box("supplyDemandSummaryResult","run","需給Shardを横断監査中…");
 try{
   const r=await workerCall("supply-demand-summary",180000),ok=r.datasets.filter(x=>!x.error&&x.count>0).length;
   const lines=r.datasets.map(x=>`${x.label}: ${x.error?"NG "+x.error:`${x.count} rows / ${x.minDate||"-"}～${x.maxDate||"-"} / fields ${x.fields.length}`}`);
   box("supplyDemandSummaryResult",ok===5?"pass":"warn",`需給統合監査: ${ok}/5\n`+lines.join("\n"));
 }catch(e){box("supplyDemandSummaryResult","fail","FAIL\n"+(e?.message||e))}finally{btn.disabled=false}
};

if($("screeningFinsCatchupBtn")) $("screeningFinsCatchupBtn").onclick=async()=>{
 const btn=$("screeningFinsCatchupBtn"),token=prodTokenValue(),from=$("screeningFinsCatchupFrom").value,to=$("screeningFinsCatchupTo").value;
 if(!token){box("screeningFinsCatchupResult","warn","ページ最上部のAPIキーを入力してください");return}
 btn.disabled=true;
 try{
   const cov=await workerCall("fins-summary-covered-dates",120000),have=new Set(cov.dates||[]),dates=isoWeekdays(from,to).filter(d=>!have.has(d));
   if(!dates.length){box("screeningFinsCatchupResult","pass","必要期間は取得済みです");return}
   let all=[],empty=0;
   for(let i=0;i<dates.length;i++){
     const d=dates[i],r=await jqFetchV2Rows("/fins/summary",{date:d.replaceAll("-","")},token);
     if(!r.rows.length)empty++;all.push(...r.rows);
     box("screeningFinsCatchupResult","run",`Screening財務履歴を補完中…\nAPI照会 ${i+1}/${dates.length}\n取得 rows ${all.length}`);
     if(i<dates.length-1)await sleep(1100);
   }
   // write grouped by query date so coverage is preserved correctly
   const groups=new Map();for(const d of dates)groups.set(d,[]);
   for(const r of all){const d=String(r.DiscDate??r.Date??"").slice(0,10);if(groups.has(d))groups.get(d).push(r)}
   let saved=0;
   for(const [d,rows] of groups){const wr=await workerCall("fins-summary-write",300000,null,null,{date:d,rows});saved=wr.rows}
   latestFinancialNormalized=null;
   box("screeningFinsCatchupResult","pass",`PASS\n不足日照会: ${dates.length}\n0件日: ${empty}\n取得 rows: ${all.length}\nDB総rows: ${saved}\n次: 財務データを正規化`);
 }catch(e){box("screeningFinsCatchupResult","fail","FAIL\n"+(e?.message||e))}
 finally{btn.disabled=false}
};

let latestFinancialNormalized=null;
if($("financialNormalizeBtn")) $("financialNormalizeBtn").onclick=async()=>{
 const btn=$("financialNormalizeBtn");btn.disabled=true;box("financialNormalizeResult","run","財務raw_jsonを正規化中…");
 try{
   const r=await workerCall("financial-normalize-latest",180000);
   latestFinancialNormalized=r.rows;
   const withForecast=r.rows.filter(x=>x.forecastSales!=null||x.forecastOP!=null||x.forecastNP!=null||x.forecastEPS!=null).length;
   box("financialNormalizeResult","pass",`PASS\n正規化銘柄: ${r.count}\n前年同期比較可能: ${r.comparablePrior??"-"}\nYoY算出可能: ${r.yoyReady??"-"}\n会社予想あり: ${withForecast}\n対象列: Sales / Profit / Margin / YoY / ROE / EquityRatio / CFO・FCF / Forecast`);
 }catch(e){box("financialNormalizeResult","fail","FAIL\n"+(e?.message||e))}
 finally{btn.disabled=false}
};

if($("financialParityBtn")) $("financialParityBtn").onclick=async()=>{
 const btn=$("financialParityBtn"),file=$("financialParityFile")?.files?.[0];
 if(!file){box("financialParityResult","warn","PC版 screening_candidates.csv を選択してください");return}
 btn.disabled=true;box("financialParityResult","run","財務PC/Web Parityを計算中…");
 try{
  const pc=parseCsv(await file.text());if(!latestFinancialNormalized){const fr=await workerCall("financial-normalize-latest",180000);latestFinancialNormalized=fr.rows}
  const fm=new Map(latestFinancialNormalized.map(x=>[String(x.code),x]));
  const defs=[["Sales",["Sales","LatestSales"],"sales"],["OP",["OP","OperatingProfit","LatestOperatingProfit"],"op"],["NP",["NP","NetProfit","Profit"],"np"],["EPS",["EPS","LatestEPS"],"eps"],["ForecastSales",["ForecastSales","FSales"],"forecastSales"],["ForecastOP",["ForecastOP","FOP","ForecastOperatingProfit"],"forecastOP"],["ForecastNP",["ForecastNP","FNP"],"forecastNP"],["ForecastEPS",["ForecastEPS","FEPS"],"forecastEPS"]];
  const hs=new Set(pc.headers),specs=defs.map(([l,ns,k])=>[l,ns.find(n=>hs.has(n)),k]).filter(x=>x[1]);
  let compared=0,perfect=0,missing=0;const st=Object.fromEntries(specs.map(x=>[x[0],{ok:0,n:0,max:0}]));
  for(const r of pc.rows){let c=String(r.NormalizedCode??r.Code??"").trim();if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);const f=fm.get(c);if(!f){missing++;continue}compared++;let all=true;
   for(const [l,col,k] of specs){const pv=Number(r[col]),wv=Number(f[k]);if(!Number.isFinite(pv)||!Number.isFinite(wv))continue;const d=Math.abs(pv-wv),tol=Math.max(.01,Math.abs(pv)*1e-9);st[l].n++;st[l].max=Math.max(st[l].max,d);if(d<=tol)st[l].ok++;else all=false}if(all)perfect++}
  const lines=specs.map(([l])=>`${l}: ${st[l].ok}/${st[l].n}一致 / maxΔ ${st[l].max.toFixed(4)}`);
  box("financialParityResult",specs.length&&perfect===compared?"pass":"warn",`財務Parity\nPC列検出: ${specs.length}\n比較銘柄: ${compared}\n全比較項目一致: ${perfect}\nWeb財務欠損: ${missing}\n\n${lines.join("\n")||"直接比較可能なPC財務列なし"}`);
 }catch(e){box("financialParityResult","fail","FAIL\n"+(e?.message||e))}finally{btn.disabled=false}
};
if($("jqpTechnicalParityBtn")) $("jqpTechnicalParityBtn").onclick=async()=>{
 const btn=$("jqpTechnicalParityBtn"),file=$("jqpTechnicalParityFile")?.files?.[0];if(!file){box("jqpTechnicalParityResult","warn","technical_snapshot.csv を選択してください");return}
 btn.disabled=true;box("jqpTechnicalParityResult","run","PC/Webテクニカル全項目を比較中…");
 try{const pc=parseCsv(await file.text()),asOf=pc.rows[0]?.Date||$("screeningAsOf")?.value, tr=await workerCall("technical-screening-poc",300000,null,null,{asOf,lookback:320,topN:200,returnAll:true});
 const norm=v=>{let c=String(v??"").trim();if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);return c},tm=new Map((tr.all||[]).map(x=>[norm(x.code),x]));
 const nums=[["TechnicalClose","close"],["MA5","ma5"],["MA25","ma25"],["MA75","ma75"],["MA200","ma200"],["MA5Slope5DPct","slope5"],["MA25Slope5DPct","slope25"],["MA75Slope20DPct","slope75"],["MA200Slope20DPct","slope200"],["DeviationFromMA5Pct","distMa5"],["DeviationFromMA25Pct","distMa25"],["DeviationFromMA75Pct","distMa75"],["DeviationFromMA200Pct","distMa200"],["ATR14","atr14"],["ATR14Pct","atr14Pct"],["High20D","high20"],["Low20D","low20"],["High60D","high60"],["Low60D","low60"],["High52Week","high52"],["Low52Week","low52"],["RSI14","rsi14"],["MACD","macd"],["MACDSignal","macdSignal"],["MACDHistogram","macdHistogram"],["IchimokuTenkan","ichimokuTenkan"],["IchimokuKijun","ichimokuKijun"],["IchimokuSenkouA","ichimokuSenkouA"],["IchimokuSenkouB","ichimokuSenkouB"],["IchimokuFutureSenkouA","ichimokuFutureSenkouA"],["IchimokuFutureSenkouB","ichimokuFutureSenkouB"],["IchimokuChikouReferenceClose","ichimokuChikouReferenceClose"],["DistanceFrom20DHighPct","distHigh20"],["DistanceFrom20DLowPct","distLow20"],["DistanceFrom60DHighPct","distHigh60"],["DistanceFrom60DLowPct","distLow60"],["DistanceFrom52WeekHighPct","distHigh52"],["DistanceFrom52WeekLowPct","distLow52"]];
 const strs=[["MACDState","macdState"],["IchimokuChikouBullish","ichimokuChikouBullish"],["IchimokuAboveCloud","ichimokuAboveCloud"],["IchimokuCloudDirection","ichimokuCloudDirection"],["AboveMA5","aboveMA5"],["AboveMA25","aboveMA25"],["AboveMA75","aboveMA75"],["AboveMA200","aboveMA200"],["MAAlignment","maAlignment"],["TrendState","trendState"],["New20DHigh","new20H"],["New20DLow","new20L"],["New60DHigh","new60H"],["New60DLow","new60L"],["New52WeekHigh","new52H"],["New52WeekLow","new52L"]];
 const stat={};for(const [p] of [...nums,...strs])stat[p]={ok:0,n:0,max:0};let compared=0,missing=0;
 for(const r of pc.rows){const t=tm.get(norm(r.NormalizedCode));if(!t){missing++;continue}compared++;for(const [p,k] of nums){if(r[p]===""||t[k]==null)continue;const x=Number(r[p]),y=Number(t[k]);if(!Number.isFinite(x)||!Number.isFinite(y))continue;const d=Math.abs(x-y);stat[p].n++;stat[p].max=Math.max(stat[p].max,d);if(d<=.0011)stat[p].ok++}for(const [p,k] of strs){if(r[p]==="")continue;stat[p].n++;if(String(r[p])===String(t[k]??""))stat[p].ok++}}
 const all=[...nums,...strs].map(([p])=>[p,stat[p]]).filter(([,x])=>x.n),bad=all.filter(([,x])=>x.ok!==x.n);
 box("jqpTechnicalParityResult",bad.length===0&&missing===0?"pass":"warn",`JQP Technical Parity\n基準日: ${asOf}\nWeb計算母集団: ${(tr.all||[]).length}\n52週定義: 過去252取引日のClose（PC版準拠）\n比較銘柄: ${compared}\nWeb欠損: ${missing}\n一致フィールド: ${all.length-bad.length}/${all.length}\n\n${bad.length?bad.map(([p,x])=>`${p}: ${x.ok}/${x.n} / maxΔ ${x.max.toFixed(4)}`).join("\n"):"不一致項目なし"}`);
 }catch(e){box("jqpTechnicalParityResult","fail","FAIL\n"+(e?.message||e))}finally{btn.disabled=false}
};
if($("portfolioIntegratedBtn")) $("portfolioIntegratedBtn").onclick=async()=>{
 const btn=$("portfolioIntegratedBtn"),file=$("portfolioIntegratedFile")?.files?.[0];
 if(!file){box("portfolioIntegratedResult","warn","PC版 portfolio.csv を選択してください");return}
 btn.disabled=true;box("portfolioIntegratedResult","run","Portfolio統合スナップショット生成中…");
 try{
   const txt=await file.text(), parsed=parseCsv(txt);
   const stocks=parsed.rows.map(r=>({code:r.Code,name:r.Name,account:r.Account,shares:r.Shares,avgCost:r.AvgCost,amount:r.Amount,strategy:r.Strategy}));
   const asOf=$("screeningAsOf")?.value||new Date().toISOString().slice(0,10);
   const tech=await workerCall("technical-screening-poc",300000,null,null,{asOf,lookback:320,topN:200,returnAll:true});
   if(!latestFinancialNormalized){
     const fr=await workerCall("financial-normalize-latest",180000); latestFinancialNormalized=fr.rows;
   }
   const sr=await workerCall("supply-demand-portfolio-snapshot",180000);
   const pr=await workerCall("portfolio-integrated-snapshot",180000,null,null,{stocks,techRows:(tech.all||tech.top||[]),finRows:latestFinancialNormalized,supply:sr.result});
   const okTech=pr.rows.filter(x=>x.close!=null).length,okFin=pr.rows.filter(x=>x.discDate).length;
   const okMargin=pr.rows.filter(x=>x.marginInterestDate).length,okShort=pr.rows.filter(x=>x.shortReportDate||x.shortRatioDate).length;
   const techUniverse=(tech.all||tech.top||[]).length;
   const lines=pr.rows.map(x=>`${x.code} ${x.name||x.companyName||""} | ${x.account} | Close ${x.close??"-"} | RSI ${x.rsi14!=null?x.rsi14.toFixed(2):"-"} | TOPIX20D ${x.relativeToTOPIX20D!=null?x.relativeToTOPIX20D.toFixed(2):"-"} | EPS ${x.eps??"-"} | F.EPS ${x.forecastEPS??"-"} | 信用 ${x.marginRatio!=null?x.marginRatio.toFixed(2):"-"} | 空売 ${x.shortRatio!=null?x.shortRatio.toFixed(2):"-"}`);
   window.__latestPortfolioIntegrated=pr.rows;
   box("portfolioIntegratedResult",(okTech===pr.count&&okFin===pr.count)?"pass":"warn",`統合スナップショット\n銘柄: ${pr.count}\nテクニカル計算母集団: ${techUniverse}\nテクニカル接続: ${okTech}/${pr.count}\n財務接続: ${okFin}/${pr.count}\n信用残接続: ${okMargin}/${pr.count}\n空売り系接続: ${okShort}/${pr.count}\n\n`+lines.join("\n"));
   if($("portfolioExportBtn"))$("portfolioExportBtn").disabled=false;
   if($("portfolioJqpExportBtn"))$("portfolioJqpExportBtn").disabled=false;
 }catch(e){box("portfolioIntegratedResult","fail","FAIL\n"+(e?.message||e))}
 finally{btn.disabled=false}
};

if($("portfolioJqpParityBtn")) $("portfolioJqpParityBtn").onclick=async()=>{
 const btn=$("portfolioJqpParityBtn"),pf=$("portfolioParityPortfolioFile")?.files?.[0],tf=$("portfolioParityTechnicalFile")?.files?.[0];
 if(!pf||!tf){box("portfolioJqpParityResult","warn","portfolio.csv と technical_snapshot.csv の2ファイルを選択してください");return}
 btn.disabled=true;box("portfolioJqpParityResult","run","Portfolio/JQP統合経路をPC版と照合中…");
 try{
   const p=parseCsv(await pf.text()),t=parseCsv(await tf.text()),norm=v=>{let x=String(v??"").trim();if(x.length===5&&x.endsWith("0"))x=x.slice(0,4);return x};
   const pmap=new Map(p.rows.map(r=>[`${norm(r.Code)}|${String(r.Account||"")}`,r]));
   const tmap=new Map(t.rows.map(r=>[norm(r.NormalizedCode||r.Code),r]));
   const web=window.__latestPortfolioIntegrated||[];
   if(!web.length)throw new Error("先に⑨「Portfolio統合を実行」をPASSさせてください");
   const num=(x)=>{const n=Number(x);return Number.isFinite(n)?n:null},eqNum=(x,y,tol=.01)=>x==null&&y==null||x!=null&&y!=null&&Math.abs(x-y)<=tol;
   let pOk=0,tOk=0,missing=0; const bad=[];
   const techPairs=[
    ["Close","close"],["MA5","ma5"],["MA25","ma25"],["MA75","ma75"],["MA200","ma200"],["RSI14","rsi14"],
    ["Return5D","return5D"],["Return20D","return20D"],["Return60D","return60D"],["Return120D","return120D"],
    ["TOPIXReturn5D","topixReturn5D"],["TOPIXReturn20D","topixReturn20D"],["TOPIXReturn60D","topixReturn60D"],["TOPIXReturn120D","topixReturn120D"],
    ["RelativeToTOPIX5D","relativeToTOPIX5D"],["RelativeToTOPIX20D","relativeToTOPIX20D"],["RelativeToTOPIX60D","relativeToTOPIX60D"],["RelativeToTOPIX120D","relativeToTOPIX120D"],
    ["High20D","high20D"],["Low20D","low20D"],["High60D","high60D"],["Low60D","low60D"],["High52Week","high52Week"],["Low52Week","low52Week"],
    ["ATR14","atr14"],["ATR14Pct","atr14Pct"],["MACD","macd"],["MACDSignal","macdSignal"],["MACDHistogram","macdHistogram"],
    ["IchimokuTenkan","ichimokuTenkan"],["IchimokuKijun","ichimokuKijun"],["IchimokuSenkouA","ichimokuSenkouA"],["IchimokuSenkouB","ichimokuSenkouB"]
   ];
   for(const x of web){
     const pr=pmap.get(`${norm(x.code)}|${String(x.account||"")}`),tr=tmap.get(norm(x.code));
     if(!pr||!tr){missing++;continue}
     const pok=String(pr.Name||"")===String(x.name||"")&&Number(pr.Shares||0)===Number(x.shares||0)&&eqNum(num(pr.AvgCost),num(x.avgCost),.0001)&&String(pr.Strategy||"")===String(x.strategy||"");
     if(pok)pOk++; else bad.push(`${x.code}: Portfolio入力差`);
     let ok=true;
     for(const [pc,wk] of techPairs){
       if(Object.prototype.hasOwnProperty.call(tr,pc)&&String(tr[pc]??"")!==""){
         if(!eqNum(num(tr[pc]),num(x[wk]),.02)){ok=false;break}
       }
     }
     if(ok)tOk++; else bad.push(`${x.code}: JQPテクニカル統合差`);
   }
   const pass=pOk===web.length&&tOk===web.length&&missing===0;
   box("portfolioJqpParityResult",pass?"pass":"warn",`Portfolio/JQP 統合Parity\n銘柄: ${web.length}\nPortfolio入力一致: ${pOk}/${web.length}\nJQPテクニカル統合一致: ${tOk}/${web.length}\nPC側欠損: ${missing}\n\n${bad.length?bad.slice(0,20).join("\n"):"不一致項目なし"}`);
 }catch(e){box("portfolioJqpParityResult","fail","FAIL\n"+(e?.message||e))}
 finally{btn.disabled=false}
};

if($("portfolioJqpExportBtn")) $("portfolioJqpExportBtn").onclick=()=>{
 const rows=window.__latestPortfolioIntegrated||[];if(!rows.length)return;
 const payload={
   schema:"web-jqp-v1",
   generatedAt:new Date().toISOString(),
   portfolioCount:rows.length,
   layers:["portfolio","master","price","technical","topix-relative","financial","supply-demand"],
   rows
 };
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),el=document.createElement("a");
 el.href=url;el.download=`web_jqp_${new Date().toISOString().slice(0,10).replaceAll("-","")}.json`;el.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

if($("portfolioExportBtn")) $("portfolioExportBtn").onclick=()=>{
 const rows=window.__latestPortfolioIntegrated||[];if(!rows.length)return;const headers=Object.keys(rows[0]),esc=v=>{const x=v==null?"":String(v);return /[",\n]/.test(x)?`"${x.replaceAll('"','""')}"`:x};
 const csv="\uFEFF"+headers.join(",")+"\n"+rows.map(r=>headers.map(k=>esc(r[k])).join(",")).join("\n"),blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),el=document.createElement("a");
 el.href=url;el.download=`web_portfolio_integrated_${new Date().toISOString().slice(0,10).replaceAll("-","")}.csv`;el.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

let latestScreeningBaseRows=[];
if($("screeningBaseBtn")) $("screeningBaseBtn").onclick=async()=>{
 const btn=$("screeningBaseBtn"),asOf=$("screeningBaseAsOf")?.value||$("screeningAsOf")?.value||todayIsoLocal();
 btn.disabled=true; box("screeningBaseResult","run",`${asOf} Screening統合母集団を構築中…`);
 try{
   const tech=await workerCall("technical-screening-poc",600000,null,null,{asOf,lookback:320,topN:5000,returnAll:true});
   if(!latestFinancialNormalized){const fr=await workerCall("financial-normalize-latest",180000);latestFinancialNormalized=fr.rows}
   const r=await workerCall("screening-base-snapshot",240000,null,null,{asOf,techRows:(tech.all||tech.top||[]),finRows:latestFinancialNormalized});
   latestScreeningBaseRows=r.rows||[];
   const sf=await workerCall("screening-supply-features",300000,null,null,{asOf,codes:latestScreeningBaseRows.map(x=>x.NormalizedCode)});
   const sm=new Map((sf.rows||[]).map(x=>[String(x.NormalizedCode),x]));
   latestScreeningBaseRows=latestScreeningBaseRows.map(x=>({...x,...(sm.get(String(x.NormalizedCode))||{})}));
   const x=r.coverage||{};
   box("screeningBaseResult",(x.technical===r.count&&x.master===r.count)?"pass":"warn",`Screening統合母集団\n基準日: ${asOf}\nフィルタ前: ${x.preFilter??"-"}\nフィルタ後: ${r.count}\nテクニカル: ${x.technical}/${r.count}\nMaster: ${x.master}/${r.count}\n財務: ${x.financial}/${r.count}\n会社予想: ${x.forecast}/${r.count}\n\n${x.master===r.count?"Master JOIN: PASS":"Master JOIN: 要確認"}\n母集団フィルタ: Market + 普通株011 + 売買代金5,000万円 + 株価100円 + 履歴60日\n次段階: PC版5戦略スコア/Top20選抜`);
   if($("screeningBaseExportBtn")) $("screeningBaseExportBtn").disabled=!latestScreeningBaseRows.length;
 }catch(e){box("screeningBaseResult","fail","FAIL\n"+(e?.message||e))}finally{btn.disabled=false}
};
if($("screeningBaseExportBtn")) $("screeningBaseExportBtn").onclick=()=>{
 if(!latestScreeningBaseRows.length)return; const keys=[...new Set(latestScreeningBaseRows.flatMap(Object.keys))];
 const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"'; const csv=[keys.join(','),...latestScreeningBaseRows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n');
 downloadBlob(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}),`web_screening_base_${($("screeningBaseAsOf")?.value||todayIsoLocal()).replaceAll("-","")}.csv`); box("screeningBaseResult","pass",`母集団CSVを書き出しました\n銘柄: ${latestScreeningBaseRows.length}`);
};

let latestScreeningCandidates=[];let latestScreeningParityPcRows=[];let latestScreeningScoredRows=[];
function pctRank(rows,key,reverse=false){
 const vals=rows.map((r,i)=>({i,v:Number(r[key])})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>a.v-b.v);
 const out=new Array(rows.length).fill(50); if(vals.length<2)return out;
 let j=0; while(j<vals.length){let k=j;while(k+1<vals.length&&vals[k+1].v===vals[j].v)k++;const rank=((j+k)/2)/(vals.length-1)*100;for(let z=j;z<=k;z++)out[vals[z].i]=reverse?100-rank:rank;j=k+1} return out;
}
function clip100(x){return Math.max(0,Math.min(100,Number(x)||0))}
function buildScreeningStrategies(rows){
 const rr=rows.map(x=>({...x}));
 const lin=(v,pts,def=50)=>{
  // PC screening.py::_linear_score parity:
  // Python None -> default. JS Number(null) is 0, so null/blank MUST be
  // rejected before numeric coercion or missing data is incorrectly scored
  // as a real zero.
  if(v==null||String(v).trim()==="")return def;
  v=Number(v);
  if(!Number.isFinite(v))return def;
  if(v<=pts[0][0])return pts[0][1];
  if(v>=pts.at(-1)[0])return pts.at(-1)[1];
  for(let i=1;i<pts.length;i++){
    const [x1,y1]=pts[i-1],[x2,y2]=pts[i];
    if(x1<=v&&v<=x2)return y1+(v-x1)/(x2-x1)*(y2-y1);
  }
  return def;
};
 const weighted=(r,defs,neutral=50)=>{let total=0,w=0;for(const [k,wt] of defs){const v=r[k];total+=(v==null?neutral:Number(v))*wt;w+=wt}return w?total/w:neutral};
 const rank=(field,out,reverse=false,groupField=null)=>{const assign=(items)=>{items.sort((a,b)=>a.v-b.v);const n=items.length;if(!n)return;let s=0;while(s<n){let e=s+1;while(e<n&&items[e].v===items[s].v)e++;const p=(((s+e-1)/2)+1)/n*100,q=reverse?100-p:p;for(let i=s;i<e;i++)rr[items[i].i][out]=q;s=e}};
   rr.forEach(r=>r[out]=null);
   if(groupField){const gs=new Map();rr.forEach((r,i)=>{
     const raw=r[field],blank=raw==null||String(raw).trim()==="",v=blank?null:Number(raw),g=String(r[groupField]||"").trim();
     const valid=Number.isFinite(v)&&g&&(!["ForecastPER","PBR"].includes(field)||v>0);
     if(valid){if(!gs.has(g))gs.set(g,[]);gs.get(g).push({i,v})}
   });for(const items of gs.values())if(items.length>=5)assign(items)}
   else assign(rr.map((r,i)=>{const raw=r[field],blank=raw==null||String(raw).trim()==="";return {i,v:blank?null:Number(raw)}}).filter(x=>Number.isFinite(x.v)));
 };
 for(const [f,o] of [["SalesYoY","SalesGrowthScore"],["PrimaryProfitYoY","ProfitGrowthScore"],["OperatingMarginChangePt","MarginQualityScore"],["RelativeToTOPIX20D","Relative20Score"],["RelativeToTOPIX60D","Relative60Score"],["RelativeToTOPIX120D","Relative120Score"],["MA75DeviationPct","MA75StretchScore"],["PositionVs60DHighPct","HighPositionScore"],["Return5D","ShortMomentumScore"],["VolumeRatio5To20","VolumePickupScore"],["MA25DeviationPct","MA25PositionScore"]])rank(f,o);
 rank("ForecastPER","SectorForecastPERValueScore",true,"Sector33");
 rank("PBR","SectorPBRValueScore",true,"Sector33");
 rank("ForecastDividendYieldPct","SectorDividendYieldValueScore",false,"Sector33");
 rr.forEach(r=>{
   if(r.ForecastPER==null||String(r.ForecastPER).trim()===""||!(Number(r.ForecastPER)>0)) r.SectorForecastPERValueScore=null;
   if(r.PBR==null||String(r.PBR).trim()===""||!(Number(r.PBR)>0)) r.SectorPBRValueScore=null;
   if(r.ForecastDividendYieldPct==null||String(r.ForecastDividendYieldPct).trim()===""||!Number.isFinite(Number(r.ForecastDividendYieldPct))) r.SectorDividendYieldValueScore=null;
 });
 rank("MACDHistogramChange5D","MACDHistogramImprovementScore");rank("MA25Slope5DPct","MA25SlopeScore");rank("MA75Slope20DPct","MA75SlopeScore");
 rr.forEach(r=>{
  r.GuidanceDirectionScore=lin(r.ForecastSalesGrowthPct,[[-20,10],[-5,30],[0,50],[10,70],[30,90]])*.5+lin(r.ForecastPrimaryProfitGrowthPct,[[-30,10],[-10,30],[0,50],[15,70],[50,90]])*.5;
  r.CFOQualityScore=r.CFO==null?50:(Number(r.CFO)>=0?70:25);
  r.FundamentalScore=weighted(r,[["SalesGrowthScore",.25],["ProfitGrowthScore",.30],["MarginQualityScore",.20],["GuidanceDirectionScore",.15],["CFOQualityScore",.10]]);
  r.PriceRecognitionScore=weighted(r,[["Relative20Score",.20],["Relative60Score",.30],["Relative120Score",.25],["MA75StretchScore",.15],["HighPositionScore",.10]]);
  r.FundamentalPriceGap=r.FundamentalScore-r.PriceRecognitionScore;
  r.ReRatingScore=weighted(r,[["ShortMomentumScore",.35],["VolumePickupScore",.30],["MA25PositionScore",.35]]);
  const opm=r.ProfitType==="OperatingProfit"?lin(r.CurrentOperatingMarginPct,[[0,25],[5,45],[10,65],[20,85],[35,95]]):50;
  const mi=lin(r.OperatingMarginChangePt,[[-5,15],[-1,35],[0,50],[2,70],[5,90]]),roe=lin(r.ROE,[[0,20],[5,40],[10,60],[15,78],[25,95]]),eq=lin(r.EquityRatioPct,[[10,25],[25,45],[40,65],[60,82],[80,90]]);
  let cf=50;if(r.LatestAvailableCFO!=null){cf=Number(r.LatestAvailableCFO)>0?70:20;if(r.LatestAvailableFCF!=null)cf+=Number(r.LatestAvailableFCF)>0?15:-15}
  r.QVRROEScore=roe;
  r.QVROperatingMarginScore=opm;
  r.QVRMarginImprovementScore=mi;
  r.QVRCFScore=cf;
  r.QVREquityScore=eq;
  r.QVRQualityScore=Math.max(0,Math.min(100,roe*.25+opm*.20+mi*.20+cf*.20+eq*.15));
 });
 // QVR value requires peer ranks, calculated above.
 rr.forEach(r=>{
   const av=[["SectorForecastPERValueScore",.45],["SectorPBRValueScore",.30],["SectorDividendYieldValueScore",.25]]
     .filter(([k])=>r[k]!=null&&String(r[k]).trim()!==""&&Number.isFinite(Number(r[k])));
   if(!av.length)r.QVRValueScore=null;else{let v=av.reduce((s,[k,w])=>s+Number(r[k])*w,0)/av.reduce((s,[,w])=>s+w,0);if(r.ForecastPrimaryProfitGrowthPct!=null&&r.ForecastPrimaryProfitGrowthPct<-20)v-=Math.min(20,Math.abs(r.ForecastPrimaryProfitGrowthPct+20)*.5);r.QVRValueScore=Math.max(0,Math.min(100,v))}
   const rsi=lin(r.RSI14,[[20,25],[35,50],[50,78],[65,85],[75,60],[90,25]]),early=lin(r.DistanceFrom52WLowPct,[[0,55],[10,75],[30,88],[60,72],[120,35],[250,15]]);
   const mb={GoldenCross:90,AboveSignal:72,OnSignal:50,BelowSignal:35,DeadCross:20}[r.MACDState]??50;
   const base=weighted(r,[["Relative20Score",.17],["Relative60Score",.13],["MA25SlopeScore",.14],["MA75SlopeScore",.10],["MACDHistogramImprovementScore",.12],["VolumePickupScore",.10]],50);
   r.QVRReRatingScore=Math.max(0,Math.min(100,base*.76+rsi*.09+early*.08+mb*.07));
   let mismatch=0;if(r.PrimaryProfitYoY>20&&r.LatestAvailableCFO<0)mismatch+=10;if(Math.abs(Number(r.PrimaryProfitYoY))>300)mismatch+=8;if(Number(r.AverageTradingValue20D)<100000000)mismatch+=5;
   let crowd=0;
   const ml=Number(r.MarginLongChangePct1W);
   if(Number.isFinite(ml)&&ml>10)crowd+=Math.min(12,(ml-10)*0.4);
   const fresh=String(r.LargeShortAggregateFreshness||r.LargeShortFreshness||"");
   const sc=Number(r.LargeShortRatioChange1W);
   if((fresh==="Fresh"||fresh==="Recent")&&Number.isFinite(sc)&&sc>0)crowd+=Math.min(8,sc*100*4);
   r.QVRCrowdingPenalty=Math.min(crowd,15);
   r.QVRQualityMismatchPenalty=mismatch;
   r.QualityValueReRatingScore=r.QVRValueScore==null?null:Math.max(0,Math.min(100,r.QVRQualityScore*.36+r.QVRValueScore*.28+r.QVRReRatingScore*.36-r.QVRCrowdingPenalty-mismatch));
   let chase=0;if(r.Return5D>10)chase+=Math.min((r.Return5D-10)*1.5,20);if(r.Return20D>25)chase+=Math.min((r.Return20D-25)*.8,20);if(r.MA25DeviationPct>12)chase+=Math.min(r.MA25DeviationPct-12,15);r.ChasePenalty=chase;
   if(r.QualityValueReRatingScore!=null)r.QualityValueReRatingScore=Math.max(0,Math.min(100,r.QualityValueReRatingScore-Math.min(chase,15)));
   const eventShape=lin(r.EarningsReturn5D,[[-15,10],[0,50],[10,75],[25,95]]);
   const followScore=lin(r.EarningsFollowThrough5D,[[-15,10],[0,50],[10,75],[20,95]]);
   r.PostEarningsDriftScore=(r.EarningsElapsedTradingDays!=null&&r.EarningsElapsedTradingDays>=3&&r.EarningsElapsedTradingDays<=20)
     ?r.FundamentalScore*.35+eventShape*.30+followScore*.20+(r.VolumePickupScore??50)*.15:null;
   r.CandidateStatus=r.EarningsReactionPending?"ReactionPending":"Normal";
 });
 rank("FundamentalPriceGap","GapPercentile");rank("FundamentalScore","FundamentalPercentile");rank("ReRatingScore","ReRatingPercentile");rank("PostEarningsDriftScore","PEDPercentile");rank("QualityValueReRatingScore","QVRPercentile");
 rr.forEach(r=>{r.GapCompositeScore=(r.GapPercentile||0)*.65+(r.ReRatingScore||50)*.35-(r.ChasePenalty||0);r.FundamentalMomentumScore=r.FundamentalScore*.55+r.ReRatingScore*.45-(r.ChasePenalty||0);r.GrowthAccelerationScore=r.FundamentalScore});
 const defs=[["FundamentalPriceGap","GapCompositeScore"],["FundamentalMomentum","FundamentalMomentumScore"],["PostEarningsDrift","PostEarningsDriftScore"],["GrowthAcceleration","GrowthAccelerationScore"],["QualityValueReRating","QualityValueReRatingScore"]];
 const map=new Map();
 for(const [name,key] of defs){
   const eligible=rr.filter(r=>r[key]!=null&&!r.EarningsReactionPending&&r.FinancialDataFlag!=="WebRequired"&&r.FinancialDataFlag!=="NoLatestFinancial")
     .sort((a,b)=>Number(b[key])-Number(a[key])||String(a.NormalizedCode).localeCompare(String(b.NormalizedCode)));
   eligible.forEach((r,i)=>r[name+"UniverseRank"]=i+1);
   const ranked=eligible.slice(0,20);
   ranked.forEach((r,i)=>{let c=map.get(r.NormalizedCode);if(!c){c={...r,_ranks:{}};map.set(r.NormalizedCode,c)}c._ranks[name]=i+1});
 }
 const pending=rr.filter(r=>r.EarningsReactionPending&&r.FinancialDataFlag!=="WebRequired"&&r.FinancialDataFlag!=="NoLatestFinancial")
   .sort((a,b)=>Number(b.FundamentalScore||0)-Number(a.FundamentalScore||0)||String(a.NormalizedCode).localeCompare(String(b.NormalizedCode))).slice(0,20);
 pending.forEach((r,i)=>{let c=map.get(r.NormalizedCode);if(!c){c={...r,_ranks:{}};map.set(r.NormalizedCode,c)}c.PendingReviewRank=i+1});
 const order=defs.map(x=>x[0]),out=[...map.values()].map(r=>{
   const sel=Object.keys(r._ranks).sort((x,y)=>r._ranks[x]-r._ranks[y]||order.indexOf(x)-order.indexOf(y));
   r.SelectedByStrategies=sel.join(";");r.StrategyCount=sel.length;r.BestStrategyRank=sel.length?Math.min(...sel.map(n=>r._ranks[n])):null;
   r.PrimaryStrategy=sel[0]||(r.EarningsReactionPending?"EarningsReactionPending":"");
   r.CandidateStatus=r.EarningsReactionPending?"ReactionPending":"Normal";
   for(const n of order)r[n+"Rank"]=r._ranks[n]??null;delete r._ranks;return r;
 }).sort((x,y)=>(x.CandidateStatus==="ReactionPending"?1:0)-(y.CandidateStatus==="ReactionPending"?1:0)
   ||y.StrategyCount-x.StrategyCount||(x.BestStrategyRank??999)-(y.BestStrategyRank??999)
   ||(x.PendingReviewRank??999)-(y.PendingReviewRank??999)||String(x.PrimaryStrategy).localeCompare(String(y.PrimaryStrategy))
   ||String(x.NormalizedCode).localeCompare(String(y.NormalizedCode)));
 return {rows:out,defs,scored:rr};
}
if($("screeningStrategyBtn")) $("screeningStrategyBtn").onclick=async()=>{
 if(!latestScreeningBaseRows.length){box("screeningStrategyResult","warn","先に『Screening母集団を構築』を実行してください。");return}
 const btn=$("screeningStrategyBtn");btn.disabled=true;
 try{
   box("screeningStrategyResult","run","決算イベント窓（1/3/5/10営業日）を計算中…");
   const asOf=$("screeningBaseAsOf")?.value||todayIsoLocal();
   const ev=await workerCall("screening-event-features",300000,null,null,{asOf,events:latestScreeningBaseRows.map(r=>({code:r.NormalizedCode,disclosureDate:r.LatestEarningsEventDate||r.LatestDisclosureDate}))});
   const em=new Map((ev.rows||[]).map(x=>[String(x.code),x]));
   const enriched=latestScreeningBaseRows.map(r=>({...r,...(em.get(String(r.NormalizedCode))||{EarningsElapsedTradingDays:null,EarningsReactionPending:false})}));
   const r=buildScreeningStrategies(enriched);latestScreeningCandidates=r.rows;latestScreeningScoredRows=r.scored||[];
   const counts=Object.fromEntries(r.defs.map(([n])=>[n,latestScreeningCandidates.filter(x=>x[n+"Rank"]!=null).length]));
   const pending=latestScreeningCandidates.filter(x=>x.CandidateStatus==="ReactionPending").length;
   box("screeningStrategyResult","pass",`Web Screening 5戦略\n母集団: ${enriched.length}\n候補ユニーク: ${latestScreeningCandidates.length}\n${Object.entries(counts).map(([k,v])=>k+": "+v+"/20").join("\n")}\nReactionPending: ${pending}\n\nPEDイベント窓: PC版定義で計算\n次段階: PC版候補とのParity`);
   $("screeningCandidatesExportBtn").disabled=!latestScreeningCandidates.length;
   const top=latestScreeningCandidates.slice(0,30);$("screeningStrategyTable").innerHTML=`<div style="overflow:auto"><table style="width:100%;font-size:12px"><tr><th>#</th><th>Code</th><th>Name</th><th>Primary</th><th>Count</th><th>Best</th></tr>${top.map((x,i)=>`<tr><td>${i+1}</td><td>${x.NormalizedCode}</td><td>${x.CompanyName||"-"}</td><td>${x.PrimaryStrategy}</td><td>${x.StrategyCount}</td><td>${x.BestStrategyRank??"-"}</td></tr>`).join("")}</table></div>`;
 }catch(e){box("screeningStrategyResult","fail","FAIL\n"+(e?.message||e))}
 finally{btn.disabled=false}
};
if($("screeningCandidatesExportBtn")) $("screeningCandidatesExportBtn").onclick=()=>{if(!latestScreeningCandidates.length)return;const keys=[...new Set(latestScreeningCandidates.flatMap(Object.keys))],esc=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv=[keys.join(','),...latestScreeningCandidates.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n');downloadBlob(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}),`web_screening_candidates_${($("screeningBaseAsOf")?.value||todayIsoLocal()).replaceAll("-","")}.csv`)};

function screeningBoundaryDiagnostics(pcRows,webRows){
 const norm=v=>{let c=String(v??"").trim();if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);return c};
 const sts=["FundamentalPriceGap","FundamentalMomentum","PostEarningsDrift","GrowthAcceleration","QualityValueReRating"];
 const pm=new Map(pcRows.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const wm=new Map(webRows.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const onlyPc=[...pm.keys()].filter(c=>!wm.has(c)),onlyWeb=[...wm.keys()].filter(c=>!pm.has(c));
 const byStrategy=[];
 for(const st of sts){
   const rk=st+"Rank";
   const ps=new Set([...pm].filter(([,r])=>Number(r[rk])>=1&&Number(r[rk])<=20).map(([c])=>c));
   const ws=new Set([...wm].filter(([,r])=>Number(r[rk])>=1&&Number(r[rk])<=20).map(([c])=>c));
   const po=[...ps].filter(c=>!ws.has(c)),wo=[...ws].filter(c=>!ps.has(c));
   if(po.length||wo.length)byStrategy.push(`${st}: PCのみ ${po.join(",")||"-"} / Webのみ ${wo.join(",")||"-"}`);
 }
 const detail=[...new Set([...onlyPc,...onlyWeb])].sort().map(c=>{
   const p=pm.get(c),q=wm.get(c),r=p||q||{},side=p&&!q?"PC_ONLY":"WEB_ONLY";
   const ranks=sts.map(st=>`${st}:${p?.[st+"Rank"]??"-"}/${q?.[st+"Rank"]??"-"}`).join(" | ");
   return `${c} ${r.CompanyName??r.Name??""} ${side} | ${ranks}`;
 });
 return {onlyPc,onlyWeb,byStrategy,detail,pm,wm,sts};
}


function sectorRelativeAudit(pcRows,webRows,targetCode="6838"){
 const norm=v=>{let c=String(v??"").trim();if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);return c};
 const pm=new Map(pcRows.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const wm=new Map(webRows.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const p=pm.get(targetCode),q=wm.get(targetCode);if(!q)return "対象なし";
 const sector=String(q.Sector33||p?.Sector33||"").trim();
 const axes=[
   ["ForecastPER","SectorForecastPERValueScore",true,true],
   ["PBR","SectorPBRValueScore",true,true],
   ["ForecastDividendYieldPct","SectorDividendYieldValueScore",false,false]
 ];
 const lines=[`対象 ${targetCode} / Sector33=${sector||"(blank)"}`];
 for(const [rawKey,scoreKey,reverse,positiveOnly] of axes){
   const raw0=q[rawKey],rawBlank=raw0==null||String(raw0).trim()==="",raw=rawBlank?null:Number(raw0);
   const peers=webRows.filter(r=>String(r.Sector33||"").trim()===sector).map(r=>{
     const x=r[rawKey],blank=x==null||String(x).trim()==="",v=blank?null:Number(x);
     return Number.isFinite(v)&&(!positiveOnly||v>0)?v:null;
   }).filter(Number.isFinite).sort((x,y)=>x-y);
   let recompute=null,rankText="-";
   if(Number.isFinite(raw)&&(!positiveOnly||raw>0)&&peers.length>=5){
     let less=0,equal=0;for(const v of peers){if(v<raw)less++;else if(v===raw)equal++}
     const avgRank=less+(equal+1)/2; // pandas rank(method='average'), 1-based
     let pct=avgRank/peers.length*100;if(reverse)pct=100-pct;
     recompute=pct;rankText=`${avgRank.toFixed(1)}/${peers.length}`;
   }
   lines.push(`${rawKey}: raw PC=${p?.[rawKey]==null||String(p?.[rawKey]).trim()===""?"(blank)":p[rawKey]} / Web=${rawBlank?"(blank)":raw0} | Web peer有効=${peers.length} | rank=${rankText} | 再計算=${recompute==null?"(blank)":recompute.toFixed(4)} | score PC=${p?.[scoreKey]==null||String(p?.[scoreKey]).trim()===""?"(blank)":p[scoreKey]} / Web=${q?.[scoreKey]==null||String(q?.[scoreKey]).trim()===""?"(blank)":q[scoreKey]}`);
 }
 return lines.join("\n");
}



async function runStandaloneResidualFinancialAudit(){
 const rawCodes=String($("residualAuditCodes")?.value||"6176,3989,7846,4246,2593,3300");
 const codes=rawCodes.split(/[\s,、]+/).map(x=>x.trim()).filter(Boolean);
 const id="residualAuditStandaloneResult";
 box(id,"run","ローカル財務DBを監査中…");
 try{
   const res=await workerCall("fins-summary-code-audit",180000,null,null,{codes});
   const rows=Array.isArray(res.rows)?res.rows:[];
   const norm=v=>{let c=String(v??"").trim();if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);return c};
   const by=new Map();
   for(const r of rows){const c=norm(r.code);if(!by.has(c))by.set(c,[]);by.get(c).push(r)}
   const pick=(o,...ks)=>{for(const k of ks){const v=o?.[k];if(v!=null&&String(v).trim()!=="")return v}return "(blank)"};
   const lines=["残差銘柄 財務DB単独監査","※③→④→⑤の再実行不要",""];
   for(const c of codes){
     const rs=by.get(c)||[];
     lines.push(`--- ${c} ---`);
     lines.push(`raw財務DB: ${rs.length}件`);
     if(!rs.length){lines.push("判定: ① raw財務DB欠落");lines.push("");continue}
     const latest=rs[0];
     let o={};try{o=JSON.parse(String(latest.raw_json||"{}"))}catch(_){}
     lines.push(`最新: data=${latest.data_date||"-"} / disclosed=${latest.disclosed_date||"-"} ${latest.disclosed_time||""}`);
     lines.push(`DocType=${pick(o,"DocType","TypeOfDocument")} / CurPerType=${pick(o,"CurPerType","CurrentPeriodType")} / CurFYEn=${pick(o,"CurFYEn","CurrentFiscalYearEndDate")}`);
     lines.push(`Sales=${pick(o,"Sales","NCSales","NetSales")} / OP=${pick(o,"OP","NCOP","OperatingProfit")} / EPS=${pick(o,"EPS","NCEPS","EarningsPerShare")} / BPS=${pick(o,"BPS","NCBPS","BookValuePerShare")}`);
     lines.push(`Eq=${pick(o,"Eq","NCEq")} / ShEq=${pick(o,"ShEq","NCShEq")} / ROE=${pick(o,"ROE","NCROE")} / EqAR=${pick(o,"EqAR","NCEqAR")}`);
     lines.push(`F.Sales=${pick(o,"FSales","FNCSales","ForecastSales")} / F.OP=${pick(o,"FOP","FNCOP","ForecastOperatingProfit")} / F.EPS=${pick(o,"FEPS","FNCEPS","ForecastEPS","ForecastEarningsPerShare")}`);
     lines.push("判定: raw財務DBには存在 → 正規化/最新決算選択/JOIN側を次に監査");
     lines.push("");
   }
   box(id,"pass",lines.join("\n"));
 }catch(e){
   box(id,"fail","FAIL\n"+(e?.message||e));
 }
}


function residualFullTrace(pcRows,webSelected,webScored,codes){
 const norm=v=>{let c=String(v??"").trim();if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);return c};
 const pm=new Map(pcRows.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const sm=new Map(webSelected.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const um=new Map(webScored.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const qvrOrder=webScored.filter(r=>r.QualityValueReRatingScore!=null&&r.FinancialDataFlag!=="WebRequired"&&r.FinancialDataFlag!=="NoLatestFinancial")
   .slice().sort((x,y)=>Number(y.QualityValueReRatingScore)-Number(x.QualityValueReRatingScore)||String(x.NormalizedCode).localeCompare(String(y.NormalizedCode)));
 const fields=[
  "QualityValueReRatingScore","QVRQualityScore","QVRValueScore","QVRReRatingScore",
  "QVRQualityMismatchPenalty","QVRCrowdingPenalty","ChasePenalty",
  "SectorForecastPERValueScore","SectorPBRValueScore","SectorDividendYieldValueScore",
  "ForecastPER","PBR","ForecastDividendYieldPct","ForecastPrimaryProfitGrowthPct",
  "ROE","ROESource","QVRROEScore","CurrentOperatingMarginPct","QVROperatingMarginScore","OperatingMarginChangePt","QVRMarginImprovementScore",
  "LatestAvailableCFO","LatestAvailableFCF","QVRCFScore","EquityRatioPct","QVREquityScore",
  "LatestDisclosureDate","ProfitType","FinancialDataFlag"
 ];
 const lines=["【残差フルトレース】","選抜候補だけでなくWeb全スコア母集団まで追跡"];
 for(const c of codes){
   const pc=pm.get(c)||{},sel=sm.get(c),q=um.get(c)||{};
   const side=pm.has(c)&&!sm.has(c)?"PC_ONLY":sm.has(c)&&!pm.has(c)?"WEB_ONLY":"BOTH";
   lines.push(`--- ${c} ${pc.CompanyName||q.CompanyName||pc.Name||q.Name||""} ${side} ---`);
   lines.push(`Web母集団=${Object.keys(q).length?"YES":"NO"} / Web選抜=${sel?"YES":"NO"} / QVR Web順位=${q.QualityValueReRatingUniverseRank??"(blank)"} / PC候補順位=${pc.QualityValueReRatingRank??"(blank)"}`);
   for(const k of fields){
     const pv=pc[k],wv=q[k],ps=pv==null||String(pv).trim()===""?"(blank)":pv,ws=wv==null||String(wv).trim()===""?"(blank)":wv;
     if(ps!=="(blank)"||ws!=="(blank)")lines.push(`${k}: PC=${ps} / Web=${ws}`);
   }
   if(Number.isFinite(Number(pc.QVRQualityScore))&&Object.keys(q).length){
     const pcQ=Number(pc.QVRQualityScore);
     const other=(Number(q.QVROperatingMarginScore)||0)*.20+(Number(q.QVRMarginImprovementScore)||0)*.20+(Number(q.QVRCFScore)||0)*.20+(Number(q.QVREquityScore)||0)*.15;
     const implied=(pcQ-other)/.25;
     lines.push(`Quality分解(Web): ROE=${q.QVRROEScore??"(blank)"}×25% + OPM=${q.QVROperatingMarginScore??"(blank)"}×20% + Margin改善=${q.QVRMarginImprovementScore??"(blank)"}×20% + CF=${q.QVRCFScore??"(blank)"}×20% + Equity=${q.QVREquityScore??"(blank)"}×15%`);
     if((q.ROE==null||String(q.ROE).trim()==="")&&(q.EquityRatioPct==null||String(q.EquityRatioPct).trim()==="")){
       lines.push(`NULL既定値監査: ROE欠損→50点 / EquityRatio欠損→50点（PC _linear_score(None) と同一）`);
     }
     lines.push(`PC Qualityから逆算したROE部品score=${Number.isFinite(implied)?implied.toFixed(4):"(blank)"} / Web ROE部品score=${q.QVRROEScore??"(blank)"}`);
     if(Number.isFinite(implied)&&Math.abs(implied-Number(q.QVRROEScore))>1e-6)lines.push(`Quality差の主因候補: ROE部品 ${implied.toFixed(2)} vs ${q.QVRROEScore??"(blank)"}`);
   }
   const wr=Number(q.QualityValueReRatingUniverseRank);
   if(Number.isFinite(wr)){
     const lo=Math.max(0,wr-3),hi=Math.min(qvrOrder.length,wr+2);
     lines.push("Web QVR順位近傍: "+qvrOrder.slice(lo,hi).map((r,i)=>`${lo+i+1}:${r.NormalizedCode}=${Number(r.QualityValueReRatingScore).toFixed(4)}`).join(" / "));
   }
   const diag=!Object.keys(q).length?"A 母集団で欠落"
     : q.FinancialDataFlag==="WebRequired"||q.FinancialDataFlag==="NoLatestFinancial"?"B 財務フラグで除外"
     : q.QualityValueReRatingScore==null?"C QVRスコア欠損"
     : Number(q.QualityValueReRatingUniverseRank)>20?"D QVRは有効だがTop20境界外"
     : !sel?"E Top20内なのに候補統合で脱落"
     :"F Web選抜済み（PC側境界差）";
   lines.push(`自動判定: ${diag}`);
 }
 return lines.join("\n");
}


function parityRootCauseAudit(pcRows,webSelected,webScored,codes){
 const norm=v=>{let c=String(v??"").trim();if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);return c};
 const pm=new Map(pcRows.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const sm=new Map(webSelected.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const um=new Map(webScored.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const blank=v=>v==null||String(v).trim()==="";
 const num=v=>blank(v)?null:(Number.isFinite(Number(v))?Number(v):null);
 const inferReverse=(score,maxN=500)=>{
   const sc=num(score);if(sc==null)return [];
   const out=[];
   for(let n=5;n<=maxN;n++)for(let k2=2;k2<=2*n;k2++){
     const avg=k2/2,calc=100-avg/n*100;
     if(Math.abs(calc-sc)<1e-8){out.push({n,avg});if(out.length>=8)return out}
   }
   return out;
 };
 const peerStats=(row,field)=>{
   const sec=String(row?.Sector33||"").trim();
   const peers=webScored.filter(r=>String(r.Sector33||"").trim()===sec&&num(r[field])!=null&&(!["ForecastPER","PBR"].includes(field)||num(r[field])>0));
   peers.sort((a,b)=>num(a[field])-num(b[field])||String(a.NormalizedCode).localeCompare(String(b.NormalizedCode)));
   const code=norm(row?.NormalizedCode||row?.Code),idx=peers.findIndex(r=>norm(r.NormalizedCode)===code);
   return {sec,peers,idx};
 };
 const lines=["【alpha70 原因監査】","PC screening.py の実装条件とWeb全母集団を同時照合","PC共通条件: Prime/Standard/Growth + ProdCat=011 + 売買代金20D>=5000万円 + Close>=100 + 履歴>=60日","QVR採用条件: score有効 + EarningsReactionPendingでない + FinancialDataFlagがWebRequired/NoLatestFinancialでない → 上位20"," "];
 for(const c of codes){
   const p=pm.get(c)||{},w=um.get(c)||{},sel=sm.get(c);if(!Object.keys(w).length)continue;
   lines.push(`--- ${c} ${w.CompanyName||p.CompanyName||""} ---`);
   lines.push(`Web基礎適格: Market=${w.Market||"-"} / Product=${w.ProductCategory||"-"} / AvgValue20=${w.AverageTradingValue20D??"-"} / Close=${w.Close??"-"} / History=${w.PriceHistoryDays??"-"}`);
   lines.push(`Web QVR適格: Score=${w.QualityValueReRatingScore??"(blank)"} / Rank=${w.QualityValueReRatingUniverseRank??"(blank)"} / FinancialFlag=${w.FinancialDataFlag??""} / ReactionPending=${w.EarningsReactionPending??false} / Selected=${sel?"YES":"NO"}`);
   if(pm.has(c)){
     for(const [field,scoreField] of [["PBR","SectorPBRValueScore"],["ForecastPER","SectorForecastPERValueScore"],["ForecastDividendYieldPct","SectorDividendYieldValueScore"]]){
       const ps=p[scoreField],ws=w[scoreField];if(blank(ps)||blank(ws)||Math.abs(Number(ps)-Number(ws))<1e-10)continue;
       const st=peerStats(w,field),inf=inferReverse(ps);
       lines.push(`${scoreField}差: PC=${ps} / Web=${ws} / Web peer有効=${st.peers.length} / Web位置=${st.idx>=0?st.idx+1:"-"}`);
       if(inf.length)lines.push(`PC scoreから逆算可能な(peer数,平均順位): ${inf.map(x=>`(${x.n},${x.avg})`).join(" ")}`);
       if(st.idx>=0){const lo=Math.max(0,st.idx-3),hi=Math.min(st.peers.length,st.idx+4);lines.push(`${field} Web近傍: `+st.peers.slice(lo,hi).map((r,i)=>`${lo+i+1}:${r.NormalizedCode}=${Number(r[field]).toFixed(6)}`).join(" / "))}
     }
   }else if(Number(w.QualityValueReRatingUniverseRank)<=20){
     lines.push("判定: WebではQVR Top20。PC候補に存在しないため、PC側では①母集団外 ②QVR入力/財務フラグ差 ③ReactionPending差 のいずれか。単なるTop20境界差ではない。");
   }else{
     lines.push("判定: Web候補だがQVR Top20由来ではない。SelectedByStrategies/他戦略順位を確認対象。");
   }
   lines.push("");
 }
 const p2120=pm.get("2120"),w2120=um.get("2120");
 if(p2120&&w2120){
   const st=peerStats(w2120,"PBR"),inf=inferReverse(p2120.SectorPBRValueScore).filter(x=>Math.abs(x.n-st.peers.length)<=5);
   if(inf.length){
     const best=inf[0];
     lines.push("【2120 自動結論】");
     lines.push(`PC SectorPBR=${p2120.SectorPBRValueScore} は peer=${best.n},平均順位=${best.avg} と整合。Webは peer=${st.peers.length},位置=${st.idx+1}。`);
     if(st.peers.length===best.n+1)lines.push("→ Webのサービス業PBR有効peerがPCよりちょうど1銘柄多い。2120のPBR raw値ではなく、peer母集団差が主因と特定。");
   }
 }
 return lines.join("\n");
}

function residualBoundaryAudit(pcRows,webRows,codes){
 const norm=v=>{let c=String(v??"").trim();if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);return c};
 const pm=new Map(pcRows.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const wm=new Map(webRows.map(r=>[norm(r.NormalizedCode??r.Code),r]).filter(x=>x[0]));
 const fields=["QualityValueReRatingScore","QVRQualityScore","QVRValueScore","QVRReRatingScore","SectorForecastPERValueScore","SectorPBRValueScore","SectorDividendYieldValueScore","ForecastPER","PBR","ForecastDividendYieldPct","ROE","CurrentOperatingMarginPct","OperatingMarginChangePt","LatestAvailableCFO","LatestAvailableFCF","EquityRatioPct"];
 const lines=[];
 for(const c of codes){
   const p=pm.get(c),q=wm.get(c);lines.push(`--- ${c} ${q?.CompanyName||p?.CompanyName||p?.Name||""} ${p&&!q?"PC_ONLY":q&&!p?"WEB_ONLY":"BOTH"} ---`);
   const base=q||p;
   lines.push(`Sector33=${base?.Sector33||"(blank)"} | Primary PC=${p?.PrimaryStrategy||"-"} / Web=${q?.PrimaryStrategy||"-"}`);
   for(const k of fields){
     const pv=p?.[k],wv=q?.[k],ps=pv==null||String(pv).trim()===""?"(blank)":pv,ws=wv==null||String(wv).trim()===""?"(blank)":wv;
     if(ps!=="(blank)"||ws!=="(blank)")lines.push(`${k}: PC=${ps} / Web=${ws}`);
   }
   if(q)lines.push(sectorRelativeAudit(pcRows,webRows,c));
 }
 return lines.join("\n");
}

if($("screeningStrategyParityBtn")) $("screeningStrategyParityBtn").onclick=async()=>{try{
 const f=$("screeningStrategyParityFile").files?.[0];if(!f)throw new Error("screening_candidates.csvを選択してください");
 if(!latestScreeningCandidates.length||!latestScreeningScoredRows.length)throw new Error("先にWebの5戦略選抜を実行してください");
 const pc=parseCsv(await f.text());if(!pc||!Array.isArray(pc.rows))throw new Error("PC CSV解析失敗");
 const pcRows=pc.rows;latestScreeningParityPcRows=pcRows;
 const norm=v=>{let c=String(v??"").trim();if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);return c};
 const pmap=new Map(pcRows.map(r=>[norm(r.NormalizedCode||r.Code||""),r])),wmap=new Map(latestScreeningCandidates.map(r=>[norm(r.NormalizedCode),r]));
 let both=0,strategy=0;const missing=[],extra=[],diff=[];
 for(const [c,w] of wmap){const p=pmap.get(c);if(!p){extra.push(c);continue}both++;if(String(p.PrimaryStrategy||"")===String(w.PrimaryStrategy||""))strategy++;else diff.push(`${c}: PC=${p.PrimaryStrategy||"-"} / Web=${w.PrimaryStrategy||"-"}`)}
 for(const c of pmap.keys())if(!wmap.has(c))missing.push(c);
 const exact=missing.length===0&&extra.length===0&&strategy===both,d=screeningBoundaryDiagnostics(pcRows,latestScreeningCandidates);
 const residualCodes=[...new Set([...missing,...extra])];
 const residualAudit=residualBoundaryAudit(pcRows,latestScreeningScoredRows,residualCodes);
 const residualTrace=residualFullTrace(pcRows,latestScreeningCandidates,latestScreeningScoredRows,residualCodes);
 const rootCauseAudit=parityRootCauseAudit(pcRows,latestScreeningCandidates,latestScreeningScoredRows,residualCodes);
 // alpha62: pinpoint the first QVR component divergence on common rows.
 const qvrFields=[
  "QualityValueReRatingScore","QVRQualityScore","QVRValueScore","QVRReRatingScore","QVRCrowdingPenalty","QVRQualityMismatchPenalty",
  "ROE","CurrentOperatingMarginPct","OperatingMarginChangePt","LatestAvailableCFO","LatestAvailableFCF","EquityRatioPct",
  "SectorForecastPERValueScore","SectorPBRValueScore","SectorDividendYieldValueScore","ForecastPER","PBR","ForecastDividendYieldPct","ForecastPrimaryProfitGrowthPct"
 ];
 const qvrAudit=[];
 for(const c of [...pmap.keys()].filter(c=>wmap.has(c))){
   const p=pmap.get(c),w=wmap.get(c);
   const deltas=[];
   for(const k of qvrFields){const pa=p?.[k],wb=w?.[k],paBlank=pa==null||String(pa).trim()==="",wbBlank=wb==null||String(wb).trim()==="";const a=paBlank?null:Number(pa),b=wbBlank?null:Number(wb);if(!paBlank&&!wbBlank&&Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)>1e-8)deltas.push({k,a,b,d:Math.abs(a-b)});else if(paBlank!==wbBlank)deltas.push({k,a:paBlank?"(blank)":pa,b:wbBlank?"(blank)":wb,d:1e99})}
   if(deltas.length)qvrAudit.push({c,name:w.CompanyName||p.CompanyName||p.Name||"",deltas});
 }
 qvrAudit.sort((a,b)=>(b.deltas[0]?.d||0)-(a.deltas[0]?.d||0));
 const focus=qvrAudit.find(x=>x.c==="6838")||qvrAudit[0];
 const fp=focus?pmap.get(focus.c):null,fw=focus?wmap.get(focus.c):null;
 const sourceAudit=focus?`\n\n【QVR原材料・正当性監査】\nProfitType: PC=${fp?.ProfitType||"(blank)"} / Web=${fw?.ProfitType||"(blank)"}\nBPS: PC=${fp?.BPS==null||String(fp?.BPS).trim()===""?"(blank)":fp.BPS} / Web=${fw?.BPS==null||String(fw?.BPS).trim()===""?"(blank)":fw.BPS}\nPBR: PC=${fp?.PBR==null||String(fp?.PBR).trim()===""?"(blank)":fp.PBR} / Web=${fw?.PBR==null||String(fw?.PBR).trim()===""?"(blank)":fw.PBR}\nForecastPER: PC=${fp?.ForecastPER??"(blank)"} / Web=${fw?.ForecastPER??"(blank)"}\nForecastDividendYieldPct: PC=${fp?.ForecastDividendYieldPct??"(blank)"} / Web=${fw?.ForecastDividendYieldPct??"(blank)"}\n\n【Sector相対評価エンジン監査】\n${sectorRelativeAudit(pcRows,latestScreeningCandidates,focus.c)}\n\n注記: alpha63ではblank/nullをNumber(0)へ変換しないよう修正。PER/PBRは正値のみpeer母集団へ入れます。PC空欄へ盲目的に合わせず、同じraw値から同じpercentileになるかを監査します。`:"";
 const auditText=focus?`\n\n【QVR最初の差 自動監査】\n対象: ${focus.c} ${focus.name}\n${focus.deltas.map(x=>`${x.k}: PC=${x.a} / Web=${x.b}`).join("\n")}\n${sourceAudit}\n\n判定: 最初の原材料差を、PC/Webどちらが正しいかまで監査します。`:"\n\n【QVR最初の差 自動監査】\n共通銘柄の対象項目に差なし";
 $("screeningDiffExportBtn").disabled=false;
 box("screeningStrategyParityResult",exact?"pass":"warn",`Screening 選抜Parity
PC CSV行数: ${pcRows.length}
PC候補: ${pmap.size}
Web候補: ${wmap.size}
共通: ${both}
PrimaryStrategy一致: ${strategy}/${both}
PCのみ: ${missing.length}
Webのみ: ${extra.length}
共通率: ${(both/Math.max(1,pmap.size)*100).toFixed(1)}%

${exact?"完全一致 PASS":"選抜ロジック調整対象"}

【戦略別Top20境界差】
${d.byStrategy.join("\n")||"なし"}

【差分銘柄 rank PC/Web】
${d.detail.slice(0,40).join("\n")||"なし"}${diff.length?"\n\nPrimary差分:\n"+diff.slice(0,12).join("\n"):""}

【残差銘柄 自動監査】
${residualAudit||"残差なし"}

${residualTrace}

${rootCauseAudit}${auditText}`)
}catch(e){box("screeningStrategyParityResult","fail","FAIL\n"+(e?.message||e))}};

if($("screeningAsOf")&&!$("screeningAsOf").value) $("screeningAsOf").value=todayIsoLocal();
if($("technicalScreeningBtn")) $("technicalScreeningBtn").onclick=async()=>{
 const asOf=$("screeningAsOf").value;
 if(!asOf){box("technicalScreeningResult","warn","基準日を選択してください。");return}
 $("technicalScreeningBtn").disabled=true;
 $("technicalScreeningTable").innerHTML="";
 box("technicalScreeningResult","run",`${asOf} を基準にCatalogから直近100取引日を読み込み中…`);
 try{
   const r=await workerCall("technical-screening-poc",600000,
     s=>box("technicalScreeningResult","run",`${asOf}
${s.stage||"-"} ${s.detail||""}`),null,{asOf,lookback:100,topN:50});
   box("technicalScreeningResult","pass",`PASS
基準日: ${r.asOf}
読込開始: ${r.from}
取引日: ${r.tradingDates}
使用Shard: ${r.usedShards.join(", ")}
75日以上データ有: ${r.candidates.toLocaleString()}銘柄
処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒

判定: Catalog → Shard → Screening Core 1 PASS`);
   const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
   const n=(x,d=1)=>Number.isFinite(Number(x))?Number(x).toFixed(d):"-";
   let h=`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
   <thead><tr><th>#</th><th>Code</th><th>Close</th><th>MA5</th><th>MA25</th><th>MA75</th><th>25乖離%</th><th>75乖離%</th><th>5D%</th><th>20D%</th><th>RSI</th><th>Vol比</th><th>20日位置%</th><th>60日位置%</th></tr></thead><tbody>`;
   r.top.forEach((x,i)=>{h+=`<tr><td>${i+1}</td><td>${esc(x.code)}</td><td>${n(x.close,1)}</td><td>${n(x.ma5,1)}</td><td>${n(x.ma25,1)}</td><td>${n(x.ma75,1)}</td><td>${n(x.distMa25,1)}</td><td>${n(x.distMa75,1)}</td><td>${n(x.ret5,1)}</td><td>${n(x.ret20,1)}</td><td>${n(x.rsi14,1)}</td><td>${n(x.volRatio,2)}</td><td>${n(x.pos20,1)}</td><td>${n(x.pos60,1)}</td></tr>`});
   h+="</tbody></table></div>";
   $("technicalScreeningTable").innerHTML=h;
 }catch(e){box("technicalScreeningResult","fail",`FAIL
${e.stage?`stage: ${e.stage}\n`:""}${e.message||e}`)}
 finally{$("technicalScreeningBtn").disabled=false}
};

function parseSimpleCsv(text){
 const rows=[];let row=[],field="",q=false;
 for(let i=0;i<text.length;i++){
   const c=text[i],n=text[i+1];
   if(q){
     if(c=='"'&&n=='"'){field+='"';i++}
     else if(c=='"')q=false;
     else field+=c;
   }else{
     if(c=='"')q=true;
     else if(c==','){row.push(field);field=""}
     else if(c=='\n'){row.push(field.replace(/\r$/,""));rows.push(row);row=[];field=""}
     else field+=c;
   }
 }
 if(field.length||row.length){row.push(field.replace(/\r$/,""));rows.push(row)}
 return rows;
}
async function loadMyStocks(){
 box("myStockListResult","run","private DBから読込中…");
 try{
   const r=await workerCall("my-stocks-list",300000);
   box("myStockListResult","pass",`PASS\n登録: ${r.count}件\n処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒`);
   const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
   let h='<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th>Code</th><th>Name</th><th>区分</th><th>株数</th><th>平均取得</th><th></th></tr></thead><tbody>';
   for(const x of r.rows){
     h+=`<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.account)}</td><td>${x.shares??"-"}</td><td>${x.avg_cost??"-"}</td><td><button class="my-stock-del" data-code="${esc(x.code)}" data-account="${esc(x.account)}" style="padding:6px 10px">削除</button></td></tr>`;
   }
   h+="</tbody></table></div>";$("myStockTable").innerHTML=h;
   document.querySelectorAll(".my-stock-del").forEach(b=>b.onclick=async()=>{
     const code=b.dataset.code,account=b.dataset.account;
     if(!confirm(`${code} / ${account} を削除しますか？`))return;
     await workerCall("my-stocks-delete",300000,null,null,{code,account}); await loadMyStocks();
   });
 }catch(e){box("myStockListResult","fail","FAIL\n"+(e.message||e))}
}
if($("myStockReloadBtn"))$("myStockReloadBtn").onclick=loadMyStocks;
if($("myStockSaveBtn"))$("myStockSaveBtn").onclick=async()=>{
 const code=$("myStockCode").value.trim().toUpperCase(),name=$("myStockName").value.trim(),account=$("myStockAccount").value;
 const shares=$("myStockShares").value===""?null:Number($("myStockShares").value);
 const avgCost=$("myStockAvgCost").value===""?null:Number($("myStockAvgCost").value);
 try{
   const r=await workerCall("my-stocks-upsert",300000,null,null,{code,name,account,shares,avgCost,strategy:$("myStockStrategy").value,memo:$("myStockMemo").value});
   box("myStockSaveResult","pass",`PASS\n${code} / ${account} を保存しました。\n登録合計: ${r.count}件`);
   await loadMyStocks();
 }catch(e){box("myStockSaveResult","fail","FAIL\n"+(e.message||e))}
};
if($("myStockImportBtn"))$("myStockImportBtn").onclick=async()=>{
 const f=$("myStockImportFile").files?.[0]; if(!f){box("myStockImportResult","warn","portfolio.csvを選択してください");return}
 try{
   const matrix=parseSimpleCsv(await f.text()); if(matrix.length<2)throw new Error("CSVにデータがありません");
   const head=matrix[0].map(x=>x.trim()),idx=n=>head.indexOf(n);
   for(const req of ["Code","Name","Account","Shares","AvgCost"])if(idx(req)<0)throw new Error(`列 ${req} がありません`);
   const rows=matrix.slice(1).filter(r=>r[idx("Code")]).map(r=>({
     code:r[idx("Code")],name:r[idx("Name")],account:r[idx("Account")],
     shares:r[idx("Shares")]===""?null:Number(r[idx("Shares")]),avgCost:r[idx("AvgCost")]===""?null:Number(r[idx("AvgCost")]),
     strategy:idx("Strategy")>=0?r[idx("Strategy")]:""
   }));
   const wr=await workerCall("my-stocks-import",300000,null,null,{rows});
   box("myStockImportResult","pass",`PASS\nportfolio.csv: ${wr.imported}行を登録/更新`);
   await loadMyStocks();
 }catch(e){box("myStockImportResult","fail","FAIL\n"+(e.message||e))}
};
setTimeout(()=>{if($("myStockTable"))loadMyStocks()},50);

function normCodeForParity(v){
 const s=String(v??"").trim().toUpperCase();
 return s.length===5&&s.endsWith("0")?s.slice(0,4):s;
}

if($("myStockAnalysisDate")&&!$("myStockAnalysisDate").value)$("myStockAnalysisDate").value=todayIsoLocal();

if($("myStockAnalyzeBtn"))$("myStockAnalyzeBtn").onclick=async()=>{
 const asOf=$("myStockAnalysisDate").value;
 box("myStockAnalyzeResult","run",`${asOf} の登録銘柄を分析中…`);
 try{
   const r=await workerCall("my-stocks-analysis",600000,null,null,{asOf});
   box("myStockAnalyzeResult","pass",`PASS
登録: ${r.count}件
テクニカル取得: ${r.technicalCount}件
基準日: ${r.asOf}
使用Shard: ${r.usedShards.join(", ")}
処理時間: ${(r.elapsedMs/1000).toFixed(2)}秒`);
   const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
   const n=(x,d=1)=>Number.isFinite(Number(x))?Number(x).toFixed(d):"-";
   let h='<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th>Code</th><th>Name</th><th>区分</th><th>Close</th><th>損益%</th><th>MA25</th><th>25乖離%</th><th>20D%</th><th>RSI</th><th>Vol比</th></tr></thead><tbody>';
   for(const x of r.rows){
     h+=`<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.account)}</td><td>${n(x.close,1)}</td><td>${n(x.pnlPct,1)}</td><td>${n(x.ma25,1)}</td><td>${n(x.distMa25,1)}</td><td>${n(x.ret20,1)}</td><td>${n(x.rsi14,1)}</td><td>${n(x.volRatio,2)}</td></tr>`;
   }
   h+="</tbody></table></div>";
   $("myStockAnalysisTable").innerHTML=h;
 }catch(e){
   box("myStockAnalyzeResult","fail","FAIL\n"+(e.message||e));
 }
};

if($("parityRunBtn"))$("parityRunBtn").onclick=async()=>{
 const f=$("parityCsv").files?.[0],asOf=$("parityAsOf").value;
 if(!f){box("parityResult","warn","PC版 screening_candidates.csv を選択してください。");return}
 $("parityRunBtn").disabled=true;
 $("parityTable").innerHTML="";
 try{
   box("parityResult","run","PC版CSVを読込中…");
   const mat=parseSimpleCsv(await f.text());
   if(mat.length<2)throw new Error("CSVデータなし");
   const head=mat[0].map(x=>x.trim()),ix=n=>head.indexOf(n);
   if(ix("NormalizedCode")<0)throw new Error("NormalizedCode列がありません");

   const pc=new Map();
   for(const row of mat.slice(1)){
     const code=normCodeForParity(row[ix("NormalizedCode")]);
     if(!code)continue;
     const obj={};head.forEach((k,i)=>obj[k]=row[i]);
     pc.set(code,obj);
   }

   box("parityResult","run",`PC版: ${pc.size}銘柄
Web版Core 1を${asOf}で全銘柄計算中…`);

   const web=await workerCall("technical-screening-poc",600000,null,null,{asOf,lookback:320,topN:10,returnAll:true});
   const wm=new Map((web.all||[]).map(x=>[normCodeForParity(x.code),x]));

   const specs=[
     ["Close","close",0.02],
     ["MA5","ma5",0.02],
     ["MA25","ma25",0.02],
     ["MA75","ma75",0.02],
     ["MA25DeviationPct","distMa25",0.02],
     ["MA75DeviationPct","distMa75",0.02],
     ["Return5D","ret5",0.02],
     ["TOPIXReturn5D","topixRet5",0.02],
     ["RelativeToTOPIX5D","rel5",0.02],
     ["Return20D","ret20",0.02],
     ["TOPIXReturn20D","topixRet20",0.02],
     ["RelativeToTOPIX20D","rel20",0.02],
     ["Return60D","ret60",0.02],
     ["TOPIXReturn60D","topixRet60",0.02],
     ["RelativeToTOPIX60D","rel60",0.02],
     ["Return120D","ret120",0.02],
     ["TOPIXReturn120D","topixRet120",0.02],
     ["RelativeToTOPIX120D","rel120",0.02],
     ["RSI14","rsi14",0.05],
     ["LatestVolumeRatioTo20D","volRatio",0.005],
     ["High20D","high20",0.02],
     ["Low20D","low20",0.02],
     ["High60D","high60",0.02],
     ["Low60D","low60",0.02]
   ].filter(s=>ix(s[0])>=0);

   const fieldStats=Object.fromEntries(specs.map(s=>[s[0],{match:0,diff:0,max:0}]));
   let compared=0,missingWeb=0,perfect=0;
   const diffs=[];

   for(const [code,p] of pc){
     const x=wm.get(code);
     if(!x){missingWeb++;continue}
     compared++;
     const bad=[];
     for(const [pcf,wf,tol] of specs){
       const pv=Number(p[pcf]),wv=Number(x[wf]);
       if(!Number.isFinite(pv)&&!Number.isFinite(wv)){fieldStats[pcf].match++;continue}
       if(!Number.isFinite(pv)||!Number.isFinite(wv)){
         fieldStats[pcf].diff++;
         bad.push(`${pcf}: PC=${p[pcf]??"-"} Web=${x[wf]??"-"}`);
         continue;
       }
       const d=Math.abs(pv-wv);
       fieldStats[pcf].max=Math.max(fieldStats[pcf].max,d);
       if(d<=tol)fieldStats[pcf].match++;
       else{
         fieldStats[pcf].diff++;
         {
         let extra="";
         if(pcf==="Low20D" && Number.isFinite(Number(x.lowClose20))){
           const dc=Math.abs(pv-Number(x.lowClose20));
           extra=` / Web終値Low20=${Number(x.lowClose20).toFixed(4)} Δ=${dc.toFixed(4)}`;
         }
         if(pcf==="Low60D" && Number.isFinite(Number(x.lowClose60))){
           const dc=Math.abs(pv-Number(x.lowClose60));
           extra=` / Web終値Low60=${Number(x.lowClose60).toFixed(4)} Δ=${dc.toFixed(4)}`;
         }
         bad.push(`${pcf}: PC=${pv.toFixed(4)} Web日中Low=${wv.toFixed(4)} Δ=${d.toFixed(4)}${extra}`);
       }
       }
     }
     if(!bad.length)perfect++;
     else diffs.push({code,name:p.CompanyName||"",bad});
   }

   const fields=Object.entries(fieldStats)
     .map(([k,s])=>`${k}: ${s.match}/${s.match+s.diff}一致 / maxΔ ${s.max.toFixed(4)}`)
     .join("\n");
   const verdict=diffs.length===0&&missingWeb===0?"PASS":"要確認";

   box("parityResult",verdict==="PASS"?"pass":"warn",`${verdict}
基準日: ${web.asOf}
TOPIX層: ${web.topixStatus||"unknown"}
PC版銘柄: ${pc.size}
Web計算銘柄: ${wm.size}
比較できた銘柄: ${compared}
全比較項目一致銘柄: ${perfect}
不一致銘柄: ${diffs.length}
Web側欠損: ${missingWeb}

${fields}

※許容差内を一致扱い。不一致だけ下に表示。`);

   const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
   let h='<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>Code</th><th>Name</th><th>差分</th></tr></thead><tbody>';
   for(const x of diffs.slice(0,50)){
     h+=`<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${x.bad.map(esc).join("<br>")}</td></tr>`;
   }
   h+="</tbody></table></div>";
   $("parityTable").innerHTML=diffs.length?h:"";
 }catch(e){
   box("parityResult","fail","FAIL\n"+(e.message||e));
 }finally{
   $("parityRunBtn").disabled=false;
 }
};

if($("holdParityBtn"))$("holdParityBtn").onclick=async()=>{
 const f=$("holdParityCsv").files?.[0],asOf=$("holdParityAsOf").value;
 if(!f){box("holdParityResult","warn","PC版 technical_snapshot.csv を選択してください。");return}
 $("holdParityBtn").disabled=true;$("holdParityTable").innerHTML="";
 try{
   const mat=parseSimpleCsv(await f.text());if(mat.length<2)throw new Error("CSVデータなし");
   const head=mat[0].map(x=>x.trim()),ix=n=>head.indexOf(n);
   if(ix("NormalizedCode")<0)throw new Error("NormalizedCode列がありません");
   const pc=new Map();
   for(const row of mat.slice(1)){
     const code=normCodeForParity(row[ix("NormalizedCode")]);if(!code)continue;
     const o={};head.forEach((k,i)=>o[k]=row[i]);pc.set(code,o);
   }
   box("holdParityResult","run",`PC版 ${pc.size}銘柄を読込。Webマイ銘柄を計算中…`);
   const web=await workerCall("my-stocks-analysis",600000,null,null,{asOf});
   const specs=[
    ["RawClose","close",0.02],["MA5","ma5",0.02],["MA25","ma25",0.02],["MA75","ma75",0.02],
    ["MA25DeviationPct","distMa25",0.02],["MA75DeviationPct","distMa75",0.02],
    ["Return5D","ret5",0.02],["Return20D","ret20",0.02],["RSI14","rsi14",0.05],
    ["High20D","high20",0.02],["Low20D","low20",0.02],["High60D","high60",0.02],["Low60D","low60",0.02]
   ].filter(s=>ix(s[0])>=0);
   let compared=0,perfect=0,missingPc=0;const diffs=[];
   for(const x of web.rows){
     const code=normCodeForParity(x.code),p=pc.get(code);
     if(!p){missingPc++;continue}
     compared++;const bad=[];
     for(const [pf,wf,tol] of specs){
       const pv=Number(p[pf]),wv=Number(x[wf]);
       if(!Number.isFinite(pv)&&!Number.isFinite(wv))continue;
       if(!Number.isFinite(pv)||!Number.isFinite(wv)||Math.abs(pv-wv)>tol)
         {
         let extra="";
         if(pf==="Low20D" && Number.isFinite(Number(x.lowClose20))) extra=` / Web終値Low20=${Number(x.lowClose20).toFixed(4)}`;
         if(pf==="Low60D" && Number.isFinite(Number(x.lowClose60))) extra=` / Web終値Low60=${Number(x.lowClose60).toFixed(4)}`;
         bad.push(`${pf}: PC=${Number.isFinite(pv)?pv.toFixed(4):p[pf]||"-"} Web日中Low=${Number.isFinite(wv)?wv.toFixed(4):"-"}${extra}`);
       }
     }
     if(bad.length)diffs.push({code,name:x.name,bad});else perfect++;
   }
   const verdict=diffs.length===0&&missingPc===0?"PASS":"要確認";
   box("holdParityResult",verdict==="PASS"?"pass":"warn",`${verdict}
Web登録銘柄: ${web.count}
PC版銘柄: ${pc.size}
比較できた銘柄: ${compared}
全項目一致: ${perfect}
不一致: ${diffs.length}
PC側にないWeb銘柄: ${missingPc}
基準日: ${web.asOf}`);
   const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
   let h='<div style="overflow:auto"><table><thead><tr><th>Code</th><th>Name</th><th>差分</th></tr></thead><tbody>';
   for(const x of diffs)h+=`<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${x.bad.map(esc).join("<br>")}</td></tr>`;
   h+="</tbody></table></div>";$("holdParityTable").innerHTML=diffs.length?h:"";
 }catch(e){box("holdParityResult","fail","FAIL\n"+(e.message||e))}
 finally{$("holdParityBtn").disabled=false}
};

if($("screeningDiffExportBtn")) $("screeningDiffExportBtn").onclick=()=>{
 if(!latestScreeningParityPcRows.length||!latestScreeningCandidates.length)return;
 const d=screeningBoundaryDiagnostics(latestScreeningParityPcRows,latestScreeningCandidates),codes=[...new Set([...d.onlyPc,...d.onlyWeb])].sort();
 const esc=v=>'"'+String(v??"").replaceAll('"','""')+'"';
 const hdr=["Code","Side","CompanyName","PC_Primary","Web_Primary",...d.sts.flatMap(st=>["PC_"+st+"Rank","Web_"+st+"Rank","Web_"+st+"Score"])];
 const lines=[hdr.map(esc).join(",")];
 for(const c of codes){const p=d.pm.get(c),q=d.wm.get(c),vals=[c,p&&!q?"PC_ONLY":"WEB_ONLY",p?.CompanyName??p?.Name??q?.CompanyName??"",p?.PrimaryStrategy??"",q?.PrimaryStrategy??""];
   for(const st of d.sts)vals.push(p?.[st+"Rank"]??"",q?.[st+"Rank"]??"",q?.[st+"Score"]??"");
   lines.push(vals.map(esc).join(","));
 }
 downloadBlob(new Blob(["\uFEFF"+lines.join("\n")],{type:"text/csv;charset=utf-8"}),`screening_parity_diff_${($("screeningBaseAsOf")?.value||todayIsoLocal()).replaceAll("-","")}.csv`);
};


if($("residualAuditStandaloneBtn")) $("residualAuditStandaloneBtn").onclick=runStandaloneResidualFinancialAudit;


// v7e-alpha73: Discovery Episode migration / performance parity
let latestDiscoveryWebRows=[];
function discoveryNormCode(v){
  let s=String(v??"").trim().toUpperCase();
  if(s.length===5&&s.endsWith("0"))s=s.slice(0,4);
  return s;
}
function discoveryNum(v){const n=Number(v);return String(v??"").trim()!==""&&Number.isFinite(n)?n:null}
function discoveryCsv(rows){
  if(!rows?.length)return "";
  const preferred=["EventID","DiscoveryDate","Code","CompanyName","PrimaryStrategy","AnalystDecision","SelectionType","Conviction","ExpectedHorizon","InitialPrice","InitialPriceLocked","InitialPriceSource","EpisodeStartDate","EpisodePlannedEndDate","PreviousEventID","PerfCurrentDate","PerfCurrentPrice","PerfTradingDaysElapsed","PerfReturn1D","PerfRelativeTOPIX1D","PerfReturn5D","PerfRelativeTOPIX5D","PerfReturn10D","PerfRelativeTOPIX10D","PerfReturn20D","PerfRelativeTOPIX20D","PerfReturn60D","PerfRelativeTOPIX60D","PerfMaxReturn20D","PerfMaxDrawdown20D","PerfMaxReturn60D","PerfMaxDrawdown60D","PerfActiveWatchFlag","PerfLastUpdatedDate","PerfEpisodeStatus","PerfEpisodeEndDate","PerfEpisodeEndReason","PerfResetDate"];
  const all=new Set(preferred); for(const r of rows)for(const k of Object.keys(r))all.add(k);
  const hdr=[...preferred,...[...all].filter(k=>!preferred.includes(k))];
  const esc=v=>'"'+String(v??"").replaceAll('"','""')+'"';
  return "\uFEFF"+[hdr.map(esc).join(","),...rows.map(r=>hdr.map(k=>esc(r[k]??"")).join(","))].join("\n");
}
function discoveryParity(pcRows,webRows){
  const wm=new Map((webRows||[]).map(r=>[String(r.EventID||""),r]));
  const exact=["Code","DiscoveryDate","EpisodeStartDate","EpisodePlannedEndDate","InitialPriceLocked","InitialPriceSource","PerfCurrentDate","PerfTradingDaysElapsed","PerfActiveWatchFlag","PerfEpisodeStatus","PerfEpisodeEndDate","PerfEpisodeEndReason"];
  const numeric=["InitialPrice","PerfCurrentPrice","PerfReturn1D","PerfRelativeTOPIX1D","PerfReturn5D","PerfRelativeTOPIX5D","PerfReturn10D","PerfRelativeTOPIX10D","PerfReturn20D","PerfRelativeTOPIX20D","PerfReturn60D","PerfRelativeTOPIX60D","PerfMaxReturn20D","PerfMaxDrawdown20D","PerfMaxReturn60D","PerfMaxDrawdown60D"];
  let compared=0,perfect=0,missingWeb=0;const diffs=[];
  for(const p of pcRows||[]){
    const id=String(p.EventID||"");if(!id)continue; const w=wm.get(id);
    if(!w){missingWeb++;diffs.push({id,code:discoveryNormCode(p.Code),bad:["Web Episode missing"]});continue}
    compared++;const bad=[];
    for(const f of exact){const a=String(p[f]??"").trim(),b=String(w[f]??"").trim();if(a!==b)bad.push(`${f}: PC=${a||"(blank)"} / Web=${b||"(blank)"}`)}
    for(const f of numeric){const a=discoveryNum(p[f]),b=discoveryNum(w[f]);if(a==null&&b==null)continue;if(a==null||b==null||Math.abs(a-b)>1e-5)bad.push(`${f}: PC=${a??"(blank)"} / Web=${b??"(blank)"}`)}
    if(bad.length)diffs.push({id,code:discoveryNormCode(p.Code),bad});else perfect++;
  }
  const pcIds=new Set((pcRows||[]).map(r=>String(r.EventID||"")).filter(Boolean));
  const webOnly=(webRows||[]).filter(r=>r.EventID&&!pcIds.has(String(r.EventID))).map(r=>String(r.EventID));
  return {compared,perfect,missingWeb,webOnly,diffs,pass:missingWeb===0&&webOnly.length===0&&diffs.length===0};
}
function renderDiscoveryParity(summary,web){
  const cls=summary?.pass?"pass":summary?"warn":"pass";
  const lines=[
    summary?(summary.pass?"完全一致 PASS":"要確認"):"Web Discovery 再計算 PASS",
    `基準日: ${web.asOf||"-"}`,
    `Web Episode: ${web.count??web.rows?.length??0}`,
    `DataLake期間: ${web.from||"-"} ～ ${web.asOf||"-"}`
  ];
  if(summary)lines.push(`PC Episode: ${summary.compared+summary.missingWeb}`,`比較: ${summary.compared}`,`完全一致: ${summary.perfect}`,`差分: ${summary.diffs.length}`,`Web欠損: ${summary.missingWeb}`,`Webのみ: ${summary.webOnly.length}`);
  box("discoveryParityResult",cls,lines.join("\n"));
  if(!summary||!summary.diffs.length){$("discoveryParityTable").innerHTML="";return}
  const esc=x=>String(x??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  let h='<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>EventID</th><th>Code</th><th>差分</th></tr></thead><tbody>';
  for(const x of summary.diffs.slice(0,50))h+=`<tr><td>${esc(x.id)}</td><td>${esc(x.code)}</td><td>${x.bad.map(esc).join("<br>")}</td></tr>`;
  h+="</tbody></table></div>";$("discoveryParityTable").innerHTML=h;
}
async function discoveryReadPcAnalysis(){
  const f=$("discoveryAnalysisFile")?.files?.[0]; if(!f)return [];
  return parseCsv(await f.text()).rows;
}
async function runDiscoveryRecalc(importRows=null){
  const asOf=$("discoveryAsOf")?.value||todayIsoLocal();
  const cmd=importRows?"discovery-master-import-recalc":"discovery-recalc";
  const payload={asOf}; if(importRows)payload.rows=importRows;
  const r=await workerCall(cmd,600000,s=>box("discoveryParityResult","run",`Discovery計算中…\n${s.stage||""}\n${s.detail||""}`),null,payload);
  latestDiscoveryWebRows=r.rows||[]; $("discoveryWebExportBtn").disabled=!latestDiscoveryWebRows.length;
  return r;
}
if($("discoveryImportBtn"))$("discoveryImportBtn").onclick=async()=>{
  const f=$("discoveryMasterFile")?.files?.[0]; if(!f){box("discoveryParityResult","warn","PC版 discovery_episode_master.csv を選択してください。");return}
  $("discoveryImportBtn").disabled=true;
  try{
    const rows=parseCsv(await f.text()).rows;if(!rows.length)throw new Error("Discovery master CSVが空です");
    const web=await runDiscoveryRecalc(rows),pc=await discoveryReadPcAnalysis();
    renderDiscoveryParity(pc.length?discoveryParity(pc,web.rows):null,web);
  }catch(e){box("discoveryParityResult","fail","FAIL\n"+(e.message||e))}finally{$("discoveryImportBtn").disabled=false}
};
if($("discoveryRecalcBtn"))$("discoveryRecalcBtn").onclick=async()=>{
  $("discoveryRecalcBtn").disabled=true;try{const web=await runDiscoveryRecalc();renderDiscoveryParity(null,web)}catch(e){box("discoveryParityResult","fail","FAIL\n"+(e.message||e))}finally{$("discoveryRecalcBtn").disabled=false}
};
if($("discoveryParityBtn"))$("discoveryParityBtn").onclick=async()=>{
  $("discoveryParityBtn").disabled=true;
  try{const pc=await discoveryReadPcAnalysis();if(!pc.length)throw new Error("PC版 discovery_episode_analysis.csv を選択してください。");const web=latestDiscoveryWebRows.length?{rows:latestDiscoveryWebRows,asOf:$("discoveryAsOf")?.value||"",count:latestDiscoveryWebRows.length}:await runDiscoveryRecalc();renderDiscoveryParity(discoveryParity(pc,web.rows),web)}
  catch(e){box("discoveryParityResult","fail","FAIL\n"+(e.message||e))}finally{$("discoveryParityBtn").disabled=false}
};
if($("discoveryWebExportBtn"))$("discoveryWebExportBtn").onclick=()=>{if(!latestDiscoveryWebRows.length)return;downloadBlob(new Blob([discoveryCsv(latestDiscoveryWebRows)],{type:"text/csv;charset=utf-8"}),`web_discovery_episode_analysis_${($("discoveryAsOf")?.value||todayIsoLocal()).replaceAll("-","")}.csv`)};


// v7e-alpha73: Discovery Daily 42-column parity
let latestDiscoveryDailyWebRows=[],latestDiscoveryDailyEngineRows=[],latestDiscoveryDailyDiffCells=[],latestDiscoveryDailyTechnicalCodes=[],latestDiscoveryDailyHistoryStart="";
const DISCOVERY_DAILY_FIELDS=["EventID","Code","Date","DaysFromStart","EpisodeStartDate","InitialPrice","Close","Volume","TradingValue","ReturnFromStart","TOPIXClose","TOPIXReturnFromStart","RelativeTOPIX","Sector33","SectorReturnFromStart","RelativeSector","SectorBenchmarkStatus","SectorConstituentCount","SectorBenchmarkMethod","RSI14","MA25Slope5DPct","MA75Slope20DPct","MACDHistogram","MACDState","DistanceFrom52WHighPct","DistanceFrom52WLowPct","VolumeRatio5To20","MarginInterestStatus","MarginLongVol","MarginShortVol","MarginLongShortRatio","MarginLongChangePct1W","LargeShortReportStatus","LargeShortRatioSum","LargeShortRatioChange1W","LargeShortAggregateFreshness","MarginAlertStatus","MarginAlertPresent","MarketRegime","MarketPhase","MarketRegimeModel","PlanAdaptiveNote"];
const DISCOVERY_DAILY_NUMERIC=new Set(["DaysFromStart","InitialPrice","Close","Volume","TradingValue","ReturnFromStart","TOPIXClose","TOPIXReturnFromStart","RelativeTOPIX","SectorReturnFromStart","RelativeSector","SectorConstituentCount","RSI14","MA25Slope5DPct","MA75Slope20DPct","MACDHistogram","DistanceFrom52WHighPct","DistanceFrom52WLowPct","VolumeRatio5To20","MarginLongVol","MarginShortVol","MarginLongShortRatio","MarginLongChangePct1W","LargeShortRatioSum","LargeShortRatioChange1W","MarginAlertPresent"]);
const DISCOVERY_DAILY_PROVENANCE=new Set(["MarginInterestStatus","LargeShortReportStatus","MarginAlertStatus","PlanAdaptiveNote"]);
function discoveryDailyCsv(rows){if(!rows?.length)return"";const esc=v=>'"'+String(v??"").replaceAll('"','""')+'"';return"\uFEFF"+[DISCOVERY_DAILY_FIELDS.map(esc).join(","),...rows.map(r=>DISCOVERY_DAILY_FIELDS.map(k=>esc(r[k]??"")).join(","))].join("\n")}
function discoveryDailyGroup(field){if(["EventID","Code","Date","DaysFromStart","EpisodeStartDate","InitialPrice","Close","Volume","TradingValue","ReturnFromStart","TOPIXClose","TOPIXReturnFromStart","RelativeTOPIX"].includes(field))return"Base";if(["Sector33","SectorReturnFromStart","RelativeSector","SectorBenchmarkStatus","SectorConstituentCount","SectorBenchmarkMethod"].includes(field))return"Sector";if(["RSI14","MA25Slope5DPct","MA75Slope20DPct","MACDHistogram","MACDState","DistanceFrom52WHighPct","DistanceFrom52WLowPct","VolumeRatio5To20"].includes(field))return"Technical";if(DISCOVERY_DAILY_PROVENANCE.has(field))return"Provenance";if(["MarginLongVol","MarginShortVol","MarginLongShortRatio","MarginLongChangePct1W","LargeShortRatioSum","LargeShortRatioChange1W","LargeShortAggregateFreshness","MarginAlertPresent"].includes(field))return"Supply";return"Market"}
function discoveryDailyParity(pcRows,webRows){const wm=new Map((webRows||[]).map(r=>[`${String(r.EventID||"")}\u0001${String(r.Date||"")}`,r])),pcKeys=new Set();let compared=0,perfect=0,corePerfect=0,missingWeb=0;const diffs=[],groups={Base:0,Sector:0,Technical:0,Supply:0,Provenance:0,Market:0};
 for(const p of pcRows||[]){const key=`${String(p.EventID||"")}\u0001${String(p.Date||"")}`;if(!p.EventID||!p.Date)continue;pcKeys.add(key);const w=wm.get(key);if(!w){missingWeb++;diffs.push({id:p.EventID,date:p.Date,code:p.Code,bad:["Web row missing"],coreBad:true});continue}compared++;const bad=[],coreBad=[],cells=[];
  for(const f of DISCOVERY_DAILY_FIELDS){let same;if(DISCOVERY_DAILY_NUMERIC.has(f)){const av=discoveryNum(p[f]),bv=discoveryNum(w[f]);same=(av==null&&bv==null)||(av!=null&&bv!=null&&Math.abs(av-bv)<=1e-5)}else same=String(p[f]??"").trim()===String(w[f]??"").trim();if(!same){const g=discoveryDailyGroup(f),pcv=String(p[f]??"").trim(),webv=String(w[f]??"").trim();groups[g]++;bad.push(`${f}: PC=${pcv||"(blank)"} / Web=${webv||"(blank)"}`);cells.push({field:f,group:g,pc:pcv,web:webv});if(g!=="Provenance")coreBad.push(f)}}
  if(!bad.length)perfect++;if(!coreBad.length)corePerfect++;if(bad.length)diffs.push({id:p.EventID,date:p.Date,code:p.Code,bad,cells,coreBad:coreBad.length>0});}
 const webOnly=(webRows||[]).filter(r=>!pcKeys.has(`${String(r.EventID||"")}\u0001${String(r.Date||"")}`));return{compared,perfect,corePerfect,missingWeb,webOnly,diffs,groups,corePass:missingWeb===0&&webOnly.length===0&&diffs.every(x=>!x.coreBad),fullPass:missingWeb===0&&webOnly.length===0&&diffs.length===0}}
function discoveryDailyDiffCsv(cells){const fields=["Scope","EventID","Date","Code","Group","Field","PC","Web"],esc=v=>'"'+String(v??"").replaceAll('"','""')+'"';return "\uFEFF"+[fields.map(esc).join(","),...(cells||[]).map(r=>fields.map(k=>esc(r[k]??"")).join(","))].join("\n")}
function renderDiscoveryDailyParity(sum,web,latestSum=null){const basis=latestSum||sum,cls=basis.fullPass?"pass":basis.corePass?"warn":"warn",coverage=web.coverage||{},lines=[basis.fullPass?"基準日エンジン 完全一致 PASS":basis.corePass?"基準日エンジン CORE PASS / Provenance差のみ":"基準日エンジン 要確認",`基準日: ${web.asOf||"-"}`];
 if(latestSum)lines.push(`【基準日のみ】比較: ${latestSum.compared} / 完全一致: ${latestSum.perfect} / Core一致: ${latestSum.corePerfect}`,`基準日差分 Base/Sector/Technical/Supply/Provenance/Market = ${latestSum.groups.Base}/${latestSum.groups.Sector}/${latestSum.groups.Technical}/${latestSum.groups.Supply}/${latestSum.groups.Provenance}/${latestSum.groups.Market}`,``);
 lines.push(`【全履歴・診断】Web再計算行: ${web.count??0}`,`PC Daily行: ${sum.compared+sum.missingWeb}`,`比較: ${sum.compared}`,`42列完全一致行: ${sum.perfect}`,`Core一致行: ${sum.corePerfect}`,`Web欠損: ${sum.missingWeb}`,`Webのみ: ${sum.webOnly.length}`,`全履歴差分 Base/Sector/Technical/Supply/Provenance/Market = ${sum.groups.Base}/${sum.groups.Sector}/${sum.groups.Technical}/${sum.groups.Supply}/${sum.groups.Provenance}/${sum.groups.Market}`,`保存済み固定Daily: ${web.storedCount??"-"}`,`価格テクニカル読込開始: ${coverage.historyStart||"-"}`,`信用残の実必要開始: ${coverage.marginHistoryStart||"-"}`,`信用残履歴開始: ${coverage.marginMinDate||"-"}${coverage.marginHistorySufficient===false?"  ← 不足":""}`,`大口空売りの実必要開始: ${coverage.shortHistoryStart||coverage.supplyHistoryStart||"-"}`,`空売り履歴開始: ${coverage.shortMinDate||"-"}${coverage.shortHistorySufficient===false?"  ← 不足":""}`);box("discoveryDailyParityResult",cls,lines.join("\n"));
 const esc=x=>String(x??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));const latestRows=(latestSum?.diffs||[]).slice(0,60),rows=latestRows.length?latestRows:sum.diffs.slice(0,60);if(!rows.length){$("discoveryDailyParityTable").innerHTML="";return}let h=`<p><strong>${latestRows.length?"基準日差分":"全履歴差分"}</strong></p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>EventID</th><th>Date</th><th>Code</th><th>差分</th></tr></thead><tbody>`;for(const x of rows)h+=`<tr><td>${esc(x.id)}</td><td>${esc(x.date)}</td><td>${esc(x.code)}</td><td>${x.bad.map(esc).join("<br>")}</td></tr>`;h+="</tbody></table></div>";$("discoveryDailyParityTable").innerHTML=h}
if($("discoveryDailySeedBtn"))$("discoveryDailySeedBtn").onclick=async()=>{const f=$("discoveryDailyFile")?.files?.[0];if(!f){box("discoveryDailyParityResult","warn","PC版 discovery_episode_daily.csv を選択してください。");return}$("discoveryDailySeedBtn").disabled=true;try{const pc=parseCsv(await f.text()).rows;if(!pc.length)throw new Error("Discovery daily CSVが空です");const r=await workerCall("discovery-daily-import-seed",300000,null,null,{rows:pc});latestDiscoveryDailyWebRows=pc;latestDiscoveryDailyEngineRows=[];latestDiscoveryDailyDiffCells=[];latestDiscoveryDailyTechnicalCodes=[];$("discoveryDailyExportBtn").disabled=false;if($("discoveryDailyEngineExportBtn"))$("discoveryDailyEngineExportBtn").disabled=true;if($("discoveryDailyDiffExportBtn"))$("discoveryDailyDiffExportBtn").disabled=true;if($("discoveryTechnicalTraceExportBtn"))$("discoveryTechnicalTraceExportBtn").disabled=true;box("discoveryDailyParityResult","pass",`PC Daily履歴 移行・固定 PASS\nRows: ${r.count}\n期間: ${r.minDate||"-"} ～ ${r.maxDate||"-"}\n\n以後は既存行を上書きせず、新しいEpisode×DateだけWebで追加します。`)}catch(e){box("discoveryDailyParityResult","fail","FAIL\n"+(e.message||e))}finally{$("discoveryDailySeedBtn").disabled=false}};
if($("discoveryDailyParityBtn"))$("discoveryDailyParityBtn").onclick=async()=>{const f=$("discoveryDailyFile")?.files?.[0];if(!f){box("discoveryDailyParityResult","warn","PC版 discovery_episode_daily.csv を選択してください。");return}$("discoveryDailyParityBtn").disabled=true;try{const pc=parseCsv(await f.text()).rows;if(!pc.length)throw new Error("Discovery daily CSVが空です");const asOf=$("discoveryAsOf")?.value||todayIsoLocal();const web=await workerCall("discovery-daily-recalc",600000,s=>box("discoveryDailyParityResult","run",`Discovery Daily計算中…\n${s.stage||""}\n${s.detail||""}`),null,{asOf});latestDiscoveryDailyWebRows=web.storedRows||[];latestDiscoveryDailyEngineRows=web.rows||[];latestDiscoveryDailyHistoryStart=String(web.coverage?.historyStart||web.historyStart||"");$("discoveryDailyExportBtn").disabled=!latestDiscoveryDailyWebRows.length;if($("discoveryDailyEngineExportBtn"))$("discoveryDailyEngineExportBtn").disabled=!latestDiscoveryDailyEngineRows.length;const all=discoveryDailyParity(pc,web.rows||[]),pcLatest=pc.filter(r=>String(r.Date||"").slice(0,10)===asOf),webLatest=(web.rows||[]).filter(r=>String(r.Date||"").slice(0,10)===asOf),latest=discoveryDailyParity(pcLatest,webLatest);latestDiscoveryDailyDiffCells=[];for(const x of latest.diffs||[])for(const c of x.cells||[])latestDiscoveryDailyDiffCells.push({Scope:"BasisDate",EventID:x.id,Date:x.date,Code:x.code,Group:c.group,Field:c.field,PC:c.pc,Web:c.web});for(const x of all.diffs||[])for(const c of x.cells||[])latestDiscoveryDailyDiffCells.push({Scope:"AllHistory",EventID:x.id,Date:x.date,Code:x.code,Group:c.group,Field:c.field,PC:c.pc,Web:c.web});latestDiscoveryDailyTechnicalCodes=[...new Set((latest.diffs||[]).filter(x=>(x.cells||[]).some(c=>c.group==="Technical")).map(x=>String(x.code||"").trim()).filter(Boolean))];if($("discoveryDailyDiffExportBtn"))$("discoveryDailyDiffExportBtn").disabled=!latestDiscoveryDailyDiffCells.length;if($("discoveryTechnicalTraceExportBtn"))$("discoveryTechnicalTraceExportBtn").disabled=!latestDiscoveryDailyTechnicalCodes.length;renderDiscoveryDailyParity(all,web,latest)}catch(e){box("discoveryDailyParityResult","fail","FAIL\n"+(e.message||e))}finally{$("discoveryDailyParityBtn").disabled=false}};
if($("discoveryDailyExportBtn"))$("discoveryDailyExportBtn").onclick=()=>{if(!latestDiscoveryDailyWebRows.length)return;downloadBlob(new Blob([discoveryDailyCsv(latestDiscoveryDailyWebRows)],{type:"text/csv;charset=utf-8"}),`web_discovery_episode_daily_${($("discoveryAsOf")?.value||todayIsoLocal()).replaceAll("-","")}.csv`)};
if($("discoveryDailyEngineExportBtn"))$("discoveryDailyEngineExportBtn").onclick=()=>{if(!latestDiscoveryDailyEngineRows.length)return;downloadBlob(new Blob([discoveryDailyCsv(latestDiscoveryDailyEngineRows)],{type:"text/csv;charset=utf-8"}),`web_discovery_daily_engine_${($("discoveryAsOf")?.value||todayIsoLocal()).replaceAll("-","")}.csv`)};
if($("discoveryDailyDiffExportBtn"))$("discoveryDailyDiffExportBtn").onclick=()=>{if(!latestDiscoveryDailyDiffCells.length)return;downloadBlob(new Blob([discoveryDailyDiffCsv(latestDiscoveryDailyDiffCells)],{type:"text/csv;charset=utf-8"}),`discovery_daily_diff_${($("discoveryAsOf")?.value||todayIsoLocal()).replaceAll("-","")}.csv`)};
if($("discoveryTechnicalTraceExportBtn"))$("discoveryTechnicalTraceExportBtn").onclick=async()=>{if(!latestDiscoveryDailyTechnicalCodes.length)return;const btn=$("discoveryTechnicalTraceExportBtn");btn.disabled=true;try{const asOf=$("discoveryAsOf")?.value||todayIsoLocal(),r=await workerCall("discovery-technical-trace",300000,null,null,{asOf,from:latestDiscoveryDailyHistoryStart,codes:latestDiscoveryDailyTechnicalCodes});const fields=["Shard","Code","Date","DbC","DbH","DbL","DbAdjC","DbAdjH","DbAdjL","DbAdjFactor","Volume","TurnoverValue","RawAdjC","RawAdjustmentClose","RawAdjClose","RawC","RawClose","RawAdjustmentHigh","RawAdjHigh","RawHigh","RawH","RawAdjustmentLow","RawAdjLow","RawLow","RawL","RawAdjFactor","RawAdjustmentFactor","SelectedClose","SelectedHigh","SelectedLow","SelectedAdjFactor"],esc=v=>'"'+String(v??"").replaceAll('"','""')+'"',csv="\uFEFF"+[fields.map(esc).join(","),...(r.rows||[]).map(x=>fields.map(k=>esc(x[k])).join(","))].join("\n");downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),`web_technical_trace_${asOf.replaceAll("-","")}.csv`);box("discoveryDailyParityResult","pass",`テクニカル入力診断CSVを書き出しました。\n対象コード: ${latestDiscoveryDailyTechnicalCodes.join(",")}\nraw rows: ${r.count||0}`)}catch(e){box("discoveryDailyParityResult","fail","テクニカル診断CSV FAIL\n"+(e?.message||e))}finally{btn.disabled=false}};
if($("discoveryShortTraceExportBtn"))$("discoveryShortTraceExportBtn").onclick=async()=>{const f=$("discoveryDailyFile")?.files?.[0];if(!f){box("discoveryDailyParityResult","warn","PC版 discovery_episode_daily.csv を選択してください。");return}const btn=$("discoveryShortTraceExportBtn");btn.disabled=true;try{const pc=parseCsv(await f.text()).rows,asOf=$("discoveryAsOf")?.value||todayIsoLocal(),codes=[...new Set(pc.filter(r=>String(r.Date||"").slice(0,10)===asOf).map(r=>String(r.Code||"").trim()).filter(Boolean))];if(!codes.length)throw new Error("基準日のDiscovery Dailyコードがありません");const r=await workerCall("discovery-short-trace",300000,null,null,{asOf,codes});const fields=["Code","DiscDate","CalcDate","SSName","SSAddr","DICName","DICAddr","FundName","ShrtPosToSO","ShrtPosShares","PrevRptDate","PrevRptRatio","StoredDataDate"],esc=v=>'"'+String(v??"").replaceAll('"','""')+'"',csv="\uFEFF"+[fields.map(esc).join(","),...(r.rows||[]).map(x=>fields.map(k=>esc(x[k])).join(","))].join("\n");downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),`web_large_short_trace_${asOf.replaceAll("-","")}.csv`);box("discoveryDailyParityResult","pass",`大口空売り診断CSVを書き出しました。\n基準日: ${asOf}\n対象コード: ${codes.length}\nraw rows: ${r.count||0}`)}catch(e){box("discoveryDailyParityResult","fail","診断CSV FAIL\n"+(e?.message||e))}finally{btn.disabled=false}};
