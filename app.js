const $=id=>document.getElementById(id);
const state={heavy:null,fetch:null,analysis:null,inspect:null,generatedAt:null};
const DBFILE="jq_poc_market.sqlite";

function setBox(id,cls,text){const e=$(id);e.className="result "+(cls||"");e.textContent=text}
function fmtBytes(n){if(!Number.isFinite(n))return"不明";const u=["B","KB","MB","GB"];let i=0,x=n;while(x>=1024&&i<u.length-1){x/=1024;i++}return `${x.toFixed(i>=2?2:1)} ${u[i]}`}
function fmtMs(x){return `${x.toFixed(0)} ms`}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
let sqlPromise=null;
function loadSql(){
  if(sqlPromise)return sqlPromise;
  sqlPromise=new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/sql-wasm.js";
    s.onload=async()=>{try{resolve(await initSqlJs({locateFile:f=>`https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/${f}`}))}catch(e){reject(e)}};
    s.onerror=()=>reject(new Error("SQLite-WASM CDN読み込み失敗"));
    document.head.appendChild(s);
  });
  return sqlPromise;
}
async function getRoot(){if(!navigator.storage?.getDirectory)throw new Error("OPFS未対応");return await navigator.storage.getDirectory()}
async function writeFile(name,bytes){
  const root=await getRoot(); const fh=await root.getFileHandle(name,{create:true}); const w=await fh.createWritable();
  await w.write(bytes); await w.close(); return bytes.byteLength;
}
async function readFile(name){
  const root=await getRoot(); const fh=await root.getFileHandle(name); const f=await fh.getFile(); return new Uint8Array(await f.arrayBuffer());
}
async function fileInfo(name){
  try{const root=await getRoot();const fh=await root.getFileHandle(name);const f=await fh.getFile();return {exists:true,size:f.size,lastModified:f.lastModified}}catch(e){return {exists:false}}
}
async function deleteFile(name){try{const root=await getRoot();await root.removeEntry(name);return true}catch(e){return false}}

async function heavyTest(){
  $("heavyBtn").disabled=true;$("heavyMeter").style.width="0%";setBox("heavyResult","running","512MB OPFSテスト中…");
  const out={};
  try{
    if(navigator.storage?.persist)out.persistRequested=await navigator.storage.persist();
    const root=await getRoot(); const fh=await root.getFileHandle("jq_heavy_test.bin",{create:true}); const w=await fh.createWritable();
    const chunkSize=4*1024*1024,total=512*1024*1024,buf=new Uint8Array(chunkSize);
    for(let i=0;i<buf.length;i+=4096)buf[i]=(i/4096)%251;
    let pos=0,t0=performance.now();
    while(pos<total){await w.write(buf);pos+=chunkSize;$("heavyMeter").style.width=`${pos/total*45}%`;await sleep(0)}
    await w.close(); let t1=performance.now();
    const f=await fh.getFile(); out.opfsSize=f.size; out.opfsWriteMs=t1-t0; out.opfsMBps=512/((t1-t0)/1000);
    await root.removeEntry("jq_heavy_test.bin");

    setBox("heavyResult","running","512MB PASS。100万行SQLiteを生成中…");
    const SQL=await loadSql();const db=new SQL.Database();
    db.run("CREATE TABLE bars(code INTEGER,d INTEGER,close REAL,volume INTEGER,sector INTEGER)");
    const stmt=db.prepare("INSERT INTO bars VALUES(?,?,?,?,?)");
    t0=performance.now();db.run("BEGIN");
    const rows=1000000;
    for(let i=0;i<rows;i++){
      stmt.run([1000+(i%3800),20200101+(i%2400),500+(i%5000)*.1,10000+(i%900000),i%33]);
      if((i+1)%50000===0){$("heavyMeter").style.width=`${45+((i+1)/rows)*35}%`;await sleep(0)}
    }
    db.run("COMMIT");stmt.free();t1=performance.now();out.insertMs=t1-t0;
    t0=performance.now();db.run("CREATE INDEX idx_code_d ON bars(code,d)");t1=performance.now();out.indexMs=t1-t0;
    t0=performance.now();const q=db.exec("SELECT sector,AVG(close),SUM(volume) FROM bars GROUP BY sector");t1=performance.now();out.aggregateMs=t1-t0;
    t0=performance.now();const q2=db.exec("SELECT * FROM bars WHERE code=2500 ORDER BY d DESC LIMIT 200");t1=performance.now();out.lookupMs=t1-t0;
    const bytes=db.export();out.dbBytes=bytes.byteLength;db.close();$("heavyMeter").style.width="100%";
    if(navigator.storage?.estimate){const e=await navigator.storage.estimate();out.quota=e.quota;out.usage=e.usage}
    out.pass=f.size===total&&q.length>0&&q2.length>0&&out.lookupMs<5000;
    setBox("heavyResult",out.pass?"pass":"warn",
`512MB OPFS: PASS
書込速度: ${out.opfsMBps.toFixed(1)} MB/s
100万行 INSERT: ${fmtMs(out.insertMs)}
INDEX作成: ${fmtMs(out.indexMs)}
33業種集計: ${fmtMs(out.aggregateMs)}
索引検索: ${fmtMs(out.lookupMs)}
SQLiteサイズ: ${fmtBytes(out.dbBytes)}
Storage使用量: ${fmtBytes(out.usage)}
Storage上限: ${fmtBytes(out.quota)}
判定: ${out.pass?"PASS":"要確認"}`);
  }catch(e){out.pass=false;out.error=String(e);setBox("heavyResult","fail","FAIL\n"+String(e))}
  state.heavy=out;$("heavyBtn").disabled=false;
}

