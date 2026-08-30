const DBNAME="jq_market_v7c.sqlite";
const $=id=>document.getElementById(id);
const state={env:null,imported:null,opened:null,quick:null};
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
 const t0=performance.now();
 try{
  const r=await root(),h=await r.getFileHandle(DBNAME,{create:true}),w=await h.createWritable({keepExistingData:false});
  const reader=f.stream().getReader();
  let written=0, chunks=0;
  while(true){
    const {done,value}=await reader.read(); if(done)break;
    await w.write(value); written+=value.byteLength; chunks++;
    const pct=f.size?Math.min(100,written/f.size*100):0;
    $("importMeter").style.width=pct.toFixed(2)+"%";
    if(chunks%8===0){
      box("importResult","run",`Import中…
${fmt(written)} / ${fmt(f.size)}
${pct.toFixed(1)}%
チャンク: ${chunks}
経過: ${((performance.now()-t0)/1000).toFixed(1)}秒`);
      await new Promise(requestAnimationFrame);
    }
  }
  await w.close();
  const out=await h.getFile(),outHead=new Uint8Array(await out.slice(0,16).arrayBuffer());
  const ok=out.size===f.size&&sqliteHeaderOk(outHead);
  const sec=(performance.now()-t0)/1000;
  state.imported={ok,size:out.size,sourceSize:f.size,seconds:sec,chunks};
  box("importResult",ok?"pass":"fail",
`${ok?"PASS":"FAIL"}
Import先: ${DBNAME}
サイズ: ${fmt(out.size)} (${out.size.toLocaleString()} bytes)
元サイズ一致: ${out.size===f.size?"PASS":"FAIL"}
SQLite header: ${sqliteHeaderOk(outHead)?"PASS":"FAIL"}
処理時間: ${sec.toFixed(1)}秒
全体ArrayBuffer化: なし`);
 }catch(e){state.imported={ok:false,error:String(e)};box("importResult","fail","Import FAIL\n"+e)}
 finally{$("importBtn").disabled=false}
}

function workerCall(cmd,timeoutMs=180000,onStatus=null){
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
  w.postMessage({cmd,dbName:"/"+DBNAME});
 });
}


async function sqliteProxyCheck(){
 try{const targets=[{url:"/sqlite/index.mjs",type:"javascript",patch:"classic-opfs-query-added"},{url:"/sqlite/sqlite3.wasm",type:"application/wasm"},{url:"/sqlite/sqlite3-opfs-async-proxy.js?vfs=opfs",type:"javascript"}],lines=[];
 for(const t of targets){const r=await fetch(t.url,{cache:"no-store"}),ct=(r.headers.get("content-type")||"").toLowerCase(),px=r.headers.get("x-jq-sqlite-proxy")||"-",patch=r.headers.get("x-jq-sqlite-patch")||"-";const typeOk=t.type==="application/wasm"?ct.includes("application/wasm"):ct.includes("javascript");if(!r.ok||!typeOk||px!=="3.53.0-build1"||(t.patch&&patch!==t.patch))throw new Error(`${t.url}: HTTP=${r.status} type=${ct} proxy=${px} patch=${patch}`);lines.push(`${t.url}: PASS / ${ct} / proxy=${px} / patch=${patch}`);} box("proxyResult","pass","Same-origin SQLite assets: PASS\n"+lines.join("\n"));}
 catch(e){box("proxyResult","fail","Same-origin SQLite assets: FAIL\n"+e)}}
$("proxyBtn").onclick=sqliteProxyCheck;


async function initOnly(){box("initResult","run","SQLite-WASM classic OPFS初期化中…");try{const r=await workerCall("init",180000,s=>box("initResult","run",`Stage: ${s.stage}\n${s.detail||""}`));state.init=r;const ok=r.vfs?.opfs&&r.opfsClass;box("initResult",ok?"pass":"fail",`${ok?"PASS":"FAIL"}\nSQLite version: ${r.sqliteVersion}\nclassic opfs VFS: ${r.vfs?.opfs?"PASS":"FAIL"}\nopfs-wl VFS: ${r.vfs?.opfsWl?"有効":"無効（意図通り）"}\nOpfsDb class: ${r.opfsClass?"PASS":"FAIL"}\n初期化時間: ${(r.elapsedMs/1000).toFixed(2)}秒`);}catch(e){state.init={ok:false,error:String(e)};box("initResult","fail","SQLite Init FAIL\n"+e)}}
$("initBtn").onclick=initOnly;

async function openDb(){
 box("openResult","run","SQLite-WASMを起動してDBを開いています…");
 try{
  const f=await existingOpfsFile(); if(!f)throw new Error("Import済みDBがありません。先にStep 2を実行してください。");
  const r=await workerCall("open",180000,(s)=>{
   box("openResult","run",`SQLite-WASM起動中…\nStage: ${s.stage}\n${s.detail||""}`);
  });
  state.opened=r;
  box("openResult","pass",
`PASS
SQLite version: ${r.sqliteVersion}
OPFS VFS: ${r.opfsAvailable?"PASS":"FAIL"}
DB filename: ${r.filename}
DB size: ${fmt(f.size)}
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
 const env=state.env?.ready===true, imp=state.imported?.ok===true, ini=state.init?.ok===true, op=state.opened?.ok===true;
 const q=state.quick?.quick==="ok";
 box("summaryResult",env&&imp&&ini&&op?"pass":"warn",
`Cloudflare/OPFS前提: ${env?"PASS":"未PASS"}
1.12GB Streaming Import: ${imp?"PASS":"未PASS"}
SQLite-WASM Init(opfs-wl): ${ini?"PASS":"未PASS"}
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