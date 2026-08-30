const $=id=>document.getElementById(id);
const DBFILE="jq_poc3_datalake.sqlite";
const SCHEMA_VERSION="poc4-1";
const state={open:null,exportDb:null,importDb:null,continuity:null,screen:null,delete:null,generatedAt:null};
let SQLP=null;

function setBox(id,cls,text){const e=$(id);e.className="result "+(cls||"");e.textContent=text}
function fmtBytes(n){if(!Number.isFinite(n))return"不明";const u=["B","KB","MB","GB"];let i=0,x=n;while(x>=1024&&i<u.length-1){x/=1024;i++}return `${x.toFixed(i>=2?2:1)} ${u[i]}`}
function addDaysISO(s,n){const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function loadSql(){
  if(SQLP)return SQLP;
  SQLP=new Promise((resolve,reject)=>{
    const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/sql-wasm.js";
    s.onload=async()=>{try{resolve(await initSqlJs({locateFile:f=>`https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/${f}`}))}catch(e){reject(e)}};
    s.onerror=()=>reject(new Error("SQLite-WASM CDN読み込み失敗"));document.head.appendChild(s);
  });return SQLP;
}
async function root(){if(!navigator.storage?.getDirectory)throw new Error("OPFS未対応");return navigator.storage.getDirectory()}
async function info(){try{const r=await root();const h=await r.getFileHandle(DBFILE);const f=await h.getFile();return{exists:true,size:f.size,lastModified:f.lastModified}}catch(e){return{exists:false}}}
async function readBytes(){const r=await root();const h=await r.getFileHandle(DBFILE);const f=await h.getFile();return new Uint8Array(await f.arrayBuffer())}
async function writeBytes(bytes){const r=await root();const h=await r.getFileHandle(DBFILE,{create:true});const w=await h.createWritable();await w.write(bytes);await w.close()}
async function removeDb(){try{const r=await root();await r.removeEntry(DBFILE);return true}catch(e){return false}}
function scalar(db,sql,args=[]){const r=db.exec(sql,args);return r[0]?.values?.[0]?.[0]??null}
function tableExists(db,name){return Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",[name])||0)>0}
function ensureMeta(db){
  db.run("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT)");
  db.run("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)",[SCHEMA_VERSION]);
  db.run("INSERT OR IGNORE INTO meta(key,value) VALUES('created_by','J-Quants Local-first PWA')");
}
async function openDb(create=true){
  const SQL=await loadSql(),i=await info();
  if(!i.exists&&!create)throw new Error("DataLakeがありません");
  const db=i.exists?new SQL.Database(await readBytes()):new SQL.Database();
  ensureMeta(db);
  if(!tableExists(db,"sync_log")) db.run("CREATE TABLE IF NOT EXISTS sync_log(dataset TEXT,sync_date TEXT,status TEXT,row_count INTEGER,synced_at TEXT,note TEXT,PRIMARY KEY(dataset,sync_date))");
  return db;
}
function inspectDb(db){
  const req=["meta","sync_log","equities_master","bars_daily","fins_summary"];
  const missing=req.filter(t=>!tableExists(db,t));
  const quick=db.exec("PRAGMA quick_check");
  const integrity=String(quick[0]?.values?.[0]?.[0]??"unknown");
  return{
    missing,integrity,
    schema:String(scalar(db,"SELECT value FROM meta WHERE key='schema_version'")??"unknown"),
    master:tableExists(db,"equities_master")?Number(scalar(db,"SELECT COUNT(*) FROM equities_master")||0):0,
    bars:tableExists(db,"bars_daily")?Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0):0,
    fins:tableExists(db,"fins_summary")?Number(scalar(db,"SELECT COUNT(*) FROM fins_summary")||0):0,
    sync:tableExists(db,"sync_log")?Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE status='OK'")||0):0
  };
}

async function openCheck(){
  setBox("openResult","running","確認中…");
  try{
    const db=await openDb(true);const check=inspectDb(db);const bytes=db.export();await writeBytes(bytes);db.close();const i=await info();
    const out={...check,size:i.size,pass:check.integrity==="ok"&&check.missing.length===0};state.open=out;
    setBox("openResult",out.pass?"pass":"warn",`${out.pass?"PASS":"要確認"}
schema: ${out.schema}
quick_check: ${out.integrity}
不足テーブル: ${out.missing.length?out.missing.join(", "):"なし"}
Master: ${out.master.toLocaleString()}
日足: ${out.bars.toLocaleString()}
財務: ${out.fins.toLocaleString()}
同期OKレコード: ${out.sync.toLocaleString()}
DBサイズ: ${fmtBytes(out.size)}`);
  }catch(e){state.open={pass:false,error:String(e)};setBox("openResult","fail","FAIL\n"+e)}
}

async function exportDb(){
  setBox("exportDbResult","running","DataLakeを書き出しています…");
  try{
    const db=await openDb(false);ensureMeta(db);const check=inspectDb(db);const bytes=db.export();db.close();
    if(check.integrity!=="ok")throw new Error("整合性チェック失敗: "+check.integrity);
    const blob=new Blob([bytes],{type:"application/octet-stream"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    a.download=`jq_market_datalake_${stamp}.sqlite`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    const out={pass:true,size:bytes.byteLength,schema:check.schema,bars:check.bars,master:check.master,fins:check.fins};state.exportDb=out;
    setBox("exportDbResult","pass",`PASS
Exportサイズ: ${fmtBytes(out.size)}
schema: ${out.schema}
Master: ${out.master.toLocaleString()}
日足: ${out.bars.toLocaleString()}
財務: ${out.fins.toLocaleString()}
保存先はiOSのダウンロード/ファイル保存UIで選べます。`);
  }catch(e){state.exportDb={pass:false,error:String(e)};setBox("exportDbResult","fail","FAIL\n"+e)}
}

async function importDb(){
  const f=$("importFile").files?.[0];if(!f){setBox("importDbResult","warn","SQLiteファイルを選択してください。");return}
  setBox("importDbResult","running","Import前検証中…");
  try{
    const SQL=await loadSql();const bytes=new Uint8Array(await f.arrayBuffer());const db=new SQL.Database(bytes);
    if(!tableExists(db,"meta"))db.run("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT)");
    const preSchema=String(scalar(db,"SELECT value FROM meta WHERE key='schema_version'")??"legacy/poc3");
    const required=["sync_log","equities_master","bars_daily","fins_summary"];const missing=required.filter(t=>!tableExists(db,t));
    const quick=String(db.exec("PRAGMA quick_check")[0]?.values?.[0]?.[0]??"unknown");
    if(quick!=="ok")throw new Error("SQLite quick_check失敗: "+quick);
    if(missing.length)throw new Error("必要テーブル不足: "+missing.join(", "));
    // PoC migration: legacy/v3 DB gets current schema marker; structural tables are unchanged.
    db.run("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)",[SCHEMA_VERSION]);
    db.run("INSERT OR REPLACE INTO meta(key,value) VALUES('imported_at',?)",[new Date().toISOString()]);
    const check=inspectDb(db),outBytes=db.export();db.close();
    await writeBytes(outBytes);
    const out={pass:true,file:f.name,inputSize:f.size,outputSize:outBytes.byteLength,preSchema,schema:check.schema,master:check.master,bars:check.bars,fins:check.fins,sync:check.sync};state.importDb=out;
    setBox("importDbResult","pass",`PASS
ファイル: ${f.name}
入力: ${fmtBytes(f.size)}
Import後: ${fmtBytes(out.outputSize)}
schema: ${preSchema} → ${out.schema}
Master: ${out.master.toLocaleString()}
日足: ${out.bars.toLocaleString()}
財務: ${out.fins.toLocaleString()}
同期履歴: ${out.sync.toLocaleString()}`);
  }catch(e){state.importDb={pass:false,error:String(e)};setBox("importDbResult","fail","FAIL\n"+e)}
}

async function continuity(){
  setBox("continuityResult","running","同期履歴確認中…");
  try{
    const db=await openDb(false);const check=inspectDb(db);
    const lastBars=scalar(db,"SELECT MAX(sync_date) FROM sync_log WHERE dataset='bars_daily' AND status='OK'");
    const lastFins=scalar(db,"SELECT MAX(sync_date) FROM sync_log WHERE dataset='fins_summary' AND status='OK'");
    const lastMarket=tableExists(db,"bars_daily")?scalar(db,"SELECT MAX(date) FROM bars_daily"):null;
    db.close();
    const nextBars=lastBars?addDaysISO(String(lastBars),1):null;
    const out={pass:check.integrity==="ok"&&check.bars>0,lastBars,lastFins,lastMarket,nextBars,sync:check.sync};state.continuity=out;
    setBox("continuityResult",out.pass?"pass":"warn",`${out.pass?"PASS":"要確認"}
最終市場日: ${lastMarket||"-"}
日足 最終同期日: ${lastBars||"-"}
次回開始候補: ${nextBars||"-"}
財務 最終同期日: ${lastFins||"-"}
同期OKレコード: ${check.sync.toLocaleString()}
Import後もsync_logを引き継いでいるため、次回は未同期日だけ取得できます。`);
  }catch(e){state.continuity={pass:false,error:String(e)};setBox("continuityResult","fail","FAIL\n"+e)}
}

function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function pct(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a/b-1)*100:NaN}
async function screening(){
  setBox("screenResult","running","復元DataLakeで分析中…");
  try{
    const db=await openDb(false);if(!tableExists(db,"bars_daily"))throw new Error("bars_dailyなし");
    const cr=db.exec("SELECT DISTINCT code FROM bars_daily"),codes=cr[0]?.values.flat().map(String)||[];let eligible=0,best=[];
    for(let i=0;i<codes.length;i++){
      const c=String(codes[i]);const q=db.exec("SELECT COALESCE(adj_c,c),COALESCE(adj_volume,volume) FROM bars_daily WHERE code=? ORDER BY date DESC LIMIT 30",[c]);
      const v=q[0]?.values||[];if(v.length<25)continue;eligible++;
      const close=v.map(r=>Number(r[0])),vol=v.map(r=>Number(r[1]||0));const last=close[0],s5=avg(close.slice(0,5)),s25=avg(close.slice(0,25)),r20=close.length>=21?pct(close[0],close[20]):NaN,av20=avg(vol.slice(0,20));
      const score=(last>s25?1:0)+(s5>s25?1:0)+(Number.isFinite(r20)&&r20>0?1:0)+(av20>=100000?1:0);
      best.push({code:c,score,r20});
      if((i+1)%400===0)await new Promise(r=>setTimeout(r,0));
    }
    db.close();best.sort((a,b)=>b.score-a.score||(b.r20??-999)-(a.r20??-999));best=best.slice(0,5);
    const out={pass:eligible>100,universe:codes.length,eligible,top:best};state.screen=out;
    setBox("screenResult",out.pass?"pass":"warn",`${out.pass?"PASS":"要確認"}
DB銘柄数: ${out.universe.toLocaleString()}
25日以上: ${out.eligible.toLocaleString()}
Top5: ${best.map(x=>`${x.code}(score=${x.score},20D=${Number.isFinite(x.r20)?x.r20.toFixed(2):"-"}%)`).join(" / ")}
Import後のSQLiteだけで分析できました。`);
  }catch(e){state.screen={pass:false,error:String(e)};setBox("screenResult","fail","FAIL\n"+e)}
}

$("deleteAskBtn").onclick=()=>{$("deleteConfirm").style.display="block";setBox("deleteResult","warn","まだ削除していません。下の確認ボタンで確定、またはキャンセルしてください。")};
$("deleteCancelBtn").onclick=()=>{$("deleteConfirm").style.display="none";setBox("deleteResult","pass","削除をキャンセルしました。")};
$("deleteConfirmBtn").onclick=async()=>{
  const ok=await removeDb();$("deleteConfirm").style.display="none";state.delete={pass:ok,deleted:ok};
  setBox("deleteResult",ok?"pass":"warn",ok?"削除完了。DataLakeは現在ありません。Export済みファイルからImportできます。":"削除対象DataLakeがありません。");
};

function summary(){
  const checks=[["DataLake/schema",state.open?.pass],["Export",state.exportDb?.pass],["Import",state.importDb?.pass],["継続性",state.continuity?.pass],["復元Screening",state.screen?.pass]];
  const pass=checks.every(x=>x[1]===true);
  state.generatedAt=new Date().toISOString();
  setBox("summaryResult",pass?"pass":"warn",`${checks.map(([n,p])=>`${n}: ${p===true?"PASS":p===false?"FAIL":"未実行"}`).join("\n")}

総合: ${pass?"DataLake可搬性PASS。ホスティング先/ドメイン変更時もExport→Importで継続利用できる設計が成立。":"未完了または要確認項目があります。"}

本番化時の次項目:
・market / private DB完全分離
・private側暗号化とバックアップ
・schema migration履歴
・長期バックフィル
・Import前自動バックアップ`);
}
function exportResult(){
  state.generatedAt=new Date().toISOString();const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`jq_pwa_poc4_result_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)
}

$("openBtn").onclick=openCheck;$("exportDbBtn").onclick=exportDb;$("importDbBtn").onclick=importDb;$("continuityBtn").onclick=continuity;$("screenBtn").onclick=screening;$("summaryBtn").onclick=summary;$("exportResultBtn").onclick=exportResult;
if("serviceWorker"in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}))}