function normalizeCodes(){
  return $("codes").value.split(/[\s,、]+/).map(s=>s.trim()).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
}
function extractRows(json,code){
  const arr=Array.isArray(json?.data)?json.data:Array.isArray(json?.daily_quotes)?json.daily_quotes:Array.isArray(json)?json:[];
  return arr.map(r=>({
    code:String(r.Code??r.code??code),
    date:String(r.Date??r.date??""),
    o:Number(r.O??r.Open??r.open??NaN),
    h:Number(r.H??r.High??r.high??NaN),
    l:Number(r.L??r.Low??r.low??NaN),
    c:Number(r.C??r.Close??r.close??NaN),
    v:Number(r.Vo??r.Volume??r.volume??0),
    adjc:Number(r.AdjC??r.AdjustmentClose??r.adjustment_close??r.C??r.Close??NaN)
  })).filter(r=>r.date && Number.isFinite(r.c));
}
async function fetchCode(code,key){
  const url=`https://api.jquants.com/v2/equities/bars/daily?code=${encodeURIComponent(code)}`;
  const res=await fetch(url,{headers:{"x-api-key":key,"Accept":"application/json"},cache:"no-store"});
  if(!res.ok)throw new Error(`${code}: HTTP ${res.status}`);
  return await res.json();
}
async function fetchAndStore(){
  const key=$("apiKey").value.trim(),codes=normalizeCodes();
  if(!key){setBox("fetchResult","warn","APIキーを入力してください。");return}
  if(!codes.length){setBox("fetchResult","warn","コードを1つ以上入力してください。");return}
  $("fetchBtn").disabled=true;$("fetchMeter").style.width="0%";setBox("fetchResult","running","J-Quants取得中…");
  const out={codes,counts:{},errors:[]};
  try{
    const SQL=await loadSql();const db=new SQL.Database();
    db.run(`CREATE TABLE bars(
      code TEXT NOT NULL,date TEXT NOT NULL,o REAL,h REAL,l REAL,c REAL,v REAL,adjc REAL,
      PRIMARY KEY(code,date)
    )`);
    const stmt=db.prepare("INSERT OR REPLACE INTO bars VALUES(?,?,?,?,?,?,?,?)");
    let total=0;
    for(let i=0;i<codes.length;i++){
      const code=codes[i];
      try{
        const json=await fetchCode(code,key); const rows=extractRows(json,code); out.counts[code]=rows.length; total+=rows.length;
        db.run("BEGIN"); for(const r of rows)stmt.run([r.code,r.date,r.o,r.h,r.l,r.c,r.v,r.adjc]); db.run("COMMIT");
      }catch(e){out.errors.push(String(e))}
      $("fetchMeter").style.width=`${((i+1)/codes.length)*75}%`;await sleep(50);
    }
    stmt.free();db.run("CREATE INDEX idx_bars_code_date ON bars(code,date)");
    const bytes=db.export();out.dbBytes=bytes.byteLength;out.rows=total;
    await writeFile(DBFILE,bytes);$("fetchMeter").style.width="100%";
    const info=await fileInfo(DBFILE);out.fileSize=info.size;out.pass=total>0&&info.exists;db.close();
    setBox("fetchResult",out.pass?"pass":"warn",
`${out.pass?"PASS":"要確認"}
取得銘柄: ${codes.length}
保存行数: ${total.toLocaleString()}
DBサイズ: ${fmtBytes(out.dbBytes)}
OPFS保存: ${fmtBytes(out.fileSize)}
銘柄別: ${Object.entries(out.counts).map(([c,n])=>`${c}=${n}`).join(", ")}
エラー: ${out.errors.length?out.errors.join(" / "):"なし"}

次は一度PWAを閉じて再起動し、「保存DBを読み込んで分析」を押してもOKです。`);
  }catch(e){out.pass=false;out.error=String(e);setBox("fetchResult","fail","FAIL\n"+String(e))}
  $("apiKey").value="";state.fetch=out;$("fetchBtn").disabled=false;
}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function pct(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a/b-1)*100:NaN}
async function analyze(){
  $("analyzeBtn").disabled=true;setBox("analysisResult","running","OPFSのSQLiteを読み込み中…");$("tableWrap").innerHTML="";
  const out={};
  try{
    const SQL=await loadSql();const bytes=await readFile(DBFILE);const db=new SQL.Database(bytes);
    const codesRes=db.exec("SELECT DISTINCT code FROM bars ORDER BY code");const codes=codesRes[0]?.values.flat().map(String)||[];
    const rows=[];
    for(const code of codes){
      const q=db.exec(`SELECT date,c,v,adjc FROM bars WHERE code=? ORDER BY date DESC LIMIT 30`,[code]);
      const vals=q[0]?.values||[]; if(!vals.length)continue;
      const close=vals.map(r=>Number.isFinite(Number(r[3]))?Number(r[3]):Number(r[1]));
      const vol=vals.map(r=>Number(r[2]||0));const last=close[0];
      rows.push({
        code,date:String(vals[0][0]),close:last,
        sma5:avg(close.slice(0,5)),sma25:avg(close.slice(0,25)),
        ret20:close.length>=21?pct(close[0],close[20]):NaN,
        vol20:avg(vol.slice(0,20)),
        above25:Number.isFinite(avg(close.slice(0,25)))?last>avg(close.slice(0,25)):null
      });
    }
    db.close();out.rows=rows;out.pass=rows.length>0;
    rows.sort((a,b)=>(b.ret20??-999)-(a.ret20??-999));
    setBox("analysisResult",out.pass?"pass":"warn",
`PASS
OPFS DB再読込: 成功
分析銘柄数: ${rows.length}
簡易ロジック: SMA5 / SMA25 / 20D騰落率 / 20日平均出来高
※ 売買シグナルではなく、ブラウザ内分析CoreのPoCです。`);
    const fmt=n=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:2}):"-";
    $("tableWrap").innerHTML=`<table><thead><tr><th>Code</th><th>Close</th><th>SMA5</th><th>SMA25</th><th>20D%</th><th>Vol20</th></tr></thead><tbody>${
      rows.map(r=>`<tr><td>${r.code}</td><td>${fmt(r.close)}</td><td>${fmt(r.sma5)}</td><td>${fmt(r.sma25)}</td><td>${fmt(r.ret20)}</td><td>${fmt(r.vol20)}</td></tr>`).join("")
    }</tbody></table>`;
  }catch(e){out.pass=false;out.error=String(e);setBox("analysisResult","fail","FAIL\n"+String(e))}
  state.analysis=out;$("analyzeBtn").disabled=false;
}
async function inspect(){
  const out={};
  try{
    const info=await fileInfo(DBFILE);Object.assign(out,info);
    if(info.exists){
      const SQL=await loadSql();const bytes=await readFile(DBFILE);const db=new SQL.Database(bytes);
      const n=db.exec("SELECT COUNT(*) FROM bars")[0]?.values?.[0]?.[0]??0;
      const c=db.exec("SELECT COUNT(DISTINCT code) FROM bars")[0]?.values?.[0]?.[0]??0;
      out.rows=Number(n);out.codes=Number(c);db.close();out.pass=true;
      setBox("inspectResult","pass",`PASS
DB: 存在
サイズ: ${fmtBytes(info.size)}
行数: ${out.rows.toLocaleString()}
銘柄数: ${out.codes}
最終更新: ${new Date(info.lastModified).toLocaleString()}`);
    }else{out.pass=false;setBox("inspectResult","warn","PoC DBはまだありません。Bを実行してください。")}
  }catch(e){out.pass=false;out.error=String(e);setBox("inspectResult","fail","FAIL\n"+String(e))}
  state.inspect=out;
}
async function removeDb(){
  const ok=await deleteFile(DBFILE);$("tableWrap").innerHTML="";
  setBox("inspectResult",ok?"pass":"warn",ok?"PoC DBを削除しました。":"削除対象DBがありません。");
}
function summary(){
  const persistence=state.inspect?.pass===true&&state.analysis?.pass===true;
  const checks=[["512MB+100万行",state.heavy?.pass],["J-Quants→OPFS DB",state.fetch?.pass],["OPFS再読込+分析",state.analysis?.pass],["永続DB確認",state.inspect?.pass]];
  const done=checks.filter(x=>x[1]!==undefined&&x[1]!==null).length,passed=checks.filter(x=>x[1]===true).length;
  let verdict=done<4?"まだ全項目が完了していません。":passed===4?"Local-first PWAで本番設計へ進める根拠がかなり強まりました。":"追加検証が必要です。";
  state.generatedAt=new Date().toISOString();
  setBox("summaryResult",passed===4?"pass":done===4?"warn":"running",`${checks.map(([n,p])=>`${n}: ${p===true?"PASS":p===false?"FAIL":"未実行"}`).join("\n")}

総合: ${verdict}

次段階候補:
・実J-Quants全市場データの段階取得
・CSV中心からSQLite/Parquet中心へのDataLake再設計
・Screening Coreのブラウザ移植
・privateデータのローカル暗号化/バックアップ設計`);
}
function exportJson(){
  state.generatedAt=new Date().toISOString();
  const safe=JSON.parse(JSON.stringify(state));
  const blob=new Blob([JSON.stringify(safe,null,2)],{type:"application/json"});const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=`jq_pwa_poc2_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)
}
$("heavyBtn").onclick=heavyTest;$("fetchBtn").onclick=fetchAndStore;$("analyzeBtn").onclick=analyze;$("inspectBtn").onclick=inspect;$("deleteBtn").onclick=removeDb;$("summaryBtn").onclick=summary;$("exportBtn").onclick=exportJson;
if("serviceWorker"in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}))}
