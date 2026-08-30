const status = (stage, detail="") => {
  self.postMessage({type:"status", stage, detail});
};

self.addEventListener("error", (e) => {
  self.postMessage({
    ok:false, type:"fatal", stage:"worker-global-error",
    error:e.message || "Worker global error",
    filename:e.filename || "", lineno:e.lineno || 0, colno:e.colno || 0
  });
});

self.addEventListener("unhandledrejection", (e) => {
  self.postMessage({
    ok:false, type:"fatal", stage:"worker-unhandled-rejection",
    error:String(e.reason?.stack || e.reason || "Unhandled rejection")
  });
});

function scalar(db, sql){
  let v=null;
  db.exec({sql,rowMode:"array",callback:(row)=>{if(v===null)v=row[0]}});
  return v;
}

async function initSqlite(){
  status("runtime-capabilities",
    `crossOriginIsolated=${crossOriginIsolated}; `+
    `SharedArrayBuffer=${typeof SharedArrayBuffer!=="undefined"}; `+
    `Atomics.waitAsync=${typeof Atomics?.waitAsync==="function"}; `+
    `WebLocks=${!!navigator?.locks}`
  );

  if(!crossOriginIsolated) throw new Error("crossOriginIsolated=false");
  if(typeof SharedArrayBuffer==="undefined") throw new Error("SharedArrayBuffer unavailable");
  if(typeof Atomics?.waitAsync!=="function") throw new Error("Atomics.waitAsync unavailable: opfs-wl cannot install");
  if(!navigator?.locks) throw new Error("Web Locks unavailable: opfs-wl cannot install");

  // SQLite 3.53 can pre-disable individual VFSes.
  // We intentionally disable the classic 'opfs' VFS because r2 failed during
  // initialization before DB open, most likely in the classic OPFS setup path.
  // Keep only opfs-wl for transparent OPFS file access.
  globalThis.sqlite3ApiConfig = {
    disable: {
      vfs: {
        "kvvfs": true,
        "opfs": true,
        "opfs-sahpool": true,
        "opfs-wl": false
      }
    }
  };

  status("import-module", "/sqlite/index.mjs");
  const mod = await import("/sqlite/index.mjs");
  if(typeof mod.default!=="function") throw new Error("sqlite-wasm default initializer not found");

  status("initialize-sqlite", "classic opfs disabled; opfs-wl enabled");
  const sqlite3 = await mod.default({
    locateFile: (path) => {
      const url = new URL(`/sqlite/${path}`, self.location.origin).href;
      status("locate-file", `${path} -> ${url}`);
      return url;
    },
    print: (...a) => status("sqlite-print", a.join(" ")),
    printErr: (...a) => status("sqlite-stderr", a.join(" "))
  });

  status("sqlite-initialized", sqlite3?.version?.libVersion || "unknown");
  return sqlite3;
}

async function inspectVfs(sqlite3){
  const names=["opfs-wl","opfs","opfs-sahpool","memdb"];
  const found={};
  for(const n of names){
    try{found[n]=!!sqlite3.capi.sqlite3_vfs_find(n)}catch(_){found[n]=false}
  }
  return found;
}

self.onmessage = async(e) => {
  const cmd=e.data?.cmd;
  const dbName=e.data?.dbName || "/jq_market_v7c.sqlite";
  const t0=performance.now();
  let db;
  try{
    status("start", cmd);
    const sqlite3=await initSqlite();
    const vfs=await inspectVfs(sqlite3);
    status("vfs-list", JSON.stringify(vfs));

    if(cmd==="init"){
      self.postMessage({
        ok:true,type:"result",
        sqliteVersion:sqlite3.version.libVersion,
        vfs,
        opfsWlClass:!!sqlite3.oo1?.OpfsWlDb,
        elapsedMs:Math.round(performance.now()-t0)
      });
      return;
    }

    if(!vfs["opfs-wl"] || !sqlite3.oo1?.OpfsWlDb){
      throw new Error(`opfs-wl unavailable after init. vfs=${JSON.stringify(vfs)} class=${!!sqlite3.oo1?.OpfsWlDb}`);
    }

    status("open-db-readonly-opfs-wl", dbName);
    db=new sqlite3.oo1.OpfsWlDb(dbName, "r");

    if(cmd==="open"){
      status("query-metadata");
      const tableCount=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table'")||0);
      const hasBars=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)>0;
      const hasSync=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_log'")||0)>0;
      const barsCount=hasBars?Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0):0;
      const minDate=hasBars?scalar(db,"SELECT MIN(date) FROM bars_daily"):null;
      const maxDate=hasBars?scalar(db,"SELECT MAX(date) FROM bars_daily"):null;
      const syncOk=hasSync?Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='OK'")||0):0;
      db.close(); db=null;
      self.postMessage({
        ok:true,type:"result", sqliteVersion:sqlite3.version.libVersion,
        vfs, vfsUsed:"opfs-wl", filename:dbName,
        tableCount,barsCount,minDate,maxDate,syncOk,
        elapsedMs:Math.round(performance.now()-t0)
      });
    } else if(cmd==="quick"){
      status("pragma-quick-check");
      const quick=String(scalar(db,"PRAGMA quick_check")??"");
      db.close(); db=null;
      self.postMessage({
        ok:true,type:"result",quick,vfsUsed:"opfs-wl",
        elapsedMs:Math.round(performance.now()-t0)
      });
    } else {
      throw new Error("unknown command");
    }
  }catch(err){
    try{if(db)db.close()}catch(_){}
    self.postMessage({
      ok:false,type:"result",stage:"caught-exception",
      error:String(err?.stack || err),
      elapsedMs:Math.round(performance.now()-t0)
    });
  }
};