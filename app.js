const $ = (id) => document.getElementById(id);
const results = { env:null, opfs:null, sqlite:null, worker:null, api:null, generatedAt:null };

function setBox(id, state, text) {
  const el = $(id);
  el.className = "result " + (state || "");
  el.textContent = text;
}
function fmtBytes(n) {
  if (!Number.isFinite(n)) return "不明";
  const units=["B","KB","MB","GB","TB"];
  let i=0, x=n;
  while(x>=1024 && i<units.length-1){x/=1024;i++}
  return `${x.toFixed(i>=2?2:1)} ${units[i]}`;
}
function fmtMs(ms){ return `${ms.toFixed(0)} ms`; }
function safeUA(){ return navigator.userAgent || ""; }

async function envCheck(){
  setBox("envResult","running","確認中…");
  const out = {
    userAgent:safeUA(),
    standalone: window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true,
    opfs: !!(navigator.storage && navigator.storage.getDirectory),
    storageEstimate: !!(navigator.storage && navigator.storage.estimate),
    storagePersist: !!(navigator.storage && navigator.storage.persist),
    worker: typeof Worker !== "undefined",
    crossOriginIsolated: self.crossOriginIsolated === true
  };
  try{
    if(navigator.storage?.estimate){
      const e=await navigator.storage.estimate();
      out.quota=e.quota; out.usage=e.usage;
    }
    if(navigator.storage?.persisted){
      out.persisted=await navigator.storage.persisted();
    }
  }catch(e){out.storageError=String(e)}
  out.pass = out.opfs && out.worker;
  results.env = out;
  const state = out.pass ? "pass" : "fail";
  setBox("envResult",state,
`OPFS: ${out.opfs?"PASS":"FAIL"}
Web Worker: ${out.worker?"PASS":"FAIL"}
ホーム画面/PWA表示: ${out.standalone?"YES":"NO（Safariタブなら正常）"}
永続ストレージ済み: ${out.persisted===true?"YES":out.persisted===false?"NO":"不明"}
使用量: ${fmtBytes(out.usage||0)}
割当上限: ${fmtBytes(out.quota)}
UA: ${out.userAgent}`);
}

async function opfsTest(){
  const mb = Number($("opfsSize").value);
  const total = mb*1024*1024;
  const chunkSize = 4*1024*1024;
  $("opfsBtn").disabled=true;
  $("opfsMeter").style.width="0%";
  setBox("opfsResult","running",`${mb}MB 書き込み中…`);
  const out={sizeMB:mb};
  try{
    if(!navigator.storage?.getDirectory) throw new Error("OPFS未対応");
    try{
      if(navigator.storage.persist) out.persistRequest = await navigator.storage.persist();
      if(navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
    }catch(_){}
    const root=await navigator.storage.getDirectory();
    const fh=await root.getFileHandle("jq_pwa_opfs_test.bin",{create:true});
    const ws=await fh.createWritable();
    const buf=new Uint8Array(chunkSize);
    for(let i=0;i<buf.length;i+=4096) buf[i]=(i/4096)%251;
    let written=0;
    const t0=performance.now();
    while(written<total){
      const n=Math.min(chunkSize,total-written);
      await ws.write(n===chunkSize?buf:buf.slice(0,n));
      written+=n;
      $("opfsMeter").style.width=`${Math.min(100,written/total*100)}%`;
      await new Promise(r=>setTimeout(r,0));
    }
    await ws.close();
    const t1=performance.now();
    const file=await fh.getFile();
    const readStart=performance.now();
    const head=new Uint8Array(await file.slice(0,1024*1024).arrayBuffer());
    const tail=new Uint8Array(await file.slice(Math.max(0,file.size-1024*1024)).arrayBuffer());
    const readEnd=performance.now();
    out.fileSize=file.size;
    out.writeMs=t1-t0;
    out.writeMBps=mb/((t1-t0)/1000);
    out.read2MBms=readEnd-readStart;
    out.integrity = head.length>0 && tail.length>0;
    if(navigator.storage.estimate){
      const e=await navigator.storage.estimate();
      out.quota=e.quota; out.usage=e.usage;
    }
    await root.removeEntry("jq_pwa_opfs_test.bin");
    out.pass = out.fileSize===total && out.integrity;
    setBox("opfsResult",out.pass?"pass":"fail",
`PASS: ${out.pass?"YES":"NO"}
書込サイズ: ${fmtBytes(out.fileSize)}
書込時間: ${fmtMs(out.writeMs)}
書込速度: ${out.writeMBps.toFixed(1)} MB/s
2MB読取時間: ${fmtMs(out.read2MBms)}
永続化: ${out.persisted===true?"YES":out.persisted===false?"NO/未許可":"不明"}
現在使用量: ${fmtBytes(out.usage)}
割当上限: ${fmtBytes(out.quota)}
一時ファイル: 削除済み`);
  }catch(e){
    out.pass=false; out.error=String(e);
    setBox("opfsResult","fail","FAIL\n"+String(e));
  }finally{
    results.opfs=out;
    $("opfsBtn").disabled=false;
  }
}

let sqlInitPromise=null;
function loadSqlJs(){
  if(sqlInitPromise) return sqlInitPromise;
  sqlInitPromise = new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/sql-wasm.js";
    s.onload=async()=>{
      try{
        const SQL=await initSqlJs({locateFile:(f)=>`https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/${f}`});
        resolve(SQL);
      }catch(e){reject(e)}
    };
    s.onerror=()=>reject(new Error("SQLite-WASM CDN読み込み失敗"));
    document.head.appendChild(s);
  });
  return sqlInitPromise;
}

