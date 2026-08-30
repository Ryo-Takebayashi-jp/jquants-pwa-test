const $=id=>document.getElementById(id);
const DBFILE="jq_poc3_datalake.sqlite", SCHEMA="market-poc6-1";
let SQLP=null, stopRequested=false;
const state={inspect:null,backfill:null,retry:null,stats:null,observation:null,generatedAt:null};

function setBox(id,cls,text){const e=$(id);e.className="result "+(cls||"");e.textContent=text}
function fmtBytes(n){if(!Number.isFinite(n))return"不明";const u=["B","KB","MB","GB"];let i=0,x=n;while(x>=1024&&i<u.length-1){x/=1024;i++}return `${x.toFixed(i>=2?2:1)} ${u[i]}`}
function fmtTime(sec){if(!Number.isFinite(sec))return"-";if(sec<60)return `${sec.toFixed(1)}秒`;if(sec<3600)return `${(sec/60).toFixed(1)}分`;return `${(sec/3600).toFixed(2)}時間`}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function addDays(s,n){const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return iso(d)}
function ymd(s){return s.replaceAll("-","")}
function datesBetween(a,b){const out=[];let x=a;while(x<=b){out.push(x);x=addDays(x,1);if(out.length>5000)break}return out}
function loadSql(){
  if(SQLP)return SQLP;
  SQLP=new Promise((resolve,reject)=>{
    const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/sql-wasm.js";
    s.onload=async()=>{try{resolve(await initSqlJs({locateFile:f=>`https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/${f}`}))}catch(e){reject(e)}};
    s.onerror=()=>reject(new Error("SQLite-WASM CDN読み込み失敗"));document.head.appendChild(s);
  });return SQLP;
}
async function root(){if(!navigator.storage?.getDirectory)throw new Error("OPFS未対応");return navigator.storage.getDirectory()}
async function fileInfo(){try{const r=await root(),h=await r.getFileHandle(DBFILE),f=await h.getFile();return{exists:true,size:f.size,lastModified:f.lastModified}}catch(e){return{exists:false}}}
async function readBytes(){const r=await root(),h=await r.getFileHandle(DBFILE),f=await h.getFile();return new Uint8Array(await f.arrayBuffer())}
async function writeBytes(bytes){const r=await root(),h=await r.getFileHandle(DBFILE,{create:true}),w=await h.createWritable();await w.write(bytes);await w.close()}
function scalar(db,sql,args=[]){const r=db.exec(sql,args);return r[0]?.values?.[0]?.[0]??null}
function tableExists(db,name){return Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",[name])||0)>0}
function ensure(db){
  db.run("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS migration_history(id INTEGER PRIMARY KEY AUTOINCREMENT,from_version TEXT,to_version TEXT,applied_at TEXT,note TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS backfill_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,started_at TEXT,ended_at TEXT,start_date TEXT,end_date TEXT,processed_days INTEGER,skipped_days INTEGER,error_days INTEGER,rows_added INTEGER,api_calls INTEGER,duration_sec REAL,db_size_before INTEGER,db_size_after INTEGER,status TEXT,note TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS device_observations(id INTEGER PRIMARY KEY AUTOINCREMENT,observed_at TEXT,battery_start REAL,battery_end REAL,heat TEXT,note TEXT)");
  const cur=String(scalar(db,"SELECT value FROM meta WHERE key='schema_version'")??"legacy");
  if(cur!==SCHEMA){
    db.run("INSERT INTO migration_history(from_version,to_version,applied_at,note) VALUES(?,?,?,?)",[cur,SCHEMA,new Date().toISOString(),"PoC v6 backfill schema"]);
    db.run("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)",[SCHEMA]);
  }
}
async function openDb(){
  const SQL=await loadSql(),i=await fileInfo();if(!i.exists)throw new Error("market DataLakeがありません。PoC v3/v4のDBを先に作成してください。");
  const db=new SQL.Database(await readBytes());ensure(db);return db;
}
async function saveDb(db){const b=db.export();await writeBytes(b);return b.byteLength}

function val(r,...ks){for(const k of ks){if(r?.[k]!==undefined&&r?.[k]!==null&&r?.[k]!=="")return r[k]}return null}
function num(r,...ks){const n=Number(val(r,...ks));return Number.isFinite(n)?n:null}
function dateIso(v){const s=String(v??"");return /^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:s.slice(0,10)}
function dataArray(j){for(const k of ["data","daily_quotes"]){if(Array.isArray(j?.[k]))return j[k]}return Array.isArray(j)?j:[]}
function cursor(j){return j?.pagination_key??j?.paginationKey??j?.cursor??j?.next_cursor??null}

async function apiFetch(url,key,attempt=0){
  const res=await fetch(url,{headers:{"x-api-key":key,"Accept":"application/json"},cache:"no-store"});
  if(res.status===429&&attempt<6){await sleep(Math.min(30000,1500*Math.pow(2,attempt)));return apiFetch(url,key,attempt+1)}
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function fetchPaged(base,key){
  let url=base,out=[],calls=0;
  while(true){
    const j=await apiFetch(url,key);calls++;out.push(...dataArray(j));const c=cursor(j);if(!c||calls>100)break;
    url=base+(base.includes("?")?"&":"?")+"pagination_key="+encodeURIComponent(c);
  }
  return {rows:out,calls};
}
async function daily(date,key){
  const d=ymd(date);
  try{return await fetchPaged(`https://api.jquants.com/v2/equities/bars/daily?date=${d}`,key)}
  catch(e){if(String(e).includes("HTTP 400"))return fetchPaged(`https://api.jquants.com/v2/equities/bars/daily?date=${date}`,key);throw e}
}
function insertBars(db,rows){
  const st=db.prepare(`INSERT OR REPLACE INTO bars_daily(
    code,date,o,h,l,c,upper_limit,lower_limit,volume,value,adj_factor,
    adj_o,adj_h,adj_l,adj_c,adj_volume,raw_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.run("BEGIN");let n=0;
  for(const r of rows){
    const code=String(val(r,"Code","code")??""),date=dateIso(val(r,"Date","date"));if(!code||!date)continue;
    st.run([code,date,num(r,"O","Open"),num(r,"H","High"),num(r,"L","Low"),num(r,"C","Close"),
      String(val(r,"UL","UpperLimit")??""),String(val(r,"LL","LowerLimit")??""),
      num(r,"Vo","Volume"),num(r,"Va","TurnoverValue"),num(r,"AdjFactor","AdjustmentFactor"),
      num(r,"AdjO","AdjustmentOpen"),num(r,"AdjH","AdjustmentHigh"),num(r,"AdjL","AdjustmentLow"),
      num(r,"AdjC","AdjustmentClose"),num(r,"AdjVo","AdjustmentVolume"),JSON.stringify(r)]);
    n++;
  }
  db.run("COMMIT");st.free();return n;
}
function logSync(db,date,status,count,note=""){db.run("INSERT OR REPLACE INTO sync_log(dataset,sync_date,status,row_count,synced_at,note) VALUES('bars_daily',?,?,?,?,?)",[date,status,count,new Date().toISOString(),note])}
function nextSaveBoundary(date,mode){
  const d=new Date(date+"T12:00:00");
  if(mode==="year")return d.getMonth()===11&&d.getDate()===31;
  const tomorrow=new Date(d);tomorrow.setDate(tomorrow.getDate()+1);
  return tomorrow.getMonth()!==d.getMonth();
}
async function inspect(){
  try{
    const db=await openDb(),i=await fileInfo();
    const bars=Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0),minD=scalar(db,"SELECT MIN(date) FROM bars_daily"),maxD=scalar(db,"SELECT MAX(date) FROM bars_daily");
    const ok=Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='OK'")||0),err=Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='ERROR'")||0);
    const runs=Number(scalar(db,"SELECT COUNT(*) FROM backfill_runs")||0),schema=scalar(db,"SELECT value FROM meta WHERE key='schema_version'");db.close();
    state.inspect={pass:true,bars,minD,maxD,ok,err,runs,size:i.size,schema};
    setBox("inspectResult","pass",`PASS
schema: ${schema}
日足: ${bars.toLocaleString()}行
期間: ${minD||"-"} ～ ${maxD||"-"}
同期OK日: ${ok}
ERROR日: ${err}
耐久run履歴: ${runs}
DBサイズ: ${fmtBytes(i.size)}`);
  }catch(e){state.inspect={pass:false,error:String(e)};setBox("inspectResult","fail","FAIL\n"+e)}
}

async function runBackfill(onlyErrors=false){
  const key=$("apiKey").value.trim();if(!key){setBox(onlyErrors?"retryResult":"backfillResult","warn","APIキーを入力してください。");return}
  const a=$("startDate").value,b=$("endDate").value,box=onlyErrors?"retryResult":"backfillResult";
  if(!a||!b||a>b){setBox(box,"warn","期間を確認してください。");return}
  stopRequested=false;$("backfillBtn").disabled=true;$("retryBtn").disabled=true;$("progressMeter").style.width="0%";
  let db;
  const run={startDate:a,endDate:b,processed:0,skipped:0,errors:0,rows:0,calls:0,startedAt:new Date().toISOString(),startPerf:performance.now()};
  try{
    db=await openDb();const before=(await fileInfo()).size;
    let dates=datesBetween(a,b);
    if(onlyErrors){
      const q=db.exec("SELECT sync_date FROM sync_log WHERE dataset='bars_daily' AND status='ERROR' AND sync_date BETWEEN ? AND ? ORDER BY sync_date",[a,b]);
      dates=q[0]?.values.flat().map(String)||[];
    }
    if(!dates.length){setBox(box,"pass","対象日なし。再取得不要です。");return}
    for(let i=0;i<dates.length;i++){
      const d=dates[i],status=scalar(db,"SELECT status FROM sync_log WHERE dataset='bars_daily' AND sync_date=?",[d]);
      if(!onlyErrors&&status==="OK"){run.skipped++;$("progressMeter").style.width=`${((i+1)/dates.length)*100}%`;continue}
      setBox(box,"running",`${d} 取得中…
進捗: ${i+1}/${dates.length}
処理済み: ${run.processed}日 / スキップ: ${run.skipped}日
追加更新: ${run.rows.toLocaleString()}行
ERROR: ${run.errors}
経過: ${fmtTime((performance.now()-run.startPerf)/1000)}`);
      try{
        const r=await daily(d,key);run.calls+=r.calls;const n=insertBars(db,r.rows);logSync(db,d,"OK",n);run.processed++;run.rows+=n;
      }catch(e){logSync(db,d,"ERROR",0,String(e));run.errors++}
      const shouldSave=nextSaveBoundary(d,$("chunkMode").value)||i===dates.length-1||stopRequested;
      if(shouldSave)await saveDb(db);
      $("progressMeter").style.width=`${((i+1)/dates.length)*100}%`;
      if(stopRequested)break;
      await sleep(Number($("delayMs").value||600));
    }
    const after=await saveDb(db),duration=(performance.now()-run.startPerf)/1000;
    db.run(`INSERT INTO backfill_runs(started_at,ended_at,start_date,end_date,processed_days,skipped_days,error_days,rows_added,api_calls,duration_sec,db_size_before,db_size_after,status,note)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [run.startedAt,new Date().toISOString(),a,b,run.processed,run.skipped,run.errors,run.rows,run.calls,duration,before,after,stopRequested?"STOPPED":"DONE",onlyErrors?"retry-errors":"long-backfill"]);
    await saveDb(db);db.close();db=null;
    run.durationSec=duration;run.before=before;run.after=after;run.pass=run.processed+run.skipped>0;state[onlyErrors?"retry":"backfill"]=run;
    setBox(box,run.errors?"warn":"pass",`${run.errors?"完了（ERRORあり）":"PASS"}
処理日: ${run.processed}
既存スキップ: ${run.skipped}
ERROR: ${run.errors}
追加/更新行: ${run.rows.toLocaleString()}
API呼出: ${run.calls}
時間: ${fmtTime(duration)}
平均/処理日: ${run.processed?fmtTime(duration/run.processed):"-"}
DB: ${fmtBytes(before)} → ${fmtBytes(after)}
増加: ${fmtBytes(after-before)}
${stopRequested?"停止要求により中断。次回続きから再開できます。":""}`);
  }catch(e){
    if(db)try{await saveDb(db);db.close()}catch(_){}
    state[onlyErrors?"retry":"backfill"]={pass:false,error:String(e)};setBox(box,"fail","FAIL\n"+e);
  }finally{$("backfillBtn").disabled=false;$("retryBtn").disabled=false;$("apiKey").value=""}
}
$("stopBtn").onclick=()=>{stopRequested=true;setBox("backfillResult","warn","停止要求を受付。現在の日付の保存後に停止します。")};

async function stats(){
  try{
    const db=await openDb(),q=db.exec("SELECT started_at,start_date,end_date,processed_days,skipped_days,error_days,rows_added,api_calls,duration_sec,db_size_before,db_size_after,status,note FROM backfill_runs ORDER BY id DESC LIMIT 10");
    const rows=q[0]?.values||[],totalRuns=Number(scalar(db,"SELECT COUNT(*) FROM backfill_runs")||0),totalSec=Number(scalar(db,"SELECT COALESCE(SUM(duration_sec),0) FROM backfill_runs")||0),totalRows=Number(scalar(db,"SELECT COALESCE(SUM(rows_added),0) FROM backfill_runs")||0);
    db.close();state.stats={pass:true,totalRuns,totalSec,totalRows,recent:rows};
    const latest=rows[0];
    setBox("statsResult","pass",`PASS
run総数: ${totalRuns}
累積処理時間: ${fmtTime(totalSec)}
累積追加/更新: ${totalRows.toLocaleString()}行
直近run:
${latest?`期間 ${latest[1]}～${latest[2]}
処理 ${latest[3]}日 / skip ${latest[4]} / error ${latest[5]}
行 ${Number(latest[6]).toLocaleString()} / API ${latest[7]}
時間 ${fmtTime(Number(latest[8]))}
DB ${fmtBytes(Number(latest[9]))} → ${fmtBytes(Number(latest[10]))}
status=${latest[11]} / ${latest[12]}`:"履歴なし"}`);
  }catch(e){state.stats={pass:false,error:String(e)};setBox("statsResult","fail","FAIL\n"+e)}
}
async function saveObs(){
  const bs=Number($("batteryStart").value),be=Number($("batteryEnd").value),heat=$("heat").value;
  if(!Number.isFinite(bs)||!Number.isFinite(be)||bs<0||bs>100||be<0||be>100||!heat){setBox("obsResult","warn","開始/終了バッテリーと発熱を入力してください。");return}
  try{
    const db=await openDb();db.run("INSERT INTO device_observations(observed_at,battery_start,battery_end,heat,note) VALUES(?,?,?,?,?)",[new Date().toISOString(),bs,be,heat,"manual observation"]);await saveDb(db);db.close();
    state.observation={pass:true,batteryStart:bs,batteryEnd:be,drop:bs-be,heat};
    setBox("obsResult","pass",`保存しました。
バッテリー: ${bs}% → ${be}%（-${bs-be}%）
発熱: ${heat}`);
  }catch(e){state.observation={pass:false,error:String(e)};setBox("obsResult","fail","FAIL\n"+e)}
}
function summary(){
  const b=state.backfill,critical=b?.pass===true&&b.processed>0;
  let estimate="-";
  if(critical&&b.durationSec&&b.processed){
    const secPerCalendarDay=b.durationSec/Math.max(1,b.processed);
    estimate=fmtTime(secPerCalendarDay*3652);
  }
  state.generatedAt=new Date().toISOString();
  setBox("summaryResult",critical?"pass":"warn",`長期バックフィル: ${b?.pass===true?"PASS":b?.pass===false?"FAIL":"未実行"}
失敗日再取得: ${state.retry?.pass===true?"PASS":state.retry?.pass===false?"FAIL/対象なし":"未実行"}
耐久ログ: ${state.stats?.pass===true?"PASS":"未実行"}
端末観察: ${state.observation?.pass===true?"記録済み":"未記録"}

総合: ${critical?"長期バックフィル基盤は成立。同期済みスキップ・停止再開・ログ保存が機能しています。":"まず3か月程度を実行してください。"}
単純外挿した10年所要時間目安: ${estimate}

※ 10年推定は営業日/既存同期/通信状態で大きく変わるため参考値です。`);
}
function exportJson(){
  state.generatedAt=new Date().toISOString();const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=`jq_pwa_poc6_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)
}

$("inspectBtn").onclick=inspect;$("backfillBtn").onclick=()=>runBackfill(false);$("retryBtn").onclick=()=>runBackfill(true);$("statsBtn").onclick=stats;$("saveObsBtn").onclick=saveObs;$("summaryBtn").onclick=summary;$("exportBtn").onclick=exportJson;

const end=new Date(), start=new Date(end);start.setMonth(start.getMonth()-3);
$("endDate").value=iso(end);$("startDate").value=iso(start);
if("serviceWorker"in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}))}
