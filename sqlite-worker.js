const status = (stage, detail="") => {
  self.postMessage({type:"status", stage, detail});
};

self.addEventListener("error", (e) => {
  self.postMessage({
    ok:false,
    type:"fatal",
    stage:"worker-global-error",
    error: e.message || "Worker global error",
    filename: e.filename || "",
    lineno: e.lineno || 0,
    colno: e.colno || 0
  });
});

self.addEventListener("unhandledrejection", (e) => {
  self.postMessage({
    ok:false,
    type:"fatal",
    stage:"worker-unhandled-rejection",
    error: String(e.reason?.stack || e.reason || "Unhandled rejection")
  });
});

function scalar(db,sql){
  let v=null;
  db.exec({sql,rowMode:"array",callback:(row)=>{if(v===null)v=row[0]}});
  return v;
}

async function initSqlite(){
  status("import-module", "/sqlite/index.mjs");
  const mod = await import("/sqlite/index.mjs");
  if (typeof mod.default !== "function") {
    throw new Error("sqlite-wasm default initializer was not found");
  }

  status("initialize-sqlite");
  const sqlite3 = await mod.default({
    print: (...a) => status("sqlite-print", a.join(" ")),
    printErr: (...a) => status("sqlite-stderr", a.join(" "))
  });

  status("sqlite-initialized", sqlite3?.version?.libVersion || "unknown");
  if(!sqlite3.oo1?.OpfsDb) throw new Error("OpfsDb is unavailable");
  return sqlite3;
}

self.onmessage=async(e)=>{
  const t0=performance.now(), cmd=e.data?.cmd, dbName=e.data?.dbName||"/jq_market_v7c.sqlite";
  let db;
  try{
    status("start", cmd);
    const sqlite3=await initSqlite();

    status("find-opfs-vfs");
    const opfsPtr=sqlite3.capi.sqlite3_vfs_find("opfs");
    const opfsAvailable=!!opfsPtr;
    if(!opfsAvailable) throw new Error("SQLite OPFS VFS unavailable");

    status("open-db-readonly", dbName);
    db=new sqlite3.oo1.OpfsDb(dbName,"r");

    if(cmd==="open"){
      status("query-metadata");
      const tableCount=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table'")||0);
      const hasBars=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)>0;
      const hasSync=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_log'")||0)>0;
      const barsCount=hasBars?Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0):0;
      const minDate=hasBars?scalar(db,"SELECT MIN(date) FROM bars_daily"):null;
      const maxDate=hasBars?scalar(db,"SELECT MAX(date) FROM bars_daily"):null;
      const syncOk=hasSync?Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='OK'")||0):0;
      db.close();db=null;
      self.postMessage({
        ok:true,type:"result",sqliteVersion:sqlite3.version.libVersion,
        opfsAvailable,filename:dbName,tableCount,barsCount,minDate,maxDate,syncOk,
        elapsedMs:Math.round(performance.now()-t0)
      });
    }else if(cmd==="quick"){
      status("pragma-quick-check");
      const quick=String(scalar(db,"PRAGMA quick_check")??"");
      db.close();db=null;
      self.postMessage({ok:true,type:"result",quick,elapsedMs:Math.round(performance.now()-t0)});
    }else{
      throw new Error("unknown command");
    }
  }catch(err){
    try{if(db)db.close()}catch(_){}
    self.postMessage({
      ok:false,type:"result",stage:"caught-exception",
      error:String(err?.stack||err),
      elapsedMs:Math.round(performance.now()-t0)
    });
  }
};
