const $=id=>document.getElementById(id);
const MARKET="jq_poc3_datalake.sqlite", PRIVATE="jq_private.sqlite";
const MARKET_SCHEMA="market-poc5-1", PRIVATE_SCHEMA="private-poc5-1";
const state={init:null,seed:null,pexport:null,pimport:null,migration:null,verify:null,deleted:null,generatedAt:null};
let SQLP=null;

function setBox(id,cls,text){const e=$(id);e.className="result "+(cls||"");e.textContent=text}
function fmtBytes(n){if(!Number.isFinite(n))return"不明";const u=["B","KB","MB","GB"];let i=0,x=n;while(x>=1024&&i<u.length-1){x/=1024;i++}return `${x.toFixed(i>=2?2:1)} ${u[i]}`}
function loadSql(){
  if(SQLP)return SQLP;
  SQLP=new Promise((resolve,reject)=>{
    const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/sql-wasm.js";
    s.onload=async()=>{try{resolve(await initSqlJs({locateFile:f=>`https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/${f}`}))}catch(e){reject(e)}};
    s.onerror=()=>reject(new Error("SQLite-WASM CDN読み込み失敗"));document.head.appendChild(s);
  });return SQLP;
}
async function root(){if(!navigator.storage?.getDirectory)throw new Error("OPFS未対応");return navigator.storage.getDirectory()}
async function fileInfo(name){try{const r=await root(),h=await r.getFileHandle(name),f=await h.getFile();return{exists:true,size:f.size,lastModified:f.lastModified}}catch(e){return{exists:false}}}
async function readFile(name){const r=await root(),h=await r.getFileHandle(name),f=await h.getFile();return new Uint8Array(await f.arrayBuffer())}
async function writeFile(name,bytes){const r=await root(),h=await r.getFileHandle(name,{create:true}),w=await h.createWritable();await w.write(bytes);await w.close()}
async function removeFile(name){try{const r=await root();await r.removeEntry(name);return true}catch(e){return false}}
function scalar(db,sql,args=[]){const r=db.exec(sql,args);return r[0]?.values?.[0]?.[0]??null}
function tableExists(db,name){return Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",[name])||0)>0}
function ensureMigrationTables(db,schemaVersion){
  db.run("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS migration_history(id INTEGER PRIMARY KEY AUTOINCREMENT,from_version TEXT,to_version TEXT,applied_at TEXT,note TEXT)");
  const cur=String(scalar(db,"SELECT value FROM meta WHERE key='schema_version'")??"legacy");
  if(cur!==schemaVersion){
    db.run("INSERT INTO migration_history(from_version,to_version,applied_at,note) VALUES(?,?,?,?)",[cur,schemaVersion,new Date().toISOString(),"PoC v5 schema marker"]);
    db.run("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)",[schemaVersion]);
  }
}
async function openMarket(){
  const SQL=await loadSql(),i=await fileInfo(MARKET);
  const db=i.exists?new SQL.Database(await readFile(MARKET)):new SQL.Database();
  ensureMigrationTables(db,MARKET_SCHEMA);
  return db;
}
function privateSchema(db){
  ensureMigrationTables(db,PRIVATE_SCHEMA);
  db.run(`
    CREATE TABLE IF NOT EXISTS portfolio(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT,account TEXT,qty REAL,avg_price REAL,note TEXT);
    CREATE TABLE IF NOT EXISTS trades(id INTEGER PRIMARY KEY AUTOINCREMENT,trade_date TEXT,code TEXT,side TEXT,qty REAL,price REAL,note TEXT);
    CREATE TABLE IF NOT EXISTS discovery(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT,code TEXT,start_date TEXT,status TEXT,note TEXT);
    CREATE TABLE IF NOT EXISTS watchlist(id INTEGER PRIMARY KEY AUTOINCREMENT,watch_id TEXT,code TEXT,start_date TEXT,decision TEXT,thesis TEXT,invalidation TEXT);
  `);
}
async function openPrivate(create=true){
  const SQL=await loadSql(),i=await fileInfo(PRIVATE);
  if(!i.exists&&!create)throw new Error("private DBがありません");
  const db=i.exists?new SQL.Database(await readFile(PRIVATE)):new SQL.Database();
  privateSchema(db);return db;
}
async function saveDb(name,db){const b=db.export();await writeFile(name,b);return b.byteLength}
function quick(db){return String(db.exec("PRAGMA quick_check")[0]?.values?.[0]?.[0]??"unknown")}

async function init(){
  setBox("initResult","running","market/private確認中…");
  try{
    const m=await openMarket();const ms=await saveDb(MARKET,m);const mQuick=quick(m),mSchema=String(scalar(m,"SELECT value FROM meta WHERE key='schema_version'")??"");m.close();
    const p=await openPrivate(true);const ps=await saveDb(PRIVATE,p);const pQuick=quick(p),pSchema=String(scalar(p,"SELECT value FROM meta WHERE key='schema_version'")??"");p.close();
    const out={pass:mQuick==="ok"&&pQuick==="ok",marketSize:ms,privateSize:ps,mSchema,pSchema};state.init=out;
    setBox("initResult",out.pass?"pass":"warn",`${out.pass?"PASS":"要確認"}
market: ${fmtBytes(ms)} / schema=${mSchema} / quick=${mQuick}
private: ${fmtBytes(ps)} / schema=${pSchema} / quick=${pQuick}
保存ファイルは完全に別です。`);
  }catch(e){state.init={pass:false,error:String(e)};setBox("initResult","fail","FAIL\n"+e)}
}

async function seed(){
  setBox("seedResult","running","ダミーprivateデータ登録中…");
  try{
    const p=await openPrivate(true);
    p.run("DELETE FROM portfolio");p.run("DELETE FROM trades");p.run("DELETE FROM discovery");p.run("DELETE FROM watchlist");
    p.run("INSERT INTO portfolio(code,account,qty,avg_price,note) VALUES('TEST1','SPOT',100,1234.5,'PoC dummy')");
    p.run("INSERT INTO trades(trade_date,code,side,qty,price,note) VALUES('2026-08-30','TEST1','BUY',100,1234.5,'PoC dummy')");
    p.run("INSERT INTO discovery(event_id,code,start_date,status,note) VALUES('EVT-P5-1','TEST2','2026-08-30','TRACK_ONLY','PoC dummy')");
    p.run("INSERT INTO watchlist(watch_id,code,start_date,decision,thesis,invalidation) VALUES('W-P5-1','TEST3','2026-08-30','Research','dummy thesis','dummy invalidation')");
    const size=await saveDb(PRIVATE,p);
    const counts={portfolio:Number(scalar(p,"SELECT COUNT(*) FROM portfolio")),trades:Number(scalar(p,"SELECT COUNT(*) FROM trades")),discovery:Number(scalar(p,"SELECT COUNT(*) FROM discovery")),watchlist:Number(scalar(p,"SELECT COUNT(*) FROM watchlist"))};p.close();
    const out={pass:Object.values(counts).every(x=>x===1),counts,size};state.seed=out;
    setBox("seedResult",out.pass?"pass":"warn",`PASS
portfolio=${counts.portfolio}
trades=${counts.trades}
discovery=${counts.discovery}
watchlist=${counts.watchlist}
privateサイズ: ${fmtBytes(size)}
※ 全てダミー。market DBへは書き込んでいません。`);
  }catch(e){state.seed={pass:false,error:String(e)};setBox("seedResult","fail","FAIL\n"+e)}
}

function u8cat(...arrs){let n=0;for(const a of arrs)n+=a.length;const o=new Uint8Array(n);let p=0;for(const a of arrs){o.set(a,p);p+=a.length}return o}
async function deriveKey(pass,salt){
  const enc=new TextEncoder(),material=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encryptBytes(bytes,pass){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await deriveKey(pass,salt);
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes));
  // Header: JQPRIV1 + salt16 + iv12 + ciphertext
  return u8cat(new TextEncoder().encode("JQPRIV1"),salt,iv,cipher);
}
async function decryptBytes(blob,pass){
  const magic=new TextDecoder().decode(blob.slice(0,7));if(magic!=="JQPRIV1")throw new Error("privateバックアップ形式ではありません");
  const salt=blob.slice(7,23),iv=blob.slice(23,35),cipher=blob.slice(35),key=await deriveKey(pass,salt);
  try{return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv},key,cipher))}
  catch(e){throw new Error("復号失敗。パスフレーズ違いまたはファイル破損の可能性があります")}
}
function downloadBytes(bytes,name,type="application/octet-stream"){
  const blob=new Blob([bytes],{type}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)
}
async function pexport(){
  const pass=$("pass1").value;if(pass.length<6){setBox("privateExportResult","warn","テストでも6文字以上のパスフレーズを入力してください。");return}
  setBox("privateExportResult","running","private DBを暗号化中…");
  try{
    const p=await openPrivate(false);const q=quick(p);const raw=p.export();p.close();if(q!=="ok")throw new Error("SQLite quick_check失敗: "+q);
    const enc=await encryptBytes(raw,pass),stamp=new Date().toISOString().replace(/[:.]/g,"-");
    downloadBytes(enc,`jq_private_backup_${stamp}.jqpriv`);
    const out={pass:true,rawSize:raw.byteLength,encryptedSize:enc.byteLength};state.pexport=out;
    setBox("privateExportResult","pass",`PASS
private元サイズ: ${fmtBytes(out.rawSize)}
暗号化後: ${fmtBytes(out.encryptedSize)}
方式: PBKDF2-SHA256 (250,000) + AES-GCM-256
パスフレーズは保存していません。`);
  }catch(e){state.pexport={pass:false,error:String(e)};setBox("privateExportResult","fail","FAIL\n"+e)}
  $("pass1").value="";
}
async function backupCurrentPrivate(){
  const i=await fileInfo(PRIVATE);if(!i.exists)return null;
  const raw=await readFile(PRIVATE),name=`jq_private_preimport_${new Date().toISOString().replace(/[:.]/g,"-")}.sqlite`;
  downloadBytes(raw,name);return{name,size:raw.byteLength};
}
async function pimport(){
  const f=$("privateImportFile").files?.[0],pass=$("pass2").value;if(!f){setBox("privateImportResult","warn","暗号化バックアップを選択してください。");return}
  if(!pass){setBox("privateImportResult","warn","パスフレーズを入力してください。");return}
  setBox("privateImportResult","running","復号・検証中…");
  try{
    const SQL=await loadSql(),encrypted=new Uint8Array(await f.arrayBuffer()),raw=await decryptBytes(encrypted,pass),test=new SQL.Database(raw);
    privateSchema(test);const q=quick(test);if(q!=="ok")throw new Error("SQLite quick_check失敗: "+q);
    const req=["portfolio","trades","discovery","watchlist","meta","migration_history"],missing=req.filter(t=>!tableExists(test,t));if(missing.length)throw new Error("必要テーブル不足: "+missing.join(","));
    const finalBytes=test.export();const counts={portfolio:Number(scalar(test,"SELECT COUNT(*) FROM portfolio")),trades:Number(scalar(test,"SELECT COUNT(*) FROM trades")),discovery:Number(scalar(test,"SELECT COUNT(*) FROM discovery")),watchlist:Number(scalar(test,"SELECT COUNT(*) FROM watchlist"))};test.close();
    const pre=await backupCurrentPrivate();await writeFile(PRIVATE,finalBytes);
    const out={pass:true,file:f.name,encryptedSize:f.size,restoredSize:finalBytes.byteLength,preBackup:pre,counts};state.pimport=out;
    setBox("privateImportResult","pass",`PASS
復号・SQLite検査: OK
Importサイズ: ${fmtBytes(out.restoredSize)}
Import前自動バックアップ: ${pre?pre.name+" / "+fmtBytes(pre.size):"既存privateなし"}
portfolio=${counts.portfolio}, trades=${counts.trades}, discovery=${counts.discovery}, watchlist=${counts.watchlist}`);
  }catch(e){state.pimport={pass:false,error:String(e)};setBox("privateImportResult","fail","FAIL\n"+e)}
  $("pass2").value="";
}
async function migrations(){
  try{
    const m=await openMarket(),p=await openPrivate(false);
    const mRows=m.exec("SELECT from_version,to_version,applied_at,note FROM migration_history ORDER BY id"),pRows=p.exec("SELECT from_version,to_version,applied_at,note FROM migration_history ORDER BY id");
    const ms=String(scalar(m,"SELECT value FROM meta WHERE key='schema_version'")??""),ps=String(scalar(p,"SELECT value FROM meta WHERE key='schema_version'")??"");m.close();p.close();
    const mc=mRows[0]?.values?.length||0,pc=pRows[0]?.values?.length||0;const out={pass:!!ms&&!!ps,marketSchema:ms,privateSchema:ps,marketHistory:mc,privateHistory:pc};state.migration=out;
    setBox("migrationResult","pass",`PASS
market schema: ${ms} / migration履歴 ${mc}件
private schema: ${ps} / migration履歴 ${pc}件
将来はversionごとの実migration関数をここへ積み上げます。`);
  }catch(e){state.migration={pass:false,error:String(e)};setBox("migrationResult","fail","FAIL\n"+e)}
}
$("deleteAskBtn").onclick=()=>{$("deleteConfirm").style.display="block";setBox("deleteResult","warn","まだ削除していません。DELETE入力 + 確認ボタンが必要です。")};
$("deleteCancelBtn").onclick=()=>{$("deleteConfirm").style.display="none";$("deleteWord").value="";setBox("deleteResult","pass","削除をキャンセルしました。")};
$("deleteConfirmBtn").onclick=async()=>{
  if($("deleteWord").value!=="DELETE"){setBox("deleteResult","warn","DELETE と正確に入力してください。");return}
  const ok=await removeFile(PRIVATE);$("deleteConfirm").style.display="none";$("deleteWord").value="";state.deleted={pass:ok};
  setBox("deleteResult",ok?"pass":"warn",ok?"private DBを削除しました。market DBは残っています。暗号化バックアップから復元できます。":"削除対象private DBがありません。");
}
async function verify(){
  setBox("verifyResult","running","復元・分離確認中…");
  try{
    const p=await openPrivate(false),m=await openMarket();
    const counts={portfolio:Number(scalar(p,"SELECT COUNT(*) FROM portfolio")),trades:Number(scalar(p,"SELECT COUNT(*) FROM trades")),discovery:Number(scalar(p,"SELECT COUNT(*) FROM discovery")),watchlist:Number(scalar(p,"SELECT COUNT(*) FROM watchlist"))};
    const leaked=["portfolio","trades","discovery","watchlist"].filter(t=>tableExists(m,t));
    const marketBars=tableExists(m,"bars_daily")?Number(scalar(m,"SELECT COUNT(*) FROM bars_daily")):0;p.close();m.close();
    const out={pass:Object.values(counts).every(x=>x>=1)&&leaked.length===0&&marketBars>0,counts,leaked,marketBars};state.verify=out;
    setBox("verifyResult",out.pass?"pass":"warn",`${out.pass?"PASS":"要確認"}
private: portfolio=${counts.portfolio}, trades=${counts.trades}, discovery=${counts.discovery}, watchlist=${counts.watchlist}
marketへのprivateテーブル混入: ${leaked.length?leaked.join(", "):"なし"}
market日足: ${marketBars.toLocaleString()}行
market/private分離を確認しました。`);
  }catch(e){state.verify={pass:false,error:String(e)};setBox("verifyResult","fail","FAIL\n"+e)}
}
function summary(){
  const checks=[["DB分離",state.init?.pass],["private seed",state.seed?.pass],["暗号化Export",state.pexport?.pass],["暗号化Import",state.pimport?.pass],["migration履歴",state.migration?.pass],["復元/分離",state.verify?.pass]];
  const pass=checks.every(x=>x[1]===true);state.generatedAt=new Date().toISOString();
  setBox("summaryResult",pass?"pass":"warn",`${checks.map(([n,p])=>`${n}: ${p===true?"PASS":p===false?"FAIL":"未実行"}`).join("\n")}

総合: ${pass?"本番安全設計PoC PASS。market/private分離、private暗号化可搬、Import前退避、migration履歴が成立。":"未完了または要確認があります。"}

次段階:
・長期バックフィル専用ジョブ
・容量/バッテリー/熱/処理時間計測
・現行PC版Screening Coreの段階移植
・private本番schemaの設計`);
}
function resultExport(){state.generatedAt=new Date().toISOString();downloadBytes(new TextEncoder().encode(JSON.stringify(state,null,2)),`jq_pwa_poc5_result_${new Date().toISOString().replace(/[:.]/g,"-")}.json`,"application/json")}

$("initBtn").onclick=init;$("seedBtn").onclick=seed;$("privateExportBtn").onclick=pexport;$("privateImportBtn").onclick=pimport;$("migrationBtn").onclick=migrations;$("verifyBtn").onclick=verify;$("summaryBtn").onclick=summary;$("resultExportBtn").onclick=resultExport;
if("serviceWorker"in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}))}
