const $=id=>document.getElementById(id);
const DBFILE="jq_poc3_datalake.sqlite";
const state={init:null,master:null,bars:null,fins:null,screen:null,delta:null,generatedAt:null};
let stopRequested=false;
let SQLP=null;

function setBox(id,cls,text){const e=$(id);e.className="result "+(cls||"");e.textContent=text}
function fmtBytes(n){if(!Number.isFinite(n))return"不明";const u=["B","KB","MB","GB"];let i=0,x=n;while(x>=1024&&i<u.length-1){x/=1024;i++}return `${x.toFixed(i>=2?2:1)} ${u[i]}`}
function fmtMs(x){return `${x.toFixed(0)} ms`}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function addDaysISO(s,n){const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function datesBetween(a,b){const out=[];let x=a;while(x<=b){out.push(x);x=addDaysISO(x,1);if(out.length>5000)break}return out}
function ymd(s){return s.replaceAll("-","")}
function getKey(){return $("apiKey").value.trim()}
function requestDelay(){return Number($("delayMs").value||600)}

function loadSql(){
  if(SQLP)return SQLP;
  SQLP=new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/sql-wasm.js";
    s.onload=async()=>{try{resolve(await initSqlJs({locateFile:f=>`https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/${f}`}))}catch(e){reject(e)}};
    s.onerror=()=>reject(new Error("SQLite-WASM CDN読み込み失敗"));
    document.head.appendChild(s);
  });
  return SQLP;
}
async function root(){if(!navigator.storage?.getDirectory)throw new Error("OPFS未対応");return navigator.storage.getDirectory()}
async function exists(name){try{const r=await root();const h=await r.getFileHandle(name);const f=await h.getFile();return {yes:true,size:f.size,lastModified:f.lastModified}}catch(e){return {yes:false}}}
async function readBytes(name){const r=await root();const h=await r.getFileHandle(name);const f=await h.getFile();return new Uint8Array(await f.arrayBuffer())}
async function writeBytes(name,bytes){const r=await root();const h=await r.getFileHandle(name,{create:true});const w=await h.createWritable();await w.write(bytes);await w.close()}
async function removeDb(){try{const r=await root();await r.removeEntry(DBFILE);return true}catch(e){return false}}