async function sqliteTest(){
  const rows=Number($("sqlRows").value);
  $("sqlBtn").disabled=true;
  $("sqlMeter").style.width="0%";
  setBox("sqlResult","running","SQLite-WASM読込中…");
  const out={rows};
  try{
    const SQL=await loadSqlJs();
    const db=new SQL.Database();
    db.run(`CREATE TABLE bars(
      code INTEGER NOT NULL,
      d INTEGER NOT NULL,
      close REAL NOT NULL,
      volume INTEGER NOT NULL,
      sector INTEGER NOT NULL
    );`);
    const stmt=db.prepare("INSERT INTO bars VALUES (?,?,?,?,?)");
    const batch=5000;
    const t0=performance.now();
    db.run("BEGIN");
    for(let i=0;i<rows;i++){
      stmt.run([1000+(i%3800), 20200101+(i%2400), 500+(i%5000)*0.1, 10000+(i%900000), i%33]);
      if((i+1)%batch===0){
        $("sqlMeter").style.width=`${Math.min(75,(i+1)/rows*75)}%`;
        if((i+1)%50000===0) await new Promise(r=>setTimeout(r,0));
      }
    }
    db.run("COMMIT");
    stmt.free();
    const insertEnd=performance.now();
    db.run("CREATE INDEX idx_bars_code_d ON bars(code,d);");
    const indexEnd=performance.now();
    $("sqlMeter").style.width="90%";
    const q0=performance.now();
    const r1=db.exec("SELECT sector, AVG(close), SUM(volume) FROM bars GROUP BY sector;");
    const q1=performance.now();
    const r2=db.exec("SELECT * FROM bars WHERE code=2500 ORDER BY d DESC LIMIT 200;");
    const q2=performance.now();
    const bytes=db.export();
    const q3=performance.now();
    out.insertMs=insertEnd-t0;
    out.indexMs=indexEnd-insertEnd;
    out.aggregateMs=q1-q0;
    out.indexQueryMs=q2-q1;
    out.exportMs=q3-q2;
    out.dbBytes=bytes.byteLength;
    out.pass = r1.length>0 && out.indexQueryMs < 5000;
    db.close();
    $("sqlMeter").style.width="100%";
    setBox("sqlResult",out.pass?"pass":"warn",
`${out.pass?"PASS":"要確認"}
行数: ${rows.toLocaleString()}
INSERT: ${fmtMs(out.insertMs)}
INDEX作成: ${fmtMs(out.indexMs)}
33業種集計: ${fmtMs(out.aggregateMs)}
銘柄+日付索引検索: ${fmtMs(out.indexQueryMs)}
DBサイズ: ${fmtBytes(out.dbBytes)}
※ これはSQLite-WASMのCPU/DB性能テスト。OPFS永続化性能はテスト1で別測定。`);
  }catch(e){
    out.pass=false; out.error=String(e);
    setBox("sqlResult","fail","FAIL\n"+String(e));
  }finally{
    results.sqlite=out;
    $("sqlBtn").disabled=false;
  }
}

async function workerTest(){
  $("workerBtn").disabled=true;
  setBox("workerResult","running","Workerで計算中… 画面が反応し続けるか測定しています。");
  const out={};
  try{
    const src=`
      self.onmessage=(ev)=>{
        const n=ev.data.n;
        let acc=0;
        const t=performance.now();
        for(let i=1;i<=n;i++){ acc=(acc + ((i*2654435761)>>>0)%1000003)%1000000007; }
        self.postMessage({ms:performance.now()-t,acc});
      };`;
    const blob=new Blob([src],{type:"text/javascript"});
    const w=new Worker(URL.createObjectURL(blob));
    let frames=0, maxGap=0, last=performance.now(), running=true;
    const tick=(t)=>{
      if(!running) return;
      frames++;
      maxGap=Math.max(maxGap,t-last); last=t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const t0=performance.now();
    const msg=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Worker timeout")),30000);
      w.onmessage=(e)=>{clearTimeout(timer);resolve(e.data)};
      w.onerror=(e)=>{clearTimeout(timer);reject(new Error(e.message||"Worker error"))};
      w.postMessage({n:18000000});
    });
    running=false;
    const t1=performance.now();
    w.terminate();
    out.workerMs=msg.ms; out.wallMs=t1-t0; out.frames=frames; out.maxFrameGapMs=maxGap;
    out.pass = frames>=3 && maxGap < 1000;
    setBox("workerResult",out.pass?"pass":"warn",
`${out.pass?"PASS":"要確認"}
Worker計算: ${fmtMs(out.workerMs)}
画面側フレーム数: ${frames}
最大フレーム間隔: ${fmtMs(maxGap)}
判定: ${out.pass?"計算をWorkerへ逃がせばUI維持可能":"iPhoneでの応答性を要確認"}`);
  }catch(e){
    out.pass=false; out.error=String(e);
    setBox("workerResult","fail","FAIL\n"+String(e));
  }finally{
    results.worker=out;
    $("workerBtn").disabled=false;
  }
}

async function apiTest(){
  const key=$("apiKey").value.trim();
  if(!key){setBox("apiResult","warn","APIキーを入力してから実行してください。");return}
  $("apiBtn").disabled=true;
  setBox("apiResult","running","J-Quants APIへ接続中…");
  const out={url:"https://api.jquants.com/v2/equities/bars/daily?code=86970"};
  try{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),20000);
    const t0=performance.now();
    const res=await fetch(out.url,{
      method:"GET",
      headers:{"x-api-key":key,"Accept":"application/json"},
      cache:"no-store",
      signal:ctrl.signal
    });
    clearTimeout(timer);
    out.ms=performance.now()-t0;
    out.status=res.status;
    out.corsReadable=true;
    let body="";
    try{ body=await res.text(); }catch(_){}
    out.bodyPrefix=body.slice(0,250);
    out.pass = res.ok;
    const state = res.ok ? "pass" : (res.status===401||res.status===403 ? "warn" : "warn");
    setBox("apiResult",state,
`${res.ok?"PASS":"HTTP応答あり（CORSは通過）"}
HTTP: ${res.status}
時間: ${fmtMs(out.ms)}
CORS: PASS（ブラウザから応答を読めました）
認証/データ取得: ${res.ok?"PASS":"FAILまたは権限不足"}
応答冒頭: ${out.bodyPrefix || "(empty)"}`);
  }catch(e){
    out.pass=false; out.corsReadable=false; out.error=String(e);
    setBox("apiResult","fail",
`FAIL
ブラウザfetch自体が完了しませんでした。
CORS / ネットワーク / Safari制約の可能性があります。
${String(e)}

※ APIキー自体の正誤とは別問題です。`);
  }finally{
    $("apiKey").value="";
    results.api=out;
    $("apiBtn").disabled=false;
  }
}

function summary(){
  const checks=[
    ["OPFS",results.opfs?.pass],
    ["SQLite-WASM",results.sqlite?.pass],
    ["Web Worker",results.worker?.pass],
    ["J-Quants直接接続",results.api?.corsReadable===true]
  ];
  const done=checks.filter(x=>x[1]!==undefined && x[1]!==null).length;
  const passed=checks.filter(x=>x[1]===true).length;
  let verdict="";
  if(done<4) verdict="まだ全テストが完了していません。";
  else if(passed===4) verdict="Local-first PWA本命で進める価値が高いです。";
  else if(passed===3 && results.api?.corsReadable!==true) verdict="ローカルPWAは有望。ただしJ-Quants取得だけ小さな中継サーバーが必要そうです。";
  else verdict="Local-first PWAは追加検証が必要です。";
  results.generatedAt=new Date().toISOString();
  setBox("summaryResult",passed===4?"pass":done===4?"warn":"running",
`${checks.map(([n,p])=>`${n}: ${p===true?"PASS":p===false?"FAIL":"未実行"}`).join("\n")}

総合: ${verdict}`);
}

function exportJson(){
  results.generatedAt=new Date().toISOString();
  const blob=new Blob([JSON.stringify(results,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`jq_pwa_test_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

$("envBtn").onclick=envCheck;
$("opfsBtn").onclick=opfsTest;
$("sqlBtn").onclick=sqliteTest;
$("workerBtn").onclick=workerTest;
$("apiBtn").onclick=apiTest;
$("summaryBtn").onclick=summary;
$("exportBtn").onclick=exportJson;

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
}
