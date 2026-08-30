const status=(stage,detail="")=>self.postMessage({type:"status",stage,detail});
function scalar(db,sql){let v=null;db.exec({sql,rowMode:"array",callback:r=>{if(v===null)v=r[0]}});return v}
function poolFileNamesSafe(p){
  try{return Array.from(p.getFileNames?.()||[]).map(String)}catch(_){return []}
}
function resolveExistingMarketDb(p,requested){
  const files=poolFileNamesSafe(p);
  const base=String(requested||"").replace(/^\/+/,"");
  const candidates=[];
  const add=x=>{if(x&&!candidates.includes(x))candidates.push(x)};
  add(requested); add("/"+base);
  for(const f of files){
    if(f.replace(/^\/+/,"")===base) add(f.startsWith("/")?f:"/"+f);
  }
  const errors=[];
  for(const candidate of candidates){
    let probe=null;
    try{
      probe=new p.OpfsSAHPoolDb(candidate,"r");
      const hasBars=Number(scalar(probe,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)>0;
      probe.close(); probe=null;
      if(hasBars) return {name:candidate,files};
      errors.push(candidate+": bars_daily missing");
    }catch(e){
      try{if(probe)probe.close()}catch(_){}
      errors.push(candidate+": "+String(e?.message||e));
    }
  }
  throw new Error(`Market DataLake not found/openable. requested=${requested}; pool files=${JSON.stringify(files)}; tried=${errors.join(" | ")}`);
}
let sqlite3=null,pool=null;
async function initSqlite(){
 if(sqlite3&&pool)return {sqlite3,pool};
 status("import-module","/sqlite/index.mjs");
 const mod=await import("/sqlite/index.mjs");
 status("initialize-sqlite","SQLite 3.53 + opfs-sahpool");
 sqlite3=await mod.default({locateFile:p=>new URL(`/sqlite/${p}`,self.location.origin).href,print:(...a)=>status("sqlite-print",a.join(" ")),printErr:(...a)=>status("sqlite-stderr",a.join(" "))});
 if(typeof sqlite3.installOpfsSAHPoolVfs!=="function") throw new Error("installOpfsSAHPoolVfs() not exposed by this build");
 status("install-sahpool","installOpfsSAHPoolVfs()");
 pool=await sqlite3.installOpfsSAHPoolVfs({name:"jq-sahpool",directory:".jq-sahpool-v7c-r5",initialCapacity:6});
 return {sqlite3,pool};
}
async function importFile(file,name){
 const {pool}=await initSqlite();
 const reader=file.stream().getReader(); let read=0,chunks=0;
 status("stream-import",`0 / ${file.size}`);
 const bytes=await pool.importDb(name,async()=>{
   const {done,value}=await reader.read();
   if(done)return undefined;
   read+=value.byteLength;chunks++;
   if(chunks%8===0)status("stream-import",`${read} / ${file.size}`);
   return value;
 });
 return {bytes,chunks};
}

function execRows(db,sql,bind=[]){
 const rows=[]; db.exec({sql,bind,rowMode:"object",callback:r=>rows.push(r)}); return rows;
}
function ensureRuntimeTables(db){
 db.exec(`CREATE TABLE IF NOT EXISTS web_sync_checkpoint(
   dataset TEXT PRIMARY KEY,
   last_success_date TEXT,
   updated_at TEXT NOT NULL,
   note TEXT
 )`);
 db.exec(`CREATE TABLE IF NOT EXISTS web_runtime_migrations(
   migration_id TEXT PRIMARY KEY,
   applied_at TEXT NOT NULL,
   detail TEXT
 )`);
 db.exec({sql:`INSERT OR IGNORE INTO web_runtime_migrations(migration_id,applied_at,detail)
   VALUES(?,?,?)`,bind:["v7d-runtime-1",new Date().toISOString(),"SQLite-WASM direct-write runtime tables"]});
}


function qident(x){return '"'+String(x).replaceAll('"','""')+'"'}
function tableInfo(db,table){
 const rows=[]; db.exec({sql:`PRAGMA table_info(${qident(table)})`,rowMode:"object",callback:r=>rows.push(r)});
 return rows;
}
function primaryKeyCols(info){
 return info.filter(r=>Number(r.pk)>0).sort((a,b)=>Number(a.pk)-Number(b.pk)).map(r=>r.name);
}
function dateLikeCols(info){
 return info.map(r=>r.name).filter(n=>/^(date|Date|trade_date|TradeDate)$/i.test(n));
}
function ensureV7dTables(db){
 db.exec(`CREATE TABLE IF NOT EXISTS web_sync_checkpoint(
   dataset TEXT PRIMARY KEY,
   last_success_date TEXT,
   updated_at TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'OK',
   rows_written INTEGER NOT NULL DEFAULT 0,
   note TEXT
 )`);
 db.exec(`CREATE TABLE IF NOT EXISTS web_sync_run(
   run_id TEXT PRIMARY KEY,
   dataset TEXT NOT NULL,
   started_at TEXT NOT NULL,
   finished_at TEXT,
   status TEXT NOT NULL,
   rows_written INTEGER NOT NULL DEFAULT 0,
   last_date TEXT,
   error TEXT
 )`);
 db.exec(`CREATE TABLE IF NOT EXISTS web_no_data_dates(
   dataset TEXT NOT NULL,
   date TEXT NOT NULL,
   checked_at TEXT NOT NULL,
   reason TEXT,
   PRIMARY KEY(dataset,date)
 )`);
 db.exec(`CREATE TABLE IF NOT EXISTS web_runtime_migrations(
   migration_id TEXT PRIMARY KEY,
   applied_at TEXT NOT NULL,
   detail TEXT
 )`);
 db.exec({sql:`INSERT OR IGNORE INTO web_runtime_migrations(migration_id,applied_at,detail)
   VALUES(?,?,?)`,bind:["v7d-alpha2-runtime",new Date().toISOString(),"direct-write + checkpoint + date-batch engine"]});
}
function sampleRows(db,table,limit=3){
 const out=[]; db.exec({sql:`SELECT * FROM ${qident(table)} LIMIT ${Number(limit)}`,rowMode:"object",callback:r=>out.push(r)}); return out;
}

self.onmessage=async e=>{const d=e.data||{},cmd=d.cmd,name=d.dbName||"/jq_market_v7c.sqlite",t0=performance.now();let db;try{
 const x=await initSqlite(); const s=x.sqlite3,p=x.pool; const vfs=!!s.capi.sqlite3_vfs_find(p.vfsName);
 if(cmd==="init"){self.postMessage({ok:true,type:"result",sqliteVersion:s.version.libVersion,vfsName:p.vfsName,vfs,poolClass:!!p.OpfsSAHPoolDb,capacity:p.getCapacity(),files:p.getFileNames(),elapsedMs:Math.round(performance.now()-t0)});return;}
 
  if(cmd==="backup-stats"){
 const resolved=resolveExistingMarketDb(p,name), marketName=resolved.name;db=new p.OpfsSAHPoolDb(marketName,"r");
 const pc=Number(scalar(db,"PRAGMA page_count")||0),ps=Number(scalar(db,"PRAGMA page_size")||0),rows=Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0);
 db.close();db=null;self.postMessage({ok:true,type:"result",dbBytes:pc*ps,rows});return;
}
if(cmd==="backup-create"){
 const resolved=resolveExistingMarketDb(p,name),marketName=resolved.name,backupName="/jq_market_snapshot.sqlite";
 if(p.getFileNames().includes(backupName))p.unlink(backupName);
 db=new p.OpfsSAHPoolDb(marketName,"r");status("backup","VACUUM INTO snapshot");db.exec(`VACUUM INTO '${backupName}'`);db.close();db=null;
 const b=new p.OpfsSAHPoolDb(backupName,"r"),qc=String(scalar(b,"PRAGMA quick_check")||""),rows=Number(scalar(b,"SELECT COUNT(*) FROM bars_daily")||0),minDate=scalar(b,"SELECT MIN(date) FROM bars_daily"),maxDate=scalar(b,"SELECT MAX(date) FROM bars_daily"),pc=Number(scalar(b,"PRAGMA page_count")||0),ps=Number(scalar(b,"PRAGMA page_size")||0);b.close();
 self.postMessage({ok:qc==="ok",type:"result",backupName,qc,rows,minDate,maxDate,dbBytes:pc*ps,elapsedMs:Math.round(performance.now()-t0)});return;
}
if(cmd==="pool-diagnostic"){
    const files=poolFileNamesSafe(p);
    const requested=name, base=String(requested||"").replace(/^\/+/,"");
    const normalized=files.map(f=>({raw:f,base:String(f).replace(/^\/+/,"")}));
    self.postMessage({ok:true,type:"result",sqliteVersion:s.version.libVersion,vfsName:p.vfsName,
      capacity:p.getCapacity(),requested,base,files,normalized,
      exactRaw:files.includes(requested),exactBase:normalized.filter(x=>x.base===base).map(x=>x.raw),
      elapsedMs:Math.round(performance.now()-t0)});return;
  }
  if(cmd==="pool-probe-candidates"){
    const files=poolFileNamesSafe(p);
    const requested=name, base=String(requested||"").replace(/^\/+/,"");
    const candidates=[]; const add=x=>{if(x&&!candidates.includes(x))candidates.push(x)};
    add(requested); add("/"+base); add(base);
    for(const f of files){add(f);add(f.startsWith("/")?f:"/"+f)}
    const probes=[];
    for(const candidate of candidates){
      let q=null;
      try{
        q=new p.OpfsSAHPoolDb(candidate,"r");
        const tables=Number(scalar(q,"SELECT COUNT(*) FROM sqlite_master WHERE type='table'")||0);
        const hasBars=Number(scalar(q,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)>0;
        let bars=null,minDate=null,maxDate=null;
        if(hasBars){bars=Number(scalar(q,"SELECT COUNT(*) FROM bars_daily")||0);minDate=scalar(q,"SELECT MIN(date) FROM bars_daily");maxDate=scalar(q,"SELECT MAX(date) FROM bars_daily")}
        q.close();q=null; probes.push({candidate,open:"PASS",tables,hasBars,bars,minDate,maxDate});
      }catch(err){try{if(q)q.close()}catch(_){} probes.push({candidate,open:"FAIL",error:String(err?.message||err)})}
    }
    self.postMessage({ok:true,type:"result",requested,files,candidates,probes,elapsedMs:Math.round(performance.now()-t0)});return;
  }
  if(cmd==="import"){if(!d.file)throw new Error("File missing"); const out=await importFile(d.file,name); self.postMessage({ok:true,type:"result",...out,vfsName:p.vfsName,files:p.getFileNames(),elapsedMs:Math.round(performance.now()-t0)});return;}
 if(cmd==="smoke-write"){
   const smoke="/jq_sah_smoke.sqlite";
   try{if(p.getFileNames().includes(smoke))p.unlink(smoke)}catch(_){}
   db=new p.OpfsSAHPoolDb(smoke,"c");
   db.exec("CREATE TABLE smoke_test(id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
   db.exec({sql:"INSERT INTO smoke_test(value) VALUES(?)",bind:["SAHPOOL-PERSIST-OK"]});
   const rows=Number(scalar(db,"SELECT COUNT(*) FROM smoke_test")||0);
   db.close();db=null;
   self.postMessage({ok:true,type:"result",smoke,rows,files:p.getFileNames(),elapsedMs:Math.round(performance.now()-t0)});return;
 }
 if(cmd==="smoke-read"){
   const smoke="/jq_sah_smoke.sqlite";
   if(!p.getFileNames().includes(smoke))throw new Error("smoke DB missing after Worker restart");
   db=new p.OpfsSAHPoolDb(smoke,"r");
   const rows=Number(scalar(db,"SELECT COUNT(*) FROM smoke_test")||0);
   const value=String(scalar(db,"SELECT value FROM smoke_test LIMIT 1")||"");
   db.close();db=null;
   self.postMessage({ok:true,type:"result",smoke,rows,value,persisted:rows===1&&value==="SAHPOOL-PERSIST-OK",elapsedMs:Math.round(performance.now()-t0)});return;
 }





 if(cmd==="bars-gap-scan"){
   const resolved=resolveExistingMarketDb(p,name), marketName=resolved.name;
   const payload=e.data.payload||{}, from=payload.from, to=payload.to;
   if(!from||!to)throw new Error("from/to missing");
   db=new p.OpfsSAHPoolDb(marketName,"r");
   const rows=execRows(db,`SELECT DISTINCT date FROM bars_daily WHERE date>=? AND date<=? ORDER BY date`,[from,to]);
   let noData=[]; try{noData=execRows(db,`SELECT date FROM web_no_data_dates WHERE dataset='bars_daily' AND date>=? AND date<=? ORDER BY date`,[from,to])}catch(_){}
   db.close();db=null;
   self.postMessage({ok:true,type:"result",from,to,dates:rows.map(r=>r.date),noDataDates:noData.map(r=>r.date),elapsedMs:Math.round(performance.now()-t0)});return;
 }


 if(cmd==="bars-write-benchmark"){
   const resolved=resolveExistingMarketDb(p,name), marketName=resolved.name;
   const payload=e.data.payload||{}, day=payload.date, rows=payload.rows||[];
   if(!day||!rows.length)throw new Error("benchmark requires date and rows");
   db=new p.OpfsSAHPoolDb(marketName,"c"); ensureV7dTables(db);
   try{db.exec("PRAGMA temp_store=MEMORY; PRAGMA cache_size=-32768;")}catch(_){}
   const info=tableInfo(db,"bars_daily"), cols=info.map(x=>x.name), pk=primaryKeyCols(info);
   const aliases={
     date:["Date","date"], code:["Code","code"], o:["O","o"], h:["H","h"], l:["L","l"], c:["C","c"],
     upper_limit:["UL","upper_limit"], lower_limit:["LL","lower_limit"], volume:["Vo","Volume","volume"],
     value:["Va","Value","value"], adj_factor:["AdjFactor","adj_factor"], adj_o:["AdjO","adj_o"],
     adj_h:["AdjH","adj_h"], adj_l:["AdjL","adj_l"], adj_c:["AdjC","adj_c"], adj_volume:["AdjVo","adj_volume"],
     raw_json:["__RAW_JSON__"]
   };
   function pick2(obj,c){
     if(c==="raw_json") return JSON.stringify(obj);
     for(const k of (aliases[c]||[c])) if(Object.prototype.hasOwnProperty.call(obj,k)) return obj[k];
     return null;
   }
   const insertCols=cols.filter(c=>pick2(rows[0],c)!==null || ["date","code"].includes(c.toLowerCase()));
   const updateCols=insertCols.filter(c=>!pk.includes(c));
   const conflict=pk.length?` ON CONFLICT(${pk.map(qident).join(",")}) DO UPDATE SET `+
     updateCols.map(c=>`${qident(c)}=excluded.${qident(c)}`).join(","):"";
   const sql=`INSERT INTO bars_daily(${insertCols.map(qident).join(",")}) VALUES(${insertCols.map(()=>"?").join(",")})${conflict}`;
   const tWrite=performance.now();
   db.exec("BEGIN IMMEDIATE");
   let n=0, stmt=null;
   try{
     stmt=db.prepare(sql);
     for(const r of rows){
       stmt.bind(insertCols.map(c=>pick2(r,c)));
       stmt.step(); stmt.reset(); n++;
     }
     stmt.finalize(); stmt=null;
     db.exec("COMMIT");
   }catch(err){
     try{if(stmt)stmt.finalize()}catch(_){}
     try{db.exec("ROLLBACK")}catch(_){}
     throw err;
   }
   const writeMs=Math.round(performance.now()-tWrite);
   db.close();db=null;
   self.postMessage({ok:true,type:"result",date:day,rows:n,writeMs,rowsPerSec:writeMs?Math.round(n/(writeMs/1000)):null});return;
 }

 if(cmd==="bars-auto-state"){
   const resolved=resolveExistingMarketDb(p,name), marketName=resolved.name;
   db=new p.OpfsSAHPoolDb(marketName,"r");
   const stats=execRows(db,`SELECT MIN(date) AS min_date, MAX(date) AS max_date,
     COUNT(*) AS rows, COUNT(DISTINCT date) AS distinct_dates FROM bars_daily`);
   let checkpoint=[];
   try{checkpoint=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset='bars_daily_auto'")}catch(_){}
   let jqcheckpoint=[];
   try{jqcheckpoint=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset='bars_daily_jquants'")}catch(_){}
   let syncLog=[];
   try{syncLog=execRows(db,`SELECT COUNT(*) AS n, MIN(sync_date) AS min_date, MAX(sync_date) AS max_date
     FROM sync_log WHERE dataset='bars_daily' OR dataset LIKE '%bars%'`)}catch(_){}
   db.close();db=null;
   self.postMessage({ok:true,type:"result",stats:stats[0]||{},checkpoint,jqcheckpoint,syncLog:syncLog[0]||{},elapsedMs:Math.round(performance.now()-t0)});return;
 }
 if(cmd==="bars-auto-no-data"){
   const resolved=resolveExistingMarketDb(p,name), marketName=resolved.name;
   const payload=e.data.payload||{}, day=payload.date, progressDataset=payload.progressDataset||"bars_daily_auto";
   if(!day)throw new Error("date missing");
   db=new p.OpfsSAHPoolDb(marketName,"c"); ensureV7dTables(db);
   db.exec("BEGIN IMMEDIATE");
   try{
     db.exec({sql:`INSERT INTO web_no_data_dates(dataset,date,checked_at,reason) VALUES(?,?,?,?)
       ON CONFLICT(dataset,date) DO UPDATE SET checked_at=excluded.checked_at,reason=excluded.reason`,
       bind:["bars_daily",day,new Date().toISOString(),"API returned 0 rows"]});
     db.exec({sql:`INSERT INTO web_sync_checkpoint(dataset,last_success_date,updated_at,status,rows_written,note)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(dataset) DO UPDATE SET
       last_success_date=CASE WHEN excluded.last_success_date>web_sync_checkpoint.last_success_date THEN excluded.last_success_date ELSE web_sync_checkpoint.last_success_date END,
       updated_at=excluded.updated_at,status=excluded.status,note=excluded.note`,
       bind:[progressDataset,day,new Date().toISOString(),"OK",0,"API returned 0 rows"]});
     db.exec("COMMIT");
   }catch(err){try{db.exec("ROLLBACK")}catch(_){} throw err}
   const cp=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset=?",[progressDataset]);
   db.close();db=null;
   self.postMessage({ok:true,type:"result",date:day,rows:0,checkpoint:cp,elapsedMs:Math.round(performance.now()-t0)});return;
 }

 if(cmd==="bars-auto-mark"){
   const resolved=resolveExistingMarketDb(p,name), marketName=resolved.name;
   const payload=e.data.payload||{}, day=payload.date, n=Number(payload.rows||0), progressDataset=payload.progressDataset||"bars_daily_auto";
   if(!day)throw new Error("date missing");
   db=new p.OpfsSAHPoolDb(marketName,"c"); ensureV7dTables(db);
   db.exec({sql:`INSERT INTO web_sync_checkpoint(dataset,last_success_date,updated_at,status,rows_written,note)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(dataset) DO UPDATE SET
     last_success_date=CASE WHEN excluded.last_success_date>web_sync_checkpoint.last_success_date THEN excluded.last_success_date ELSE web_sync_checkpoint.last_success_date END,
     updated_at=excluded.updated_at,status=excluded.status,
     rows_written=web_sync_checkpoint.rows_written+excluded.rows_written,note=excluded.note`,
     bind:[progressDataset,day,new Date().toISOString(),"OK",n,"sync committed"]});
   const cp=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset=?",[progressDataset]);
   db.close();db=null;
   self.postMessage({ok:true,type:"result",checkpoint:cp,elapsedMs:Math.round(performance.now()-t0)});return;
 }

 if(cmd==="write-gate-test"){
   const resolved=resolveExistingMarketDb(p,name), marketName=resolved.name;
   db=new p.OpfsSAHPoolDb(marketName,"c"); ensureV7dTables(db);
   const sample=execRows(db,"SELECT code,date,c FROM bars_daily ORDER BY date DESC, code LIMIT 1");
   if(!sample.length)throw new Error("bars_daily sample missing");
   const r=sample[0], before=Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0);
   db.exec("BEGIN IMMEDIATE");
   try{
     db.exec({sql:"UPDATE bars_daily SET c=c WHERE code=? AND date=?",bind:[r.code,r.date]});
     db.exec("COMMIT");
   }catch(err){try{db.exec("ROLLBACK")}catch(_){} throw err}
   const after=Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0);
   db.close();db=null;
   self.postMessage({ok:true,type:"result",marketName,sample:r,before,after,unchanged:before===after,elapsedMs:Math.round(performance.now()-t0)});return;
 }
 if(cmd==="jquants-bars-write"){
   const resolved=resolveExistingMarketDb(p,name), marketName=resolved.name;
   const payload=e.data.payload||{}, day=payload.date, rows=payload.rows||[], checkpointDataset=payload.checkpointDataset||"bars_daily_jquants";
   if(!day)throw new Error("date missing");
   db=new p.OpfsSAHPoolDb(marketName,"c"); ensureV7dTables(db);
   try{db.exec("PRAGMA temp_store=MEMORY; PRAGMA cache_size=-32768;")}catch(_){}
   const info=tableInfo(db,"bars_daily"), cols=info.map(x=>x.name), pk=primaryKeyCols(info);
   if(!cols.length)throw new Error("bars_daily schema missing");
   const aliases={
     date:["Date","date"], code:["Code","code"],
     o:["O","o","Open","open"], h:["H","h","High","high"], l:["L","l","Low","low"], c:["C","c","Close","close"],
     upper_limit:["UL","UpperLimit","upper_limit"], lower_limit:["LL","LowerLimit","lower_limit"],
     volume:["Vo","Volume","volume"], value:["Va","Value","TurnoverValue","value","turnover_value"],
     adj_factor:["AdjFactor","AdjustmentFactor","adj_factor","adjustment_factor"],
     adj_o:["AdjO","AdjustmentOpen","adj_o","adjustment_open"],
     adj_h:["AdjH","AdjustmentHigh","adj_h","adjustment_high"],
     adj_l:["AdjL","AdjustmentLow","adj_l","adjustment_low"],
     adj_c:["AdjC","AdjustmentClose","adj_c","adjustment_close"],
     adj_volume:["AdjVo","AdjustmentVolume","adj_volume","adjustment_volume"],
     raw_json:["__RAW_JSON__"],
     open:["O","Open","open"], high:["H","High","high"], low:["L","Low","low"], close:["C","Close","close"],
     turnover_value:["Va","TurnoverValue","turnover_value"],
     adjustment_factor:["AdjFactor","AdjustmentFactor","adjustment_factor"],
     adjustment_open:["AdjO","AdjustmentOpen","adjustment_open"],
     adjustment_high:["AdjH","AdjustmentHigh","adjustment_high"],
     adjustment_low:["AdjL","AdjustmentLow","adjustment_low"],
     adjustment_close:["AdjC","AdjustmentClose","adjustment_close"],
     adjustment_volume:["AdjVo","AdjustmentVolume","adjustment_volume"],
     market_cap:["MktCap","MarketCap","market_cap"], ex_rights:["ExRT","ExRights","ex_rights"]
   };
   function pick(obj,c){
     if(c==="raw_json") return JSON.stringify(obj);
     const candidates=aliases[c]||[c];
     for(const k of candidates) if(Object.prototype.hasOwnProperty.call(obj,k)) return obj[k];
     return null;
   }
   const insertCols=cols.filter(c=>rows.length && (pick(rows[0],c)!==null || ["date","code"].includes(c.toLowerCase())));
   if(!insertCols.length)throw new Error("No compatible columns between API response and bars_daily");
   const conflict=pk.length?` ON CONFLICT(${pk.map(qident).join(",")}) DO UPDATE SET `+
     insertCols.filter(c=>!pk.includes(c)).map(c=>`${qident(c)}=excluded.${qident(c)}`).join(","):"";
   const sql=`INSERT INTO ${qident("bars_daily")}(${insertCols.map(qident).join(",")}) VALUES(${insertCols.map(()=>"?").join(",")})${conflict}`;
   const runId=`jqd-${day}-${Date.now()}`;
   db.exec({sql:"INSERT INTO web_sync_run(run_id,dataset,started_at,status) VALUES(?,?,?,?)",
     bind:[runId,checkpointDataset,new Date().toISOString(),"RUNNING"]});
   db.exec("BEGIN IMMEDIATE");
   try{
     let n=0;
     const stmt=db.prepare(sql);
     try{
       const total=rows.length;
       for(const r of rows){
         stmt.bind(insertCols.map(c=>pick(r,c)));
         stmt.step();
         stmt.reset();
         n++;
         if(n%500===0) status("fast-write",`${day}: ${n}/${total} rows`);
       }
     } finally {
       stmt.finalize();
     }
     db.exec({sql:`INSERT INTO web_sync_checkpoint(dataset,last_success_date,updated_at,status,rows_written,note)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(dataset) DO UPDATE SET
       last_success_date=CASE WHEN excluded.last_success_date>web_sync_checkpoint.last_success_date THEN excluded.last_success_date ELSE web_sync_checkpoint.last_success_date END,
       updated_at=excluded.updated_at,status=excluded.status,rows_written=web_sync_checkpoint.rows_written+excluded.rows_written,note=excluded.note`,
       bind:[checkpointDataset,day,new Date().toISOString(),"OK",n,"J-Quants daily bars committed"]});
     db.exec("COMMIT");
     db.exec({sql:"UPDATE web_sync_run SET finished_at=?,status='OK',rows_written=?,last_date=? WHERE run_id=?",
       bind:[new Date().toISOString(),n,day,runId]});
     const cp=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset=?",[checkpointDataset]);
     const verify=execRows(db,`SELECT * FROM ${qident("bars_daily")} WHERE ${qident(pk.includes("date")?"date":insertCols[0])}=? LIMIT 1`,[day]);
     db.close();db=null;
     self.postMessage({ok:true,type:"result",date:day,rows:n,columns:insertCols,schemaColumns:cols,pk,checkpoint:cp,verify,elapsedMs:Math.round(performance.now()-t0)});return;
   }catch(err){
     try{db.exec("ROLLBACK")}catch(_){}
     try{db.exec({sql:"UPDATE web_sync_run SET finished_at=?,status='ERROR',error=? WHERE run_id=?",
       bind:[new Date().toISOString(),String(err),runId]})}catch(_){}
     throw err;
   }
 }

 if(cmd==="schema-probe"){
   if(!p.getFileNames().includes(name))throw new Error(`DB not found: ${name}`);
   db=new p.OpfsSAHPoolDb(name,"r");
   const tables=[];db.exec({sql:"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",rowMode:"array",callback:r=>tables.push(r[0])});
   const details={};
   for(const t of tables){
     const info=tableInfo(db,t);
     details[t]={columns:info.map(x=>x.name),pk:primaryKeyCols(info),dateCols:dateLikeCols(info),sample:sampleRows(db,t,1)};
   }
   db.close();db=null;
   self.postMessage({ok:true,type:"result",tables,details,elapsedMs:Math.round(performance.now()-t0)});return;
 }
 if(cmd==="date-batch-test"){
   if(!p.getFileNames().includes(name))throw new Error(`DB not found: ${name}`);
   db=new p.OpfsSAHPoolDb(name,"c"); ensureV7dTables(db);
   db.exec(`CREATE TABLE IF NOT EXISTS web_daily_batch_probe(
     date TEXT NOT NULL, code TEXT NOT NULL, close REAL, volume REAL,
     PRIMARY KEY(date,code)
   )`);
   const runId=`probe-${Date.now()}`, days=["2026-08-27","2026-08-28","2026-08-29"];
   db.exec({sql:"INSERT INTO web_sync_run(run_id,dataset,started_at,status) VALUES(?,?,?,?)",
     bind:[runId,"web_daily_batch_probe",new Date().toISOString(),"RUNNING"]});
   let total=0;
   for(const day of days){
     db.exec("BEGIN IMMEDIATE");
     try{
       for(let i=0;i<5;i++){
         const code=String(9000+i);
         db.exec({sql:`INSERT INTO web_daily_batch_probe(date,code,close,volume) VALUES(?,?,?,?)
           ON CONFLICT(date,code) DO UPDATE SET close=excluded.close,volume=excluded.volume`,
           bind:[day,code,100+i,1000+i]});
         total++;
       }
       db.exec({sql:`INSERT INTO web_sync_checkpoint(dataset,last_success_date,updated_at,status,rows_written,note)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(dataset) DO UPDATE SET last_success_date=excluded.last_success_date,
         updated_at=excluded.updated_at,status=excluded.status,rows_written=excluded.rows_written,note=excluded.note`,
         bind:["web_daily_batch_probe",day,new Date().toISOString(),"OK",total,"date-commit checkpoint"]});
       db.exec("COMMIT");
       status("date-commit",`${day}: committed`);
     }catch(e){try{db.exec("ROLLBACK")}catch(_){} throw e}
   }
   db.exec({sql:"UPDATE web_sync_run SET finished_at=?,status='OK',rows_written=?,last_date=? WHERE run_id=?",
     bind:[new Date().toISOString(),total,days.at(-1),runId]});
   const count=Number(scalar(db,"SELECT COUNT(*) FROM web_daily_batch_probe")||0);
   const checkpoint=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset='web_daily_batch_probe'");
   db.close();db=null;
   self.postMessage({ok:true,type:"result",count,total,checkpoint,runId,elapsedMs:Math.round(performance.now()-t0)});return;
 }
 if(cmd==="date-batch-resume"){
   if(!p.getFileNames().includes(name))throw new Error(`DB not found: ${name}`);
   db=new p.OpfsSAHPoolDb(name,"c"); ensureV7dTables(db);
   const cp=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset='web_daily_batch_probe'");
   if(!cp.length)throw new Error("date-batch checkpoint missing");
   const last=cp[0].last_success_date;
   const next="2026-08-30";
   db.exec("BEGIN IMMEDIATE");
   try{
     for(let i=0;i<5;i++) db.exec({sql:`INSERT INTO web_daily_batch_probe(date,code,close,volume) VALUES(?,?,?,?)
       ON CONFLICT(date,code) DO UPDATE SET close=excluded.close,volume=excluded.volume`,
       bind:[next,String(9000+i),200+i,2000+i]});
     db.exec({sql:`UPDATE web_sync_checkpoint SET last_success_date=?,updated_at=?,rows_written=rows_written+5,note=? WHERE dataset=?`,
       bind:[next,new Date().toISOString(),`resumed after ${last}`,"web_daily_batch_probe"]});
     db.exec("COMMIT");
   }catch(e){try{db.exec("ROLLBACK")}catch(_){} throw e}
   const count=Number(scalar(db,"SELECT COUNT(*) FROM web_daily_batch_probe")||0);
   const checkpoint=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset='web_daily_batch_probe'");
   db.close();db=null;
   self.postMessage({ok:true,type:"result",resumedFrom:last,next,count,checkpoint,elapsedMs:Math.round(performance.now()-t0)});return;
 }

 if(cmd==="runtime-migrate"){
   if(!p.getFileNames().includes(name))throw new Error(`DB not found: ${name}`);
   db=new p.OpfsSAHPoolDb(name,"c"); ensureRuntimeTables(db);
   const mig=Number(scalar(db,"SELECT COUNT(*) FROM web_runtime_migrations WHERE migration_id='v7d-runtime-1'")||0);
   db.close();db=null;
   self.postMessage({ok:true,type:"result",migration:mig===1,elapsedMs:Math.round(performance.now()-t0)});return;
 }
 if(cmd==="append-test"){
   if(!p.getFileNames().includes(name))throw new Error(`DB not found: ${name}`);
   db=new p.OpfsSAHPoolDb(name,"c"); ensureRuntimeTables(db);
   db.exec("BEGIN IMMEDIATE");
   try{
     db.exec({sql:`INSERT INTO web_sync_checkpoint(dataset,last_success_date,updated_at,note)
       VALUES(?,?,?,?)
       ON CONFLICT(dataset) DO UPDATE SET last_success_date=excluded.last_success_date,
       updated_at=excluded.updated_at,note=excluded.note`,
       bind:["v7d_append_test","2026-08-30",new Date().toISOString(),"direct-write checkpoint test"]});
     db.exec("COMMIT");
   }catch(e){try{db.exec("ROLLBACK")}catch(_){} throw e}
   const rows=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset='v7d_append_test'");
   db.close();db=null;
   self.postMessage({ok:true,type:"result",rows,elapsedMs:Math.round(performance.now()-t0)});return;
 }
 if(cmd==="resume-test"){
   if(!p.getFileNames().includes(name))throw new Error(`DB not found: ${name}`);
   db=new p.OpfsSAHPoolDb(name,"c"); ensureRuntimeTables(db);
   const before=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset='v7d_append_test'");
   if(!before.length)throw new Error("checkpoint missing");
   db.exec({sql:"UPDATE web_sync_checkpoint SET note=?,updated_at=? WHERE dataset=?",
     bind:["resume-after-worker-restart",new Date().toISOString(),"v7d_append_test"]});
   const after=execRows(db,"SELECT * FROM web_sync_checkpoint WHERE dataset='v7d_append_test'");
   db.close();db=null;
   self.postMessage({ok:true,type:"result",before,after,resumed:after[0]?.note==="resume-after-worker-restart",elapsedMs:Math.round(performance.now()-t0)});return;
 }

 if(!p.getFileNames().includes(name)) throw new Error(`SAH pool DB not found: ${name}. Step 2でレスキューSQLiteをImportしてください。`);
 db=new p.OpfsSAHPoolDb(name,"r");
 if(cmd==="open"){const hasBars=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)>0,hasSync=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_log'")||0)>0;const out={ok:true,type:"result",sqliteVersion:s.version.libVersion,vfsUsed:p.vfsName,filename:name,tableCount:Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table'")||0),barsCount:hasBars?Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0):0,minDate:hasBars?scalar(db,"SELECT MIN(date) FROM bars_daily"):null,maxDate:hasBars?scalar(db,"SELECT MAX(date) FROM bars_daily"):null,syncOk:hasSync?Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='OK'")||0):0,elapsedMs:Math.round(performance.now()-t0)};db.close();self.postMessage(out);return;}
 if(cmd==="quick"){const quick=String(scalar(db,"PRAGMA quick_check")??"");db.close();self.postMessage({ok:true,type:"result",quick,elapsedMs:Math.round(performance.now()-t0)});return;}
 throw new Error(`Unknown cmd: ${cmd}`);
 }catch(err){try{if(db)db.close()}catch(_){} self.postMessage({ok:false,type:"result",stage:"caught-exception",error:String(err?.stack||err)})}};