function schema(db){
  db.run(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE IF NOT EXISTS sync_log(
      dataset TEXT NOT NULL, sync_date TEXT NOT NULL, status TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0, synced_at TEXT NOT NULL, note TEXT,
      PRIMARY KEY(dataset,sync_date)
    );
    CREATE TABLE IF NOT EXISTS equities_master(
      code TEXT PRIMARY KEY, company_name TEXT, company_name_en TEXT,
      market_code TEXT, market_name TEXT, sector17_code TEXT, sector17_name TEXT,
      sector33_code TEXT, sector33_name TEXT, scale_code TEXT, scale_name TEXT,
      margin_code TEXT, margin_name TEXT, raw_json TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS bars_daily(
      code TEXT NOT NULL,date TEXT NOT NULL,o REAL,h REAL,l REAL,c REAL,
      upper_limit TEXT,lower_limit TEXT,volume REAL,value REAL,adj_factor REAL,
      adj_o REAL,adj_h REAL,adj_l REAL,adj_c REAL,adj_volume REAL,raw_json TEXT,
      PRIMARY KEY(code,date)
    );
    CREATE INDEX IF NOT EXISTS idx_bars_date ON bars_daily(date);
    CREATE INDEX IF NOT EXISTS idx_bars_code_date ON bars_daily(code,date);
    CREATE TABLE IF NOT EXISTS fins_summary(
      disclosure_date TEXT NOT NULL, code TEXT NOT NULL, doc_type TEXT,
      current_period_end TEXT, fiscal_year TEXT, forecast_sales REAL,
      forecast_op REAL, forecast_ord REAL, forecast_net REAL, forecast_eps REAL,
      sales REAL, op_profit REAL, ord_profit REAL, net_income REAL, eps REAL,
      raw_json TEXT, PRIMARY KEY(disclosure_date,code,doc_type,current_period_end)
    );
    CREATE INDEX IF NOT EXISTS idx_fins_code_date ON fins_summary(code,disclosure_date);
  `);
}
async function openDb(){
  const SQL=await loadSql();const info=await exists(DBFILE);
  const db=info.yes?new SQL.Database(await readBytes(DBFILE)):new SQL.Database();
  schema(db);return db;
}
async function saveDb(db){const bytes=db.export();await writeBytes(DBFILE,bytes);return bytes.byteLength}
function scalar(db,sql,args=[]){const r=db.exec(sql,args);return r[0]?.values?.[0]?.[0]??null}

async function apiFetch(url,key,attempt=0){
  const res=await fetch(url,{headers:{"x-api-key":key,"Accept":"application/json"},cache:"no-store"});
  if(res.status===429 && attempt<4){
    const wait=1500*Math.pow(2,attempt);await sleep(wait);return apiFetch(url,key,attempt+1);
  }
  if(!res.ok)throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}
function dataArray(j){
  for(const k of ["data","info","statements","daily_quotes","listed_info"]){if(Array.isArray(j?.[k]))return j[k]}
  if(Array.isArray(j))return j;
  return [];
}
function nextCursor(j){return j?.pagination_key??j?.paginationKey??j?.cursor??j?.next_cursor??j?.nextCursor??null}
async function fetchPaged(base,key){
  let url=base,out=[],guard=0;
  while(true){
    const j=await apiFetch(url,key);out.push(...dataArray(j));const c=nextCursor(j);guard++;
    if(!c||guard>100)break;
    const sep=base.includes("?")?"&":"?";
    url=base+sep+"pagination_key="+encodeURIComponent(c);
  }
  return out;
}
function val(r,...keys){for(const k of keys){if(r?.[k]!==undefined&&r?.[k]!==null&&r?.[k]!=="")return r[k]}return null}
function num(r,...keys){const v=val(r,...keys),n=Number(v);return Number.isFinite(n)?n:null}
function isoDate(v){if(!v)return"";const s=String(v);if(/^\d{8}$/.test(s))return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;return s.slice(0,10)}

async function init(){
  $("initBtn").disabled=true;setBox("initResult","running","DataLakeを開いています…");
  try{
    if(navigator.storage?.persist)await navigator.storage.persist();
    const db=await openDb();const size=await saveDb(db);
    const out={
      master:Number(scalar(db,"SELECT COUNT(*) FROM equities_master")||0),
      bars:Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0),
      fins:Number(scalar(db,"SELECT COUNT(*) FROM fins_summary")||0),size
    };db.close();out.pass=true;state.init=out;
    setBox("initResult","pass",`PASS
DB: ${DBFILE}
サイズ: ${fmtBytes(size)}
Master: ${out.master.toLocaleString()}行
日足: ${out.bars.toLocaleString()}行
財務: ${out.fins.toLocaleString()}行`);
  }catch(e){state.init={pass:false,error:String(e)};setBox("initResult","fail","FAIL\n"+e)}
  $("initBtn").disabled=false;
}
async function inspect(){
  try{
    const info=await exists(DBFILE);if(!info.yes){setBox("initResult","warn","DataLake未作成です。初期化してください。");return}
    const db=await openDb();
    const master=Number(scalar(db,"SELECT COUNT(*) FROM equities_master")||0);
    const bars=Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0);
    const fins=Number(scalar(db,"SELECT COUNT(*) FROM fins_summary")||0);
    const minD=scalar(db,"SELECT MIN(date) FROM bars_daily"),maxD=scalar(db,"SELECT MAX(date) FROM bars_daily");
    const synced=Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='OK'")||0);
    db.close();
    setBox("initResult","pass",`DB: 存在
サイズ: ${fmtBytes(info.size)}
Master: ${master.toLocaleString()}
日足: ${bars.toLocaleString()} (${minD||"-"} ～ ${maxD||"-"})
財務: ${fins.toLocaleString()}
日足同期済み日数: ${synced}
最終ファイル更新: ${new Date(info.lastModified).toLocaleString()}`);
  }catch(e){setBox("initResult","fail","FAIL\n"+e)}
}
async function masterSync(){
  const key=getKey();if(!key){setBox("masterResult","warn","APIキーを入力してください。");return}
  $("masterBtn").disabled=true;setBox("masterResult","running","銘柄Master取得中…");
  const out={};
  try{
    const rows=await fetchPaged("https://api.jquants.com/v2/equities/master",key);
    const db=await openDb();const st=db.prepare(`INSERT OR REPLACE INTO equities_master VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.run("BEGIN");
    for(const r of rows){
      const code=String(val(r,"Code","code")??"");
      if(!code)continue;
      st.run([
        code,
        String(val(r,"CompanyName","CoName","company_name")??""),
        String(val(r,"CompanyNameEnglish","CoNameEn","company_name_en")??""),
        String(val(r,"MarketCode","Mkt","market_code")??""),
        String(val(r,"MarketCodeName","MktNm","market_name")??""),
        String(val(r,"Sector17Code","S17","sector17_code")??""),
        String(val(r,"Sector17CodeName","S17Nm","sector17_name")??""),
        String(val(r,"Sector33Code","S33","sector33_code")??""),
        String(val(r,"Sector33CodeName","S33Nm","sector33_name")??""),
        String(val(r,"ScaleCategory","ScaleCat","scale_code")??""),
        String(val(r,"ScaleCategoryName","ScaleCatNm","scale_name")??""),
        String(val(r,"MarginCode","Margin","margin_code")??""),
        String(val(r,"MarginCodeName","MarginNm","margin_name")??""),
        JSON.stringify(r),new Date().toISOString()
      ]);
    }
    db.run("COMMIT");st.free();const count=Number(scalar(db,"SELECT COUNT(*) FROM equities_master")||0);const size=await saveDb(db);db.close();
    out.rows=rows.length;out.dbCount=count;out.size=size;out.pass=count>1000;state.master=out;
    setBox("masterResult",out.pass?"pass":"warn",`${out.pass?"PASS":"要確認"}
API取得: ${rows.length.toLocaleString()}件
DB Master: ${count.toLocaleString()}件
DBサイズ: ${fmtBytes(size)}`);
  }catch(e){out.pass=false;out.error=String(e);state.master=out;setBox("masterResult","fail","FAIL\n"+e)}
  $("masterBtn").disabled=false;
}

async function dailyForDate(date,key){
  const qs=ymd(date);
  try{return await fetchPaged(`https://api.jquants.com/v2/equities/bars/daily?date=${qs}`,key)}
  catch(e){
    if(String(e).includes("HTTP 400"))return fetchPaged(`https://api.jquants.com/v2/equities/bars/daily?date=${date}`,key);
    throw e;
  }
}
function insertBars(db,rows){
  const st=db.prepare(`INSERT OR REPLACE INTO bars_daily VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.run("BEGIN");let n=0;
  for(const r of rows){
    const code=String(val(r,"Code","code")??""),date=isoDate(val(r,"Date","date"));
    if(!code||!date)continue;
    st.run([code,date,num(r,"O","Open","open"),num(r,"H","High","high"),num(r,"L","Low","low"),num(r,"C","Close","close"),
      String(val(r,"UL","UpperLimit","upper_limit")??""),String(val(r,"LL","LowerLimit","lower_limit")??""),
      num(r,"Vo","Volume","volume"),num(r,"Va","TurnoverValue","value"),num(r,"AdjFactor","AdjustmentFactor","adj_factor"),
      num(r,"AdjO","AdjustmentOpen","adj_o"),num(r,"AdjH","AdjustmentHigh","adj_h"),num(r,"AdjL","AdjustmentLow","adj_l"),
      num(r,"AdjC","AdjustmentClose","adj_c"),num(r,"AdjVo","AdjustmentVolume","adj_volume"),JSON.stringify(r)]);
    n++;
  }
  db.run("COMMIT");st.free();return n;
}
function logSync(db,dataset,date,status,count,note=""){
  db.run(`INSERT OR REPLACE INTO sync_log VALUES(?,?,?,?,?,?)`,[dataset,date,status,count,new Date().toISOString(),note]);
}
async function barsSync(){
  const key=getKey();if(!key){setBox("barsResult","warn","APIキーを入力してください。");return}
  const a=$("startDate").value,b=$("endDate").value;if(!a||!b||a>b){setBox("barsResult","warn","開始日・終了日を確認してください。");return}
  const all=datesBetween(a,b);stopRequested=false;$("barsBtn").disabled=true;$("barsMeter").style.width="0%";
  const out={requested:all.length,skipped:0,synced:0,rows:0,errors:[]};
  try{
    const db=await openDb();
    for(let i=0;i<all.length;i++){
      const d=all[i];
      const done=scalar(db,"SELECT status FROM sync_log WHERE dataset='bars_daily' AND sync_date=?",[d]);
      if(done==="OK"){out.skipped++;$("barsMeter").style.width=`${((i+1)/all.length)*100}%`;continue}
      setBox("barsResult","running",`${d} を取得中…\n同期 ${out.synced}日 / スキップ ${out.skipped}日 / ${out.rows.toLocaleString()}行`);
      try{
        const rows=await dailyForDate(d,key);const n=insertBars(db,rows);logSync(db,"bars_daily",d,"OK",n);out.synced++;out.rows+=n;
        await saveDb(db);
      }catch(e){logSync(db,"bars_daily",d,"ERROR",0,String(e));out.errors.push(`${d}: ${e}`);await saveDb(db);if(String(e).includes("HTTP 401")||String(e).includes("HTTP 403"))throw e}
      $("barsMeter").style.width=`${((i+1)/all.length)*100}%`;
      if(stopRequested)break;
      await sleep(requestDelay());
    }
    const total=Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0);const mind=scalar(db,"SELECT MIN(date) FROM bars_daily"),maxd=scalar(db,"SELECT MAX(date) FROM bars_daily");
    const size=await saveDb(db);db.close();out.total=total;out.minDate=mind;out.maxDate=maxd;out.size=size;out.pass=out.synced+out.skipped>0;
    state.bars=out;
    setBox("barsResult",out.errors.length?"warn":"pass",`${out.errors.length?"完了（エラーあり）":"PASS"}
対象: ${out.requested}日
今回同期: ${out.synced}日
既存スキップ: ${out.skipped}日
今回追加/更新: ${out.rows.toLocaleString()}行
DB日足合計: ${total.toLocaleString()}行
期間: ${mind||"-"} ～ ${maxd||"-"}
DBサイズ: ${fmtBytes(size)}
エラー: ${out.errors.length}
${out.errors.slice(0,3).join("\n")}`);
  }catch(e){out.pass=false;out.error=String(e);state.bars=out;setBox("barsResult","fail","FAIL\n"+e)}
  $("barsBtn").disabled=false;
}
$("stopBtn").onclick=()=>{stopRequested=true;setBox("barsResult","warn","停止要求を受け付けました。現在の日付の保存後に止まります。")};

async function finsForDate(date,key){
  const qs=ymd(date);
  try{return await fetchPaged(`https://api.jquants.com/v2/fins/summary?date=${qs}`,key)}
  catch(e){
    if(String(e).includes("HTTP 400"))return fetchPaged(`https://api.jquants.com/v2/fins/summary?date=${date}`,key);
    throw e;
  }
}
function insertFins(db,rows){
  const st=db.prepare(`INSERT OR REPLACE INTO fins_summary VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.run("BEGIN");let n=0;
  for(const r of rows){
    const dd=isoDate(val(r,"DiscDate","DisclosedDate","Date","disclosure_date"));
    const code=String(val(r,"Code","code")??"");
    if(!dd||!code)continue;
    st.run([dd,code,String(val(r,"DocType","TypeOfDocument","doc_type")??""),
      isoDate(val(r,"CurPerEn","CurrentPeriodEndDate","current_period_end")),
      String(val(r,"CurFY","FiscalYear","fiscal_year")??""),
      num(r,"FSales","ForecastSales"),num(r,"FOP","ForecastOperatingProfit"),num(r,"FOrdP","ForecastOrdinaryProfit"),
      num(r,"FNP","ForecastProfit","ForecastNetIncome"),num(r,"FEPS","ForecastEarningsPerShare"),
      num(r,"Sales","NetSales"),num(r,"OP","OperatingProfit"),num(r,"OrdP","OrdinaryProfit"),num(r,"NP","Profit","NetIncome"),
      num(r,"EPS","EarningsPerShare"),JSON.stringify(r)]);
    n++;
  }
  db.run("COMMIT");st.free();return n;
}
async function finsSync(){
  const key=getKey();if(!key){setBox("finsResult","warn","APIキーを入力してください。");return}
  const a=$("startDate").value,b=$("endDate").value;if(!a||!b||a>b){setBox("finsResult","warn","開始日・終了日を確認してください。");return}
  const all=datesBetween(a,b);$("finsBtn").disabled=true;$("finsMeter").style.width="0%";
  const out={requested:all.length,skipped:0,synced:0,rows:0,errors:[]};
  try{
    const db=await openDb();
    for(let i=0;i<all.length;i++){
      const d=all[i];const done=scalar(db,"SELECT status FROM sync_log WHERE dataset='fins_summary' AND sync_date=?",[d]);
      if(done==="OK"){out.skipped++;$("finsMeter").style.width=`${((i+1)/all.length)*100}%`;continue}
      setBox("finsResult","running",`${d} 財務取得中…`);
      try{
        const rows=await finsForDate(d,key);const n=insertFins(db,rows);logSync(db,"fins_summary",d,"OK",n);out.synced++;out.rows+=n;await saveDb(db);
      }catch(e){logSync(db,"fins_summary",d,"ERROR",0,String(e));out.errors.push(`${d}: ${e}`);await saveDb(db);if(String(e).includes("HTTP 401")||String(e).includes("HTTP 403"))throw e}
      $("finsMeter").style.width=`${((i+1)/all.length)*100}%`;await sleep(requestDelay());
    }
    const total=Number(scalar(db,"SELECT COUNT(*) FROM fins_summary")||0);const size=await saveDb(db);db.close();out.total=total;out.size=size;out.pass=out.synced+out.skipped>0;state.fins=out;
    setBox("finsResult",out.errors.length?"warn":"pass",`${out.errors.length?"完了（エラーあり）":"PASS"}
今回同期: ${out.synced}日 / スキップ: ${out.skipped}日
今回行数: ${out.rows.toLocaleString()}
財務合計: ${total.toLocaleString()}
DBサイズ: ${fmtBytes(size)}
エラー: ${out.errors.length}
${out.errors.slice(0,3).join("\n")}`);
  }catch(e){out.pass=false;out.error=String(e);state.fins=out;setBox("finsResult","fail","FAIL\n"+e)}
  $("finsBtn").disabled=false;
}

function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function pct(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a/b-1)*100:NaN}
async function screening(){
  $("screenBtn").disabled=true;setBox("screenResult","running","ローカルDBのみでScreening中…");$("screenTable").innerHTML="";
  const out={};
  try{
    const db=await openDb();const codesR=db.exec("SELECT DISTINCT code FROM bars_daily");const codes=codesR[0]?.values.flat().map(String)||[];
    const rows=[];
    for(let i=0;i<codes.length;i++){
      const code=codes[i];const q=db.exec(`SELECT date,COALESCE(adj_c,c),COALESCE(adj_volume,volume) FROM bars_daily WHERE code=? ORDER BY date DESC LIMIT 30`,[code]);
      const v=q[0]?.values||[];if(v.length<25)continue;
      const c=v.map(r=>Number(r[1])),vol=v.map(r=>Number(r[2]||0));const last=c[0],s5=avg(c.slice(0,5)),s25=avg(c.slice(0,25)),r20=c.length>=21?pct(c[0],c[20]):NaN,av20=avg(vol.slice(0,20));
      const score=(last>s25?1:0)+(s5>s25?1:0)+(Number.isFinite(r20)&&r20>0?1:0)+(av20>=100000?1:0);
      rows.push({code,date:String(v[0][0]),last,s5,s25,r20,av20,score});
      if((i+1)%300===0)await sleep(0);
    }
    db.close();rows.sort((a,b)=>b.score-a.score||(b.r20??-999)-(a.r20??-999));out.universe=codes.length;out.eligible=rows.length;out.top=rows.slice(0,30);out.pass=rows.length>100;state.screen=out;
    setBox("screenResult",out.pass?"pass":"warn",`${out.pass?"PASS":"要確認"}
DB銘柄数: ${codes.length.toLocaleString()}
25日以上データあり: ${rows.length.toLocaleString()}
Top30を表示
※ スコアはPoC用。現行PC版Screening Scoreとは別物です。`);
    const f=n=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:2}):"-";
    $("screenTable").innerHTML=`<table><thead><tr><th>Code</th><th>Score</th><th>Close</th><th>SMA5</th><th>SMA25</th><th>20D%</th><th>Vol20</th></tr></thead><tbody>${
      out.top.map(r=>`<tr><td>${r.code}</td><td>${r.score}</td><td>${f(r.last)}</td><td>${f(r.s5)}</td><td>${f(r.s25)}</td><td>${f(r.r20)}</td><td>${f(r.av20)}</td></tr>`).join("")
    }</tbody></table>`;
  }catch(e){out.pass=false;out.error=String(e);state.screen=out;setBox("screenResult","fail","FAIL\n"+e)}
  $("screenBtn").disabled=false;
}
async function delta(){
  const a=$("startDate").value,b=$("endDate").value;if(!a||!b||a>b){setBox("deltaResult","warn","開始日・終了日を確認してください。");return}
  try{
    const db=await openDb();const all=datesBetween(a,b);let bars=0,fins=0;
    for(const d of all){
      if(scalar(db,"SELECT status FROM sync_log WHERE dataset='bars_daily' AND sync_date=?",[d])==="OK")bars++;
      if(scalar(db,"SELECT status FROM sync_log WHERE dataset='fins_summary' AND sync_date=?",[d])==="OK")fins++;
    }
    db.close();const out={days:all.length,barsSynced:bars,finsSynced:fins,pass:bars===all.length};state.delta=out;
    setBox("deltaResult",out.pass?"pass":"warn",`${out.pass?"PASS":"要確認"}
期間: ${all.length}日
日足同期済み: ${bars}/${all.length}
財務同期済み: ${fins}/${all.length}

同じ期間で「日足同期」をもう一度押した場合、同期済み${bars}日はAPI取得せずスキップします。`);
  }catch(e){state.delta={pass:false,error:String(e)};setBox("deltaResult","fail","FAIL\n"+e)}
}
function summary(){
  const checks=[["DataLake",state.init?.pass],["Master",state.master?.pass],["全市場日足",state.bars?.pass],["財務",state.fins?.pass],["Local Screening",state.screen?.pass],["差分/再開",state.delta?.pass]];
  const done=checks.filter(x=>x[1]!==undefined&&x[1]!==null).length,passed=checks.filter(x=>x[1]===true).length;
  const critical=(state.master?.pass&&state.bars?.pass&&state.screen?.pass&&state.delta?.pass);
  let verdict=done<5?"まだ主要テストが完了していません。":critical?"小型本番DataLake方式は成立。次は長期バックフィルと現行Core移植へ進めます。":"追加修正が必要です。";
  state.generatedAt=new Date().toISOString();
  setBox("summaryResult",critical?"pass":"warn",`${checks.map(([n,p])=>`${n}: ${p===true?"PASS":p===false?"FAIL":"未実行"}`).join("\n")}

総合: ${verdict}

財務は補助テストなので、API仕様/プラン理由でFAILでも
Master + 日足 + Local Screening + 差分再開 がPASSなら次へ進めます。`);
}
function exportJson(){
  state.generatedAt=new Date().toISOString();const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`jq_pwa_poc3_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)
}

$("initBtn").onclick=init;$("inspectBtn").onclick=inspect;$("masterBtn").onclick=masterSync;$("barsBtn").onclick=barsSync;$("finsBtn").onclick=finsSync;
$("screenBtn").onclick=screening;$("deltaBtn").onclick=delta;$("summaryBtn").onclick=summary;$("exportBtn").onclick=exportJson;
$("deleteBtn").onclick=async()=>{const ok=await removeDb();setBox("summaryResult",ok?"pass":"warn",ok?"PoC v3 DataLakeを削除しました。":"削除対象がありません。")};

const end=todayISO(),start=addDaysISO(end,-44);$("startDate").value=start;$("endDate").value=end;
if("serviceWorker"in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}))}
