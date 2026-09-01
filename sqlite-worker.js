const nativePostMessage=self.postMessage.bind(self);
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
let _sqliteInitPromise=null;
async function initSqlite(){
 if(sqlite3&&pool)return {sqlite3,pool,runtimeId:"worker-persistent-v1"};
 if(_sqliteInitPromise)return _sqliteInitPromise;
 _sqliteInitPromise=(async()=>{
   status("import-module","/sqlite/index.mjs");
   const mod=await import("/sqlite/index.mjs");
   status("initialize-sqlite","SQLite 3.53 + opfs-sahpool (Worker常駐)");
   sqlite3=await mod.default({
     locateFile:p=>new URL(`/sqlite/${p}`,self.location.origin).href,
     print:(...a)=>status("sqlite-print",a.join(" ")),
     printErr:(...a)=>status("sqlite-stderr",a.join(" "))
   });
   if(typeof sqlite3.installOpfsSAHPoolVfs!=="function")
     throw new Error("installOpfsSAHPoolVfs() not exposed by this build");
   status("install-sahpool","installOpfsSAHPoolVfs() once per Worker");
   pool=await sqlite3.installOpfsSAHPoolVfs({
     name:"jq-sahpool",
     directory:".jq-sahpool-v7c-r5",
     initialCapacity:32
   });
   status("reserve-sahpool-capacity","reserveMinimumCapacity(32)");
   if(typeof pool.reserveMinimumCapacity!=="function")
     throw new Error("reserveMinimumCapacity() not exposed by this SQLite build");
   const poolCapacity=await pool.reserveMinimumCapacity(32);
   return {sqlite3,pool,poolCapacity,runtimeId:"worker-persistent-v1"};
 })().catch(err=>{
   _sqliteInitPromise=null;
   sqlite3=null; pool=null;
   throw err;
 });
 return _sqliteInitPromise;
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


function scalarBind(db,sql,bind=[]){let out=null;db.exec({sql,bind,rowMode:"array",callback:r=>{if(out===null)out=r[0]}});return out;}
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


let cachedMarketDb=null;
let cachedMarketDbName=null;
function closeCachedMarketDb(){
 try{cachedMarketDb?.close()}catch(_){}
 cachedMarketDb=null; cachedMarketDbName=null;
}

function resolveMarketNameWithoutOpen(p,requested){
 const files=poolFileNamesSafe(p);
 const base=String(requested||"").replace(/^\/+/,"");
 if(files.includes(requested)) return requested;
 for(const f of files){
   if(String(f).replace(/^\/+/,"")===base) return String(f).startsWith("/")?String(f):"/"+String(f);
 }
 throw new Error(`Market logical file not found. requested=${requested}; pool files=${JSON.stringify(files)}`);
}
function getCachedMarketDb(p,name){
 if(cachedMarketDb && cachedMarketDbName===name) return cachedMarketDb;
 closeCachedMarketDb();
 cachedMarketDb=new p.OpfsSAHPoolDb(name,"r");
 cachedMarketDbName=name;
 return cachedMarketDb;
}
self.onmessage=async e=>{
 const requestId=(e.data||{}).requestId;
 const originalPostMessage=nativePostMessage;
 self.postMessage=(msg,...rest)=>originalPostMessage({...msg,requestId},...rest);
const d=e.data||{},cmd=d.cmd,name=d.dbName||"/jq_market_v7c.sqlite",t0=performance.now();let db;try{
 if(cmd==="raw-ping"){
   self.postMessage({ok:true,type:"result",pong:true,seq:d.seq||0,elapsedMs:Math.round(performance.now()-t0)});
   return;
 }
 const x=await initSqlite(); const s=x.sqlite3,p=x.pool; const vfs=!!s.capi.sqlite3_vfs_find(p.vfsName);



 if(cmd==="runtime-probe"){
   self.postMessage({
     ok:true,type:"result",
     runtimeId:x.runtimeId||"worker-persistent-v1",
     poolFiles:poolFileNamesSafe(p),
     elapsedMs:Math.round(performance.now()-t0)
   });
   return;
 }
 if(cmd==="shard-lifecycle"){
   const testName="/jq_lifecycle_probe_v1.sqlite";
   let tdb=null,stage="start";
   const mark=(s,detail="")=>{stage=s;status(s,detail)};
   try{
     mark("01-create-open","probe create/open");
     tdb=new p.OpfsSAHPoolDb(testName,"c");
     mark("02-schema","probe schema/write");
     tdb.exec(`CREATE TABLE IF NOT EXISTS probe(id INTEGER PRIMARY KEY,value TEXT)`);
     tdb.exec(`INSERT OR REPLACE INTO probe(id,value) VALUES(1,'ok')`);
     mark("03-close","probe close");
     tdb.close();tdb=null;
     mark("04-reopen","probe reopen in SAME worker command");
     const o=performance.now();
     tdb=new p.OpfsSAHPoolDb(testName,"c");
     const reopenMs=Math.round(performance.now()-o);
     mark("05-read","probe readback");
     const value=scalar(tdb,"SELECT value FROM probe WHERE id=1");
     mark("06-final-close","probe final close");
     tdb.close();tdb=null;
     self.postMessage({ok:value==="ok",type:"result",stage:"PASS",value,reopenMs,elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,message:String(err&&err.message?err.message:err),stack:String(err&&err.stack?err.stack:""),elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{try{if(tdb)tdb.close()}catch(_){}}
 }
 if(cmd==="shard-bootstrap"){
   const catalogName="/jq_catalog_v1.sqlite", recentName="/jq_bars_recent_v1.sqlite";
   let cdb=null,rdb=null,stage="start";
   const mark=(s,detail="")=>{stage=s;status(s,detail)};
   try{
     mark("01-catalog-open","Catalog DB reopen (mode=c)");
     cdb=new p.OpfsSAHPoolDb(catalogName,"c");

     mark("02-catalog-schema","Catalog schema create");
     cdb.exec(`CREATE TABLE IF NOT EXISTS shard_catalog(
       shard_key TEXT PRIMARY KEY,
       logical_name TEXT NOT NULL,
       dataset TEXT NOT NULL,
       range_start TEXT,
       range_end TEXT,
       schema_version TEXT NOT NULL,
       state TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`);
     cdb.exec(`CREATE TABLE IF NOT EXISTS catalog_meta(
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`);
     cdb.exec(`INSERT INTO catalog_meta(key,value)
              VALUES('architecture','catalog-shards-v1')
              ON CONFLICT(key) DO UPDATE SET value='catalog-shards-v1'`);

     mark("03-recent-open","bars_recent DB open");
     rdb=new p.OpfsSAHPoolDb(recentName,"c");

     mark("04-recent-schema","bars_recent schema create");
     rdb.exec(`CREATE TABLE IF NOT EXISTS bars_daily(
       code TEXT NOT NULL,
       date TEXT NOT NULL,
       o REAL,h REAL,l REAL,c REAL,
       upper_limit REAL,lower_limit REAL,value REAL,
       adj_o REAL,adj_h REAL,adj_l REAL,adj_c REAL,
       adj_factor REAL,adj_volume REAL,volume REAL,
       turnover_value REAL,raw_json TEXT,
       PRIMARY KEY(code,date)
     ) WITHOUT ROWID`);
     rdb.exec(`CREATE INDEX IF NOT EXISTS idx_bars_recent_date ON bars_daily(date)`);
     rdb.exec(`CREATE TABLE IF NOT EXISTS shard_meta(
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`);
     rdb.exec(`INSERT INTO shard_meta(key,value)
              VALUES('schema_version','bars-v1')
              ON CONFLICT(key) DO UPDATE SET value='bars-v1'`);
     rdb.exec(`INSERT INTO shard_meta(key,value)
              VALUES('role','bars_recent')
              ON CONFLICT(key) DO UPDATE SET value='bars_recent'`);

     mark("05-recent-close","bars_recent close");
     rdb.close();rdb=null;

     mark("06-catalog-register","Catalog register shard");
     const now=new Date().toISOString().replace(/'/g,"''");
     cdb.exec(`INSERT INTO shard_catalog(
       shard_key,logical_name,dataset,range_start,range_end,schema_version,state,updated_at
     ) VALUES(
       'bars_recent','${recentName}','bars_daily',NULL,NULL,'bars-v1','ready','${now}'
     )
     ON CONFLICT(shard_key) DO UPDATE SET
       logical_name='${recentName}',
       dataset='bars_daily',
       schema_version='bars-v1',
       state='ready',
       updated_at='${now}'`);

     mark("07-catalog-readback","Catalog readback");
     const catalogRows=execRows(cdb,"SELECT * FROM shard_catalog ORDER BY shard_key");

     mark("08-catalog-close","Catalog close");
     cdb.close();cdb=null;

     self.postMessage({
       ok:true,type:"result",stage:"PASS",
       catalogName,recentName,catalogRows,
       poolFiles:p.getFileNames(),
       elapsedMs:Math.round(performance.now()-t0)
     });
     return;
   }catch(err){
     self.postMessage({
       ok:false,type:"error",stage,
       message:String(err&&err.message?err.message:err),
       stack:String(err&&err.stack?err.stack:""),
       elapsedMs:Math.round(performance.now()-t0)
     });
     return;
   }finally{
     try{if(rdb)rdb.close()}catch(_){}
     try{if(cdb)cdb.close()}catch(_){}
   }
 }

 if(cmd==="shard-migrate-pilot"){
   const catalogName="/jq_catalog_v1.sqlite", recentName="/jq_bars_recent_v1.sqlite";
   const sourceName=name, dayLimit=Math.max(1,Math.min(10,Number(d.payload?.days||5)));
   let srcDb=null,dstDb=null,catDb=null,stage="start";
   const mark=(s,detail="")=>{stage=s;status(s,detail)};
   try{
     mark("01-source-open",`Legacy DataLake read-only: ${sourceName}`);
     const resolved=resolveExistingMarketDb(p,sourceName);
     srcDb=new p.OpfsSAHPoolDb(resolved.name,"r");
     mark("02-source-dates",`Latest ${dayLimit} trading dates`);
     const dates=execRows(srcDb,`SELECT date,COUNT(*) AS rows FROM bars_daily GROUP BY date ORDER BY date DESC LIMIT ${dayLimit}`)
       .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
     if(!dates.length)throw new Error("No bars_daily dates found");
     const from=String(dates[0].date),to=String(dates[dates.length-1].date);
     const expected=dates.reduce((a,x)=>a+Number(x.rows||0),0);

     mark("03-destination-open",`bars_recent: ${from} - ${to}`);
     dstDb=new p.OpfsSAHPoolDb(recentName,"c");
     dstDb.exec(`CREATE TABLE IF NOT EXISTS bars_daily(code TEXT NOT NULL,date TEXT NOT NULL,o REAL,h REAL,l REAL,c REAL,upper_limit REAL,lower_limit REAL,value REAL,adj_o REAL,adj_h REAL,adj_l REAL,adj_c REAL,adj_factor REAL,adj_volume REAL,volume REAL,turnover_value REAL,raw_json TEXT,PRIMARY KEY(code,date)) WITHOUT ROWID`);
     dstDb.exec(`CREATE INDEX IF NOT EXISTS idx_bars_recent_date ON bars_daily(date)`);
     dstDb.exec(`CREATE TABLE IF NOT EXISTS shard_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);

     const srcCols=new Set(tableInfo(srcDb,"bars_daily").map(x=>x.name));
     const cols=tableInfo(dstDb,"bars_daily").map(x=>x.name).filter(x=>srcCols.has(x));
     if(!cols.includes("code")||!cols.includes("date"))throw new Error("Schema mismatch: code/date missing");
     const updates=cols.filter(x=>!["code","date"].includes(x)).map(x=>`${qident(x)}=excluded.${qident(x)}`).join(",");
     const sql=`INSERT INTO bars_daily(${cols.map(qident).join(",")}) VALUES(${cols.map(()=>"?").join(",")}) ON CONFLICT(code,date) DO UPDATE SET ${updates}`;
     const stmt=dstDb.prepare(sql); let written=0;
     try{
       dstDb.exec("BEGIN");
       for(const x of dates){
         const day=String(x.date); mark("04-copy",`${day}: ${Number(x.rows||0).toLocaleString()} rows`);
         srcDb.exec({sql:`SELECT ${cols.map(qident).join(",")} FROM bars_daily WHERE date=? ORDER BY code`,bind:[day],rowMode:"array",
           callback:r=>{stmt.bind(r).stepReset();written++}});
       }
       dstDb.exec("COMMIT");
     }catch(err){try{dstDb.exec("ROLLBACK")}catch(_){} throw err}
     finally{stmt.finalize()}

     mark("05-verify","Row/date/quick_check verification");
     const actual=Number(scalar(dstDb,`SELECT COUNT(*) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||0);
     const distinctDates=Number(scalar(dstDb,`SELECT COUNT(DISTINCT date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||0);
     const minDate=scalar(dstDb,"SELECT MIN(date) FROM bars_daily"),maxDate=scalar(dstDb,"SELECT MAX(date) FROM bars_daily");
     const qc=String(scalar(dstDb,"PRAGMA quick_check")||"");
     if(actual!==expected)throw new Error(`Row mismatch source=${expected}, destination=${actual}`);
     if(distinctDates!==dates.length)throw new Error(`Date mismatch source=${dates.length}, destination=${distinctDates}`);
     if(qc!=="ok")throw new Error(`quick_check=${qc}`);
     const at=new Date().toISOString().replace(/'/g,"''");
     dstDb.exec(`INSERT INTO shard_meta(key,value) VALUES('range_start','${minDate}') ON CONFLICT(key) DO UPDATE SET value='${minDate}'`);
     dstDb.exec(`INSERT INTO shard_meta(key,value) VALUES('range_end','${maxDate}') ON CONFLICT(key) DO UPDATE SET value='${maxDate}'`);
     dstDb.close();dstDb=null; srcDb.close();srcDb=null;

     mark("06-catalog-update","Catalog update after verification");
     catDb=new p.OpfsSAHPoolDb(catalogName,"c");
     catDb.exec(`UPDATE shard_catalog SET range_start='${minDate}',range_end='${maxDate}',state='pilot-migrated',updated_at='${at}' WHERE shard_key='bars_recent'`);
     const catalogRows=execRows(catDb,"SELECT * FROM shard_catalog WHERE shard_key='bars_recent'");
     catDb.close();catDb=null;
     self.postMessage({ok:true,type:"result",stage:"PASS",source:resolved.name,days:dates.length,dates,
       expectedRows:expected,writtenRows:written,verifiedRows:actual,minDate,maxDate,quickCheck:qc,catalogRows,
       elapsedMs:Math.round(performance.now()-t0)});return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,message:String(err?.message||err),stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});return;
   }finally{try{if(catDb)catDb.close()}catch(_){} try{if(dstDb)dstDb.close()}catch(_){} try{if(srcDb)srcDb.close()}catch(_){}}
 }



 if(cmd==="pool-capacity-status"){
   const files=poolFileNamesSafe(p);
   const actualCapacity=typeof p.getCapacity==="function"?Number(p.getCapacity()):null;
   const actualFileCount=typeof p.getFileCount==="function"?Number(p.getFileCount()):files.length;
   self.postMessage({
     ok:true,type:"result",stage:"PASS",
     poolFiles:files,
     actualCapacity,
     actualFileCount,
     freeSlots:actualCapacity==null?null:Math.max(0,actualCapacity-actualFileCount),
     elapsedMs:Math.round(performance.now()-t0)
   });
   return;
 }
 if(cmd==="shard-year-inventory"){
   let srcDb=null,stage="01-source-open";
   try{
     const resolved=resolveExistingMarketDb(p,name);
     srcDb=new p.OpfsSAHPoolDb(resolved.name,"r");
     stage="02-inventory";
     const years=execRows(srcDb,`
       SELECT substr(date,1,4) AS year,
              COUNT(*) AS rows,
              COUNT(DISTINCT date) AS trading_days,
              MIN(date) AS min_date,
              MAX(date) AS max_date
       FROM bars_daily
       GROUP BY substr(date,1,4)
       ORDER BY year DESC`);
     srcDb.close();srcDb=null;
     self.postMessage({ok:true,type:"result",stage:"PASS",source:resolved.name,years,
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,
       message:String(err&&err.message?err.message:err),
       stack:String(err&&err.stack?err.stack:""),
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{try{if(srcDb)srcDb.close()}catch(_){}}
 }
 if(cmd==="shard-migrate-year"){
   const catalogName="/jq_catalog_v1.sqlite";
   const sourceName=name;
   let srcDb=null,dstDb=null,catDb=null,stage="start";
   const mark=(s,detail="")=>{stage=s;status(s,detail)};
   try{
     mark("01-source-open",`Legacy DataLake read-only: ${sourceName}`);
     const resolved=resolveExistingMarketDb(p,sourceName);
     srcDb=new p.OpfsSAHPoolDb(resolved.name,"r");

     mark("02-resolve-year","Resolve latest calendar year");
     const maxDate=String(scalar(srcDb,"SELECT MAX(date) FROM bars_daily")||"");
     if(!maxDate) throw new Error("bars_daily max(date) is empty");
     const latestYear=Number(maxDate.slice(0,4));
     const requested=Number(d.payload?.year||latestYear);
     const year=Math.max(2000,Math.min(2100,requested));
     const from=`${year}-01-01`, to=`${year}-12-31`;
     const shardKey=`bars_${year}`;
     const shardName=`/jq_bars_${year}_v1.sqlite`;

     mark("03-source-scan",`${year} source scan`);
     const sourceStats=execRows(srcDb,`
       SELECT COUNT(*) AS rows,
              COUNT(DISTINCT date) AS trading_days,
              MIN(date) AS min_date,
              MAX(date) AS max_date
       FROM bars_daily
       WHERE date>=? AND date<=?`,[from,to])[0]||{};
     const expected=Number(sourceStats.rows||0);
     const tradingDays=Number(sourceStats.trading_days||0);
     const minDate=String(sourceStats.min_date||"");
     const maxYearDate=String(sourceStats.max_date||"");
     if(expected<=0 || tradingDays<=0) throw new Error(`No bars_daily rows for ${year}`);

     mark("04-destination-open",`${shardName} create/open`);
     dstDb=new p.OpfsSAHPoolDb(shardName,"c");
     dstDb.exec(`CREATE TABLE IF NOT EXISTS bars_daily(
       code TEXT NOT NULL,date TEXT NOT NULL,o REAL,h REAL,l REAL,c REAL,
       upper_limit REAL,lower_limit REAL,value REAL,
       adj_o REAL,adj_h REAL,adj_l REAL,adj_c REAL,
       adj_factor REAL,adj_volume REAL,volume REAL,turnover_value REAL,raw_json TEXT,
       PRIMARY KEY(code,date)
     ) WITHOUT ROWID`);
     dstDb.exec(`CREATE INDEX IF NOT EXISTS idx_bars_year_date ON bars_daily(date)`);
     dstDb.exec(`CREATE TABLE IF NOT EXISTS shard_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);

     const srcCols=new Set(tableInfo(srcDb,"bars_daily").map(x=>x.name));
     const cols=tableInfo(dstDb,"bars_daily").map(x=>x.name).filter(x=>srcCols.has(x));
     if(!cols.includes("code")||!cols.includes("date"))
       throw new Error("Schema mismatch: code/date missing");
     const updates=cols.filter(x=>!["code","date"].includes(x))
       .map(x=>`${qident(x)}=excluded.${qident(x)}`).join(",");
     const sql=`INSERT INTO bars_daily(${cols.map(qident).join(",")})
       VALUES(${cols.map(()=>"?").join(",")})
       ON CONFLICT(code,date) DO UPDATE SET ${updates}`;
     const stmt=dstDb.prepare(sql);

     mark("05-copy",`${year}: ${expected.toLocaleString()} rows / ${tradingDays} days`);
     let written=0;
     try{
       dstDb.exec("BEGIN");
       srcDb.exec({
         sql:`SELECT ${cols.map(qident).join(",")}
              FROM bars_daily
              WHERE date>=? AND date<=?
              ORDER BY date,code`,
         bind:[from,to],
         rowMode:"array",
         callback:r=>{
           stmt.bind(r).stepReset();
           written++;
           if(written%50000===0) mark("05-copy",`${year}: ${written.toLocaleString()} / ${expected.toLocaleString()} rows`);
         }
       });
       dstDb.exec("COMMIT");
     }catch(err){
       try{dstDb.exec("ROLLBACK")}catch(_){}
       throw err;
     }finally{
       stmt.finalize();
     }

     mark("06-verify","Row/day/range/quick_check verification");
     const actual=Number(scalar(dstDb,`SELECT COUNT(*) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||0);
     const actualDays=Number(scalar(dstDb,`SELECT COUNT(DISTINCT date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||0);
     const dstMin=String(scalar(dstDb,`SELECT MIN(date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||"");
     const dstMax=String(scalar(dstDb,`SELECT MAX(date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||"");
     const qc=String(scalar(dstDb,"PRAGMA quick_check")||"");

     if(actual!==expected) throw new Error(`Row mismatch source=${expected}, destination=${actual}`);
     if(actualDays!==tradingDays) throw new Error(`Trading-day mismatch source=${tradingDays}, destination=${actualDays}`);
     if(dstMin!==minDate || dstMax!==maxYearDate) throw new Error(`Range mismatch source=${minDate}..${maxYearDate}, destination=${dstMin}..${dstMax}`);
     if(qc!=="ok") throw new Error(`quick_check=${qc}`);

     const at=new Date().toISOString().replace(/'/g,"''");
     const meta={
       role:shardKey,
       schema_version:"bars-v1",
       calendar_year:String(year),
       range_start:dstMin,
       range_end:dstMax,
       source_db:resolved.name,
       migrated_at:at
     };
     for(const [k,v] of Object.entries(meta)){
       const kk=String(k).replace(/'/g,"''"), vv=String(v).replace(/'/g,"''");
       dstDb.exec(`INSERT INTO shard_meta(key,value) VALUES('${kk}','${vv}')
         ON CONFLICT(key) DO UPDATE SET value='${vv}'`);
     }
     dstDb.close(); dstDb=null;
     srcDb.close(); srcDb=null;

     mark("07-catalog-register",`${shardKey} register`);
     catDb=new p.OpfsSAHPoolDb(catalogName,"c");
     catDb.exec(`CREATE TABLE IF NOT EXISTS shard_catalog(
       shard_key TEXT PRIMARY KEY,
       logical_name TEXT NOT NULL,
       dataset TEXT NOT NULL,
       range_start TEXT,
       range_end TEXT,
       schema_version TEXT NOT NULL,
       state TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`);
     const safeName=shardName.replace(/'/g,"''");
     catDb.exec(`INSERT INTO shard_catalog(
       shard_key,logical_name,dataset,range_start,range_end,schema_version,state,updated_at
     ) VALUES(
       '${shardKey}','${safeName}','bars_daily','${dstMin}','${dstMax}','bars-v1','ready','${at}'
     )
     ON CONFLICT(shard_key) DO UPDATE SET
       logical_name='${safeName}',
       dataset='bars_daily',
       range_start='${dstMin}',
       range_end='${dstMax}',
       schema_version='bars-v1',
       state='ready',
       updated_at='${at}'`);
     const catalogRows=execRows(catDb,`SELECT * FROM shard_catalog WHERE shard_key='${shardKey}'`);
     catDb.close(); catDb=null;

     self.postMessage({
       ok:true,type:"result",stage:"PASS",
       source:resolved.name,year,shardKey,shardName,
       expectedRows:expected,writtenRows:written,verifiedRows:actual,
       tradingDays,verifiedTradingDays:actualDays,
       minDate:dstMin,maxDate:dstMax,quickCheck:qc,catalogRows,
       elapsedMs:Math.round(performance.now()-t0)
     });
     return;
   }catch(err){
     self.postMessage({
       ok:false,type:"error",stage,
       message:String(err&&err.message?err.message:err),
       stack:String(err&&err.stack?err.stack:""),
       elapsedMs:Math.round(performance.now()-t0)
     });
     return;
   }finally{
     try{if(catDb)catDb.close()}catch(_){}
     try{if(dstDb)dstDb.close()}catch(_){}
     try{if(srcDb)srcDb.close()}catch(_){}
   }
 }



 if(cmd==="shard-backup-inventory"){
   const files=poolFileNamesSafe(p);
   const wanted=new Set();
   const catalogName="/jq_catalog_v1.sqlite";
   let cdb=null;
   try{
     if(files.includes(catalogName)){
       wanted.add(catalogName);
       try{
         cdb=new p.OpfsSAHPoolDb(catalogName,"r");
         const hasCatalog=Number(scalar(cdb,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='shard_catalog'")||0)>0;
         if(hasCatalog){
           for(const r of execRows(cdb,"SELECT logical_name FROM shard_catalog WHERE state='ready' ORDER BY shard_key")){
             let n=String(r.logical_name||"");
             if(n && !n.startsWith("/")) n="/"+n;
             if(n) wanted.add(n);
           }
         }
       }finally{try{if(cdb)cdb.close()}catch(_){} cdb=null}
     }
     for(const n of files){
       if(/^\/jq_bars_(?:recent|\d{4})_v1\.sqlite$/.test(n)) wanted.add(n);
       if(/^\/jq_(?:financials|supply_demand|private)(?:_[a-z0-9_-]+)?_v\d+\.sqlite$/i.test(n)) wanted.add(n);
     }

     const items=[];
     for(const name of Array.from(wanted).sort()){
       if(!files.includes(name)) continue;
       let dbx=null;
       try{
         dbx=new p.OpfsSAHPoolDb(name,"r");
         const qc=String(scalar(dbx,"PRAGMA quick_check")||"");
         const pc=Number(scalar(dbx,"PRAGMA page_count")||0);
         const ps=Number(scalar(dbx,"PRAGMA page_size")||0);
         const tables=execRows(dbx,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(r=>String(r.name));
         let rows=null,minDate=null,maxDate=null,tradingDays=null;
         if(tables.includes("bars_daily")){
           rows=Number(scalar(dbx,"SELECT COUNT(*) FROM bars_daily")||0);
           minDate=scalar(dbx,"SELECT MIN(date) FROM bars_daily");
           maxDate=scalar(dbx,"SELECT MAX(date) FROM bars_daily");
           tradingDays=Number(scalar(dbx,"SELECT COUNT(DISTINCT date) FROM bars_daily")||0);
         }
         items.push({name,fileName:name.replace(/^\/+/,""),bytes:pc*ps,quickCheck:qc,tables,rows,minDate,maxDate,tradingDays});
       }catch(err){
         items.push({name,fileName:name.replace(/^\/+/,""),bytes:0,quickCheck:"ERROR",error:String(err?.message||err),tables:[]});
       }finally{try{if(dbx)dbx.close()}catch(_){}}
     }
     const totalBytes=items.reduce((a,x)=>a+Number(x.bytes||0),0);
     const allOk=items.length>0 && items.every(x=>x.quickCheck==="ok");
     self.postMessage({ok:true,type:"result",stage:"PASS",items,totalBytes,allOk,
       capacity:typeof p.getCapacity==="function"?p.getCapacity():null,
       allocated:typeof p.getFileCount==="function"?p.getFileCount():null,
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage:"backup-inventory",message:String(err?.message||err),
       stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{try{if(cdb)cdb.close()}catch(_){}}
 }

 if(cmd==="shard-backup-export"){
   const payload=e.data.payload||{};
   let name=String(payload.name||"");
   if(name && !name.startsWith("/")) name="/"+name;
   try{
     const files=poolFileNamesSafe(p);
     if(!files.includes(name)) throw new Error(`backup target not found: ${name}`);
     status("backup-export",`exportFile ${name}`);
     const bytes=p.exportFile(name);
     if(!(bytes instanceof Uint8Array)) throw new Error("exportFile did not return Uint8Array");
     let sha256=null;
     try{
       const digest=await crypto.subtle.digest("SHA-256",bytes);
       sha256=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
     }catch(_){}
     const ab=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
     self.postMessage({ok:true,type:"result",stage:"PASS",name,fileName:name.replace(/^\/+/,""),
       bytes:bytes.byteLength,sha256,buffer:ab,elapsedMs:Math.round(performance.now()-t0)},[ab]);
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage:"backup-export",message:String(err?.message||err),
       stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});
     return;
   }
 }

 if(cmd==="shard-restore-import"){
   const payload=e.data.payload||{};
   let name=String(payload.name||"");
   if(name && !name.startsWith("/")) name="/"+name;
   if(!/^\/jq_[a-zA-Z0-9_.-]+\.sqlite$/.test(name)){
     self.postMessage({ok:false,type:"error",stage:"restore-validate",message:`unsafe restore name: ${name}`});
     return;
   }
   if(!e.data.file){
     self.postMessage({ok:false,type:"error",stage:"restore-validate",message:"restore file missing"});
     return;
   }
   let rdb=null;
   try{
     status("restore-import",`${name}: streaming import start`);
     const out=await importFile(e.data.file,name);
     status("restore-verify",`${name}: quick_check`);
     rdb=new p.OpfsSAHPoolDb(name,"r");
     const qc=String(scalar(rdb,"PRAGMA quick_check")||"");
     const pc=Number(scalar(rdb,"PRAGMA page_count")||0);
     const ps=Number(scalar(rdb,"PRAGMA page_size")||0);
     const tables=execRows(rdb,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(r=>String(r.name));
     let rows=null,minDate=null,maxDate=null,tradingDays=null;
     if(tables.includes("bars_daily")){
       rows=Number(scalar(rdb,"SELECT COUNT(*) FROM bars_daily")||0);
       minDate=scalar(rdb,"SELECT MIN(date) FROM bars_daily");
       maxDate=scalar(rdb,"SELECT MAX(date) FROM bars_daily");
       tradingDays=Number(scalar(rdb,"SELECT COUNT(DISTINCT date) FROM bars_daily")||0);
     }
     rdb.close();rdb=null;
     if(qc!=="ok") throw new Error(`quick_check=${qc}`);
     self.postMessage({ok:true,type:"result",stage:"PASS",name,fileName:name.replace(/^\/+/,""),
       importedBytes:out.bytes,chunks:out.chunks,dbBytes:pc*ps,quickCheck:qc,tables,rows,minDate,maxDate,tradingDays,
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage:"restore-import",message:String(err?.message||err),
       stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{try{if(rdb)rdb.close()}catch(_){}}
 }



 if(cmd==="gap-repair-date-write"){
   const payload=e.data.payload||{}, date=String(payload.date||""), rows=payload.rows||[];
   let db=null,cdb=null,stage="01-validate";
   try{
     if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid date");
     if(!Array.isArray(rows)||!rows.length) throw new Error("rows empty");
     const year=Number(date.slice(0,4)), name=`/jq_bars_${year}_v1.sqlite`;
     const aliases={
       date:["Date","date"],code:["Code","code"],o:["O","o","Open","open"],h:["H","h","High","high"],
       l:["L","l","Low","low"],c:["C","c","Close","close"],upper_limit:["UL","UpperLimit","upper_limit"],
       lower_limit:["LL","LowerLimit","lower_limit"],volume:["Vo","Volume","volume"],
       value:["Va","Value","TurnoverValue","value","turnover_value"],adj_factor:["AdjFactor","AdjustmentFactor","adj_factor","adjustment_factor"],
       adj_o:["AdjO","AdjustmentOpen","adj_o","adjustment_open"],adj_h:["AdjH","AdjustmentHigh","adj_h","adjustment_high"],
       adj_l:["AdjL","AdjustmentLow","adj_l","adjustment_low"],adj_c:["AdjC","AdjustmentClose","adj_c","adjustment_close"],
       adj_volume:["AdjVo","AdjustmentVolume","adj_volume","adjustment_volume"],turnover_value:["Va","TurnoverValue","turnover_value"],
       raw_json:["__RAW_JSON__"]
     };
     function pick(obj,c){if(c==="raw_json")return JSON.stringify(obj);for(const k of (aliases[c]||[c]))if(Object.prototype.hasOwnProperty.call(obj,k))return obj[k];return null}
     stage="02-open"; db=new p.OpfsSAHPoolDb(name,"c");
     db.exec(`CREATE TABLE IF NOT EXISTS bars_daily(
       code TEXT NOT NULL,date TEXT NOT NULL,o REAL,h REAL,l REAL,c REAL,upper_limit REAL,lower_limit REAL,value REAL,
       adj_o REAL,adj_h REAL,adj_l REAL,adj_c REAL,adj_factor REAL,adj_volume REAL,volume REAL,turnover_value REAL,raw_json TEXT,
       PRIMARY KEY(code,date)) WITHOUT ROWID`);
     db.exec(`CREATE INDEX IF NOT EXISTS idx_bars_date ON bars_daily(date)`);
     const cols=tableInfo(db,"bars_daily").map(x=>x.name);
     const ins=cols.filter(c=>pick(rows[0],c)!==null||["date","code"].includes(c));
     const upd=ins.filter(c=>!["code","date"].includes(c)).map(c=>`${qident(c)}=excluded.${qident(c)}`).join(",");
     const st=db.prepare(`INSERT INTO bars_daily(${ins.map(qident).join(",")}) VALUES(${ins.map(()=>"?").join(",")})
       ON CONFLICT(code,date) DO UPDATE SET ${upd}`);
     stage="03-write";
     try{db.exec("BEGIN");for(const r of rows)st.bind(ins.map(c=>pick(r,c))).stepReset();db.exec("COMMIT")}
     catch(err){try{db.exec("ROLLBACK")}catch(_){}throw err}finally{st.finalize()}
     stage="04-verify";
     const cnt=Number(scalarBind(db,"SELECT COUNT(*) FROM bars_daily WHERE date=?",[date])||0);
     const qc=String(scalar(db,"PRAGMA quick_check")||"");
     if(cnt!==rows.length)throw new Error(`verify mismatch API=${rows.length} shard=${cnt}`);
     if(qc!=="ok")throw new Error(`quick_check=${qc}`);
     const mn=String(scalar(db,"SELECT MIN(date) FROM bars_daily")||""),mx=String(scalar(db,"SELECT MAX(date) FROM bars_daily")||"");
     db.close();db=null;
     stage="05-catalog";cdb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","c");
     const at=new Date().toISOString().replace(/'/g,"''");
     cdb.exec(`UPDATE shard_catalog SET range_start='${mn}',range_end='${mx}',state='ready',updated_at='${at}' WHERE shard_key='bars_${year}'`);
     cdb.close();cdb=null;
     self.postMessage({ok:true,type:"result",stage:"PASS",date,year,rows:cnt,quickCheck:qc,minDate:mn,maxDate:mx,elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){self.postMessage({ok:false,type:"error",stage,message:String(err?.message||err),stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});return}
   finally{try{if(cdb)cdb.close()}catch(_){}try{if(db)db.close()}catch(_){}}
 }



 if(cmd==="my-stocks-list"||cmd==="my-stocks-upsert"||cmd==="my-stocks-delete"||cmd==="my-stocks-import"){
   let db=null,stage="01-open";
   try{
     db=new p.OpfsSAHPoolDb("/jq_private_v1.sqlite","c");
     db.exec(`CREATE TABLE IF NOT EXISTS user_stocks(
       code TEXT NOT NULL,
       name TEXT,
       account TEXT NOT NULL DEFAULT '',
       shares REAL,
       avg_cost REAL,
       strategy TEXT,
       memo TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY(code,account)
     ) WITHOUT ROWID`);
     const now=new Date().toISOString();
     if(cmd==="my-stocks-upsert"){
       stage="02-upsert";
       const x=e.data.payload||{},code=String(x.code||"").trim().toUpperCase(),account=String(x.account||"").trim();
       if(!/^[0-9A-Z]{4,5}$/.test(code))throw new Error("銘柄コードが不正です");
       db.exec({sql:`INSERT INTO user_stocks(code,name,account,shares,avg_cost,strategy,memo,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)
         ON CONFLICT(code,account) DO UPDATE SET name=excluded.name,shares=excluded.shares,avg_cost=excluded.avg_cost,
         strategy=excluded.strategy,memo=excluded.memo,updated_at=excluded.updated_at`,
         bind:[code,String(x.name||""),account,x.shares==null?null:Number(x.shares),x.avgCost==null?null:Number(x.avgCost),
         String(x.strategy||""),String(x.memo||""),now,now]});
     }else if(cmd==="my-stocks-delete"){
       stage="02-delete"; const x=e.data.payload||{};
       db.exec({sql:"DELETE FROM user_stocks WHERE code=? AND account=?",bind:[String(x.code||""),String(x.account||"")]});
     }else if(cmd==="my-stocks-import"){
       stage="02-import"; const rows=(e.data.payload||{}).rows||[]; let n=0;
       db.exec("BEGIN");
       try{
         for(const x of rows){
           const code=String(x.code||"").trim().toUpperCase(),account=String(x.account||"").trim();
           if(!/^[0-9A-Z]{4,5}$/.test(code))continue;
           db.exec({sql:`INSERT INTO user_stocks(code,name,account,shares,avg_cost,strategy,memo,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?)
             ON CONFLICT(code,account) DO UPDATE SET name=excluded.name,shares=excluded.shares,avg_cost=excluded.avg_cost,
             strategy=excluded.strategy,updated_at=excluded.updated_at`,
             bind:[code,String(x.name||""),account,x.shares==null?null:Number(x.shares),x.avgCost==null?null:Number(x.avgCost),
             String(x.strategy||""),"",now,now]}); n++;
         }
         db.exec("COMMIT");
       }catch(err){try{db.exec("ROLLBACK")}catch(_){}throw err}
       self.postMessage({ok:true,type:"result",stage:"PASS",imported:n,elapsedMs:Math.round(performance.now()-t0)});
       return;
     }
     stage="03-list";
     const rows=execRows(db,`SELECT code,name,account,shares,avg_cost,strategy,memo,created_at,updated_at
       FROM user_stocks ORDER BY CASE account WHEN 'NISA' THEN 1 WHEN '現物' THEN 2 WHEN '信用買' THEN 3 WHEN '信用売' THEN 4 ELSE 9 END,code`);
     self.postMessage({ok:true,type:"result",stage:"PASS",rows,count:rows.length,elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){self.postMessage({ok:false,type:"error",stage,message:String(err?.message||err),stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});return}
   finally{try{if(db)db.close()}catch(_){}}
 }

 if(cmd==="my-stocks-analysis"){
   const payload=e.data.payload||{},asOf=String(payload.asOf||"");
   let pdb=null,cdb=null,stage="01-validate";
   try{
     if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw new Error("asOf invalid");

     stage="02-private";
     pdb=new p.OpfsSAHPoolDb("/jq_private_v1.sqlite","c");
     pdb.exec(`CREATE TABLE IF NOT EXISTS user_stocks(
       code TEXT NOT NULL,name TEXT,account TEXT NOT NULL DEFAULT '',shares REAL,avg_cost REAL,
       strategy TEXT,memo TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
       PRIMARY KEY(code,account)) WITHOUT ROWID`);
     const stocks=execRows(pdb,"SELECT code,name,account,shares,avg_cost,strategy,memo FROM user_stocks ORDER BY code,account");
     pdb.close();pdb=null;
     if(!stocks.length){
       self.postMessage({ok:true,type:"result",stage:"PASS",asOf,rows:[],count:0,technicalCount:0,elapsedMs:Math.round(performance.now()-t0)});
       return;
     }

     const jqCode=x=>{
       const s=String(x||"").trim().toUpperCase();
       return s.length===4?s+"0":s;
     };
     const norm=x=>{
       const s=String(x||"").trim().toUpperCase();
       return s.length===5&&s.endsWith("0")?s.slice(0,4):s;
     };
     const wanted=[...new Set(stocks.map(x=>jqCode(x.code)))];

     stage="03-catalog";
     cdb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","r");
     const cats=execRows(cdb,`SELECT shard_key,logical_name,range_start,range_end
       FROM shard_catalog WHERE dataset='bars_daily' AND state='ready'
       AND shard_key GLOB 'bars_[0-9][0-9][0-9][0-9]' ORDER BY shard_key DESC`);
     cdb.close();cdb=null;

     const dates=[];
     for(const s of cats.filter(x=>String(x.range_start||"")<=asOf)){
       let db=null;
       try{
         const n=String(s.logical_name||"");
         db=new p.OpfsSAHPoolDb(n.startsWith("/")?n:"/"+n,"r");
         const rs=execRows(db,"SELECT DISTINCT date FROM bars_daily WHERE date<=? ORDER BY date DESC LIMIT 100",[asOf]);
         for(const r of rs){const d=String(r.date);if(!dates.includes(d))dates.push(d)}
         dates.sort().reverse();
         if(dates.length>=100)break;
       }finally{try{if(db)db.close()}catch(_){}}
     }

     const chosen=dates.sort().slice(-100);
     if(chosen.length<75)throw new Error(`Need >=75 dates, got ${chosen.length}`);
     const from=chosen[0],actualAsOf=chosen[chosen.length-1],chosenSet=new Set(chosen);

     stage="04-bars";
     const byCode=new Map(),usedShards=[];
     for(const s of cats.slice().reverse()){
       if(String(s.range_end||"")<from||String(s.range_start||"")>actualAsOf)continue;
       let db=null;
       try{
         const n=String(s.logical_name||"");
         db=new p.OpfsSAHPoolDb(n.startsWith("/")?n:"/"+n,"r");
         const ph=wanted.map(()=>"?").join(",");
         const rs=execRows(db,`SELECT code,date,
                  COALESCE(adj_h,h,adj_c,c) AS h,
                  COALESCE(adj_l,l,adj_c,c) AS l,
                  COALESCE(adj_c,c) AS c,
                  volume AS volume
           FROM bars_daily WHERE date>=? AND date<=? AND code IN (${ph})
           AND COALESCE(adj_c,c) IS NOT NULL ORDER BY code,date`,[from,actualAsOf,...wanted]);
         usedShards.push(String(s.shard_key));
         for(const r of rs){
           const d=String(r.date);if(!chosenSet.has(d))continue;
           const code=String(r.code),c=Number(r.c),v=(r.volume==null||r.volume==="")?null:Number(r.volume),
                 h=Number(r.h),l=Number(r.l);
           if(!Number.isFinite(c)||c<=0)continue;
           if(!byCode.has(code))byCode.set(code,[]);
           byCode.get(code).push({date:d,c,v,h:Number.isFinite(h)?h:c,l:Number.isFinite(l)?l:c});
         }
       }finally{try{if(db)db.close()}catch(_){}}
     }

     const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
     const pct=(a,b)=>b?((a/b)-1)*100:null;
     function rsi14(xs){
       if(xs.length<15)return null;
       let gain=0,loss=0;
       for(let i=1;i<=14;i++){
         const d=xs[i]-xs[i-1];
         if(d>0)gain+=d;else loss-=d;
       }
       let avgGain=gain/14,avgLoss=loss/14;
       for(let i=15;i<xs.length;i++){
         const d=xs[i]-xs[i-1],g=d>0?d:0,l=d<0?-d:0;
         avgGain=((avgGain*13)+g)/14;
         avgLoss=((avgLoss*13)+l)/14;
       }
       if(avgLoss===0)return 100;
       const rs=avgGain/avgLoss;
       return 100-(100/(1+rs));
     }

     const metrics=new Map();
     for(const [jq,a0] of byCode){
       const a=a0.sort((x,y)=>x.date.localeCompare(y.date));
       if(a.length<75||a[a.length-1].date!==actualAsOf)continue;
       const closes=a.map(x=>x.c),vols=a.map(x=>x.v),highs=a.map(x=>x.h),lows=a.map(x=>x.l),last=a[a.length-1];
       const ma5=avg(closes.slice(-5)),ma25=avg(closes.slice(-25)),ma75=avg(closes.slice(-75));
       const ret5=closes.length>=6?pct(last.c,closes[closes.length-6]):null;
       const ret20=closes.length>=21?pct(last.c,closes[closes.length-21]):null;
       const vol20vals=vols.slice(-20).filter(v=>Number.isFinite(v));
       const vol20=vol20vals.length?avg(vol20vals):null;
       const volRatio=(Number.isFinite(last.v)&&vol20>0)?last.v/vol20:null;
       const high20=Math.max(...highs.slice(-20)),low20=Math.min(...lows.slice(-20));
       const high60=Math.max(...highs.slice(-60)),low60=Math.min(...lows.slice(-60));
       const lowClose20=Math.min(...closes.slice(-20)),lowClose60=Math.min(...closes.slice(-60));
       metrics.set(norm(jq),{
         close:last.c,ma5,ma25,ma75,
         distMa25:pct(last.c,ma25),distMa75:pct(last.c,ma75),
         ret5,ret20,rsi14:rsi14(closes),
         volume:last.v,vol20,volRatio,high20,low20,high60,low60,lowClose20,lowClose60,
         pos20:high20>low20?((last.c-low20)/(high20-low20))*100:null,
         pos60:high60>low60?((last.c-low60)/(high60-low60))*100:null
       });
     }

     const rows=stocks.map(s=>{
       const m=metrics.get(norm(s.code))||{};
       const close=Number(m.close),shares=Number(s.shares),cost=Number(s.avg_cost);
       const pnlPct=Number.isFinite(close)&&Number.isFinite(cost)&&cost!==0?((close/cost)-1)*100:null;
       const pnl=Number.isFinite(close)&&Number.isFinite(cost)&&Number.isFinite(shares)?(close-cost)*shares:null;
       return {...s,...m,pnlPct,pnl,hasTechnical:Number.isFinite(close),date:actualAsOf};
     });

     self.postMessage({ok:true,type:"result",stage:"PASS",
       requestedAsOf:asOf,asOf:actualAsOf,from,usedShards,
       count:rows.length,technicalCount:rows.filter(x=>x.hasTechnical).length,rows,
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,message:String(err?.message||err),stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{
     try{if(cdb)cdb.close()}catch(_){}
     try{if(pdb)pdb.close()}catch(_){}
   }
 }

 if(cmd==="equities-master-write"){
   const payload=d.payload||{}, rows=payload.rows||[], requestedDate=String(payload.date||"");
   const dbName="/jq_equities_master_v1.sqlite"; let mdb=null;
   try{
     status("master-open","銘柄マスターShardを開いています");
     mdb=new p.OpfsSAHPoolDb(dbName,"c");
     mdb.exec(`CREATE TABLE IF NOT EXISTS equities_master(
       code TEXT NOT NULL,
       effective_date TEXT NOT NULL,
       company_name TEXT, company_name_en TEXT,
       market_code TEXT, market_name TEXT,
       sector17_code TEXT, sector17_name TEXT,
       sector33_code TEXT, sector33_name TEXT,
       scale_category TEXT, margin_code TEXT, margin_name TEXT,
       product_category TEXT, base_price REAL,
       raw_json TEXT,
       PRIMARY KEY(code,effective_date)
     ) WITHOUT ROWID`);
     mdb.exec(`CREATE INDEX IF NOT EXISTS idx_eq_master_date ON equities_master(effective_date)`);
     const stmt=mdb.prepare(`INSERT OR REPLACE INTO equities_master(
       code,effective_date,company_name,company_name_en,market_code,market_name,
       sector17_code,sector17_name,sector33_code,sector33_name,scale_category,
       margin_code,margin_name,product_category,base_price,raw_json
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
     mdb.exec("BEGIN");
     try{
       for(const r of rows){
         const code=String(r.Code??r.code??"").trim();
         const ed=String(r.Date??r.date??requestedDate??"").slice(0,10);
         if(!code||!ed) continue;
         stmt.bind([
           code,ed,
           r.CoName??r.CompanyName??null,r.CoNameEn??r.CompanyNameEnglish??null,
           r.Mkt??r.MarketCode??null,r.MktNm??r.MarketCodeName??null,
           r.S17??r.Sector17Code??null,r.S17Nm??r.Sector17CodeName??null,
           r.S33??r.Sector33Code??null,r.S33Nm??r.Sector33CodeName??null,
           r.ScaleCat??r.ScaleCategory??null,
           r.Mrgn??r.MarginCode??null,r.MrgnNm??r.MarginCodeName??null,
           r.ProdCat??r.ProductCategory??null,
           Number.isFinite(Number(r.BasePrice))?Number(r.BasePrice):null,
           JSON.stringify(r)
         ]).stepReset();
       }
       mdb.exec("COMMIT");
     }catch(err){try{mdb.exec("ROLLBACK")}catch(_){} throw err}
     stmt.finalize();
     const count=Number(scalar(mdb,"SELECT count(*) FROM equities_master")||0);
     const minDate=scalar(mdb,"SELECT min(effective_date) FROM equities_master");
     const maxDate=scalar(mdb,"SELECT max(effective_date) FROM equities_master");
     const quickCheck=scalar(mdb,"PRAGMA quick_check");
     mdb.close();mdb=null;

     let cdb=null;
     try{
       cdb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","c");
       cdb.exec(`CREATE TABLE IF NOT EXISTS shard_catalog(
         shard_key TEXT PRIMARY KEY, logical_name TEXT NOT NULL, dataset TEXT NOT NULL,
         range_start TEXT, range_end TEXT, schema_version TEXT, state TEXT NOT NULL, updated_at TEXT NOT NULL
       )`);
       const now=new Date().toISOString().replace(/'/g,"''");
       const esc=x=>String(x||"").replaceAll("'","''");
       cdb.exec(`INSERT INTO shard_catalog(shard_key,logical_name,dataset,range_start,range_end,schema_version,state,updated_at)
         VALUES('equities_master','${esc(dbName)}','equities_master','${esc(minDate)}','${esc(maxDate)}','master-v1','ready','${now}')
         ON CONFLICT(shard_key) DO UPDATE SET logical_name=excluded.logical_name,dataset=excluded.dataset,
         range_start=excluded.range_start,range_end=excluded.range_end,schema_version=excluded.schema_version,
         state=excluded.state,updated_at=excluded.updated_at`);
       cdb.close();
     }catch(_){try{if(cdb)cdb.close()}catch(__){}}
     self.postMessage({ok:true,type:"result",dbName,rows:count,minDate,maxDate,quickCheck});
     return;
   }catch(err){
     try{if(mdb)mdb.close()}catch(_){}
     throw err;
   }
 }


 if(cmd==="equities-master-parity"){
   const payload=d.payload||{}, input=payload.rows||[], fields=payload.fields||[];
   let db=null;
   try{
     db=new p.OpfsSAHPoolDb("/jq_equities_master_v1.sqlite","r");
     const rows=[];
     db.exec({sql:`SELECT code,company_name,market_name,sector17_name,sector33_name,margin_name
                   FROM equities_master
                   WHERE effective_date=(SELECT max(effective_date) FROM equities_master)`,
              rowMode:"object",callback:r=>rows.push(r)});
     const norm=v=>{const s=String(v??"").trim().toUpperCase();return s.length===5&&s.endsWith("0")?s.slice(0,4):s};
     const wm=new Map(rows.map(r=>[norm(r.code),r]));
     const stats=Object.fromEntries(fields.map(([pc])=>[pc,{field:pc,compared:0,match:0}]));
     let compared=0,perfect=0,missing=0,mismatch=0;const diffs=[];
     for(const p of input){
       const x=wm.get(norm(p.code)); if(!x){missing++;diffs.push({code:p.code,field:"Code",pc:p.code,web:"欠損"});continue}
       compared++;let ok=true;
       for(const [pc,wf] of fields){
         const pv=String(p[pc]??"").trim(),wv=String(x[wf]??"").trim();
         stats[pc].compared++;
         if(pv===wv)stats[pc].match++;else{ok=false;diffs.push({code:p.code,field:pc,pc:pv,web:wv})}
       }
       if(ok)perfect++;else mismatch++;
     }
     db.close();
     self.postMessage({ok:true,type:"result",total:input.length,compared,perfect,missing,mismatch,
       fieldStats:Object.values(stats),diffs});
     return;
   }catch(err){try{if(db)db.close()}catch(_){} throw err}
 }

 if(cmd==="fins-summary-write" || cmd==="earnings-calendar-write"){
   const payload=d.payload||{}, rows=payload.rows||[], requestedDate=String(payload.date||"");
   const isFins=cmd==="fins-summary-write";
   const dbName=isFins?"/jq_fins_summary_v1.sqlite":"/jq_earnings_calendar_v1.sqlite";
   const table=isFins?"fins_summary":"earnings_calendar";
   const dataset=table, shardKey=table;
   let db=null;
   try{
     db=new p.OpfsSAHPoolDb(dbName,"c");
     db.exec(`CREATE TABLE IF NOT EXISTS ${table}(
       row_key TEXT PRIMARY KEY,
       data_date TEXT NOT NULL,
       code TEXT,
       disclosed_date TEXT,
       disclosed_time TEXT,
       raw_json TEXT NOT NULL
     ) WITHOUT ROWID`);
     db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_date ON ${table}(data_date)`);
     db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_code ON ${table}(code)`);
     const stmt=db.prepare(`INSERT OR REPLACE INTO ${table}(row_key,data_date,code,disclosed_date,disclosed_time,raw_json) VALUES(?,?,?,?,?,?)`);
     db.exec("BEGIN");
     try{
       let seq=0;
       for(const r of rows){
         const code=String(r.Code??r.code??"").trim();
         const disc=String(r.DiscDate??r.DisclosedDate??r.Date??r.date??requestedDate).slice(0,10);
         const time=String(r.DiscTime??r.DisclosedTime??r.Time??"");
         const stable=[requestedDate,code,disc,time,r.DocType??r.Type??"",r.CurPerType??r.FY??"",seq++].join("|");
         stmt.bind([stable,requestedDate,code||null,disc||null,time||null,JSON.stringify(r)]).stepReset();
       }
       db.exec("COMMIT");
     }catch(err){try{db.exec("ROLLBACK")}catch(_){} throw err}
     stmt.finalize();
     const count=Number(scalar(db,`SELECT count(*) FROM ${table}`)||0);
     const minDate=scalar(db,`SELECT min(data_date) FROM ${table}`);
     const maxDate=scalar(db,`SELECT max(data_date) FROM ${table}`);
     const quickCheck=scalar(db,"PRAGMA quick_check");
     db.close();db=null;
     let cdb=null;
     try{
       cdb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","c");
       cdb.exec(`CREATE TABLE IF NOT EXISTS shard_catalog(
         shard_key TEXT PRIMARY KEY, logical_name TEXT NOT NULL, dataset TEXT NOT NULL,
         range_start TEXT, range_end TEXT, schema_version TEXT, state TEXT NOT NULL, updated_at TEXT NOT NULL
       )`);
       const esc=x=>String(x||"").replaceAll("'","''"),now=new Date().toISOString().replaceAll("'","''");
       cdb.exec(`INSERT INTO shard_catalog(shard_key,logical_name,dataset,range_start,range_end,schema_version,state,updated_at)
         VALUES('${shardKey}','${esc(dbName)}','${dataset}','${esc(minDate)}','${esc(maxDate)}','raw-v1','ready','${now}')
         ON CONFLICT(shard_key) DO UPDATE SET logical_name=excluded.logical_name,dataset=excluded.dataset,
         range_start=excluded.range_start,range_end=excluded.range_end,schema_version=excluded.schema_version,
         state=excluded.state,updated_at=excluded.updated_at`);
       cdb.close();
     }catch(_){try{if(cdb)cdb.close()}catch(__){}}
     self.postMessage({ok:true,type:"result",dbName,rows:count,minDate,maxDate,quickCheck});
     return;
   }catch(err){try{if(db)db.close()}catch(_){} throw err}
 }


 const RAW_RANGE_DATASETS={
   "topix-write":{db:"/jq_topix_v1.sqlite",table:"topix",key:"topix",dataset:"topix"},
   "market-calendar-write":{db:"/jq_market_calendar_v1.sqlite",table:"market_calendar",key:"market_calendar",dataset:"market_calendar"},
   "margin-interest-write":{db:"/jq_margin_interest_v1.sqlite",table:"margin_interest",key:"margin_interest",dataset:"margin_interest"},
   "margin-alert-write":{db:"/jq_margin_alert_v1.sqlite",table:"margin_alert",key:"margin_alert",dataset:"margin_alert"},
   "short-ratio-write":{db:"/jq_short_ratio_v1.sqlite",table:"short_ratio",key:"short_ratio",dataset:"short_ratio"},
   "short-sale-report-write":{db:"/jq_short_sale_report_v1.sqlite",table:"short_sale_report",key:"short_sale_report",dataset:"short_sale_report"},
   "investor-types-write":{db:"/jq_investor_types_v1.sqlite",table:"investor_types",key:"investor_types",dataset:"investor_types"}
 };
 if(RAW_RANGE_DATASETS[cmd]){
   const cfg=RAW_RANGE_DATASETS[cmd],payload=d.payload||{},rows=payload.rows||[],from=String(payload.from||""),to=String(payload.to||"");
   let db=null;
   try{
     db=new p.OpfsSAHPoolDb(cfg.db,"c");
     db.exec(`CREATE TABLE IF NOT EXISTS ${cfg.table}(
       row_key TEXT PRIMARY KEY,
       data_date TEXT,
       code TEXT,
       raw_json TEXT NOT NULL
     ) WITHOUT ROWID`);
     db.exec(`CREATE INDEX IF NOT EXISTS idx_${cfg.table}_date ON ${cfg.table}(data_date)`);
     db.exec(`CREATE INDEX IF NOT EXISTS idx_${cfg.table}_code ON ${cfg.table}(code)`);
     const stmt=db.prepare(`INSERT OR REPLACE INTO ${cfg.table}(row_key,data_date,code,raw_json) VALUES(?,?,?,?)`);
     db.exec("BEGIN");
     try{
       let seq=0;
       for(const r of rows){
         const date=String(r.Date??r.date??r.StartDate??r.PubDate??"").slice(0,10);
         const code=String(r.Code??r.code??r.S33??r.Sector33Code??r.Section??"").trim();
         const signature=JSON.stringify(r);
         const rowKey=[date,code,signature.slice(0,120),seq++].join("|");
         stmt.bind([rowKey,date||null,code||null,signature]).stepReset();
       }
       db.exec("COMMIT");
     }catch(err){try{db.exec("ROLLBACK")}catch(_){} throw err}
     stmt.finalize();
     const count=Number(scalar(db,`SELECT count(*) FROM ${cfg.table}`)||0);
     const minDate=scalar(db,`SELECT min(data_date) FROM ${cfg.table}`);
     const maxDate=scalar(db,`SELECT max(data_date) FROM ${cfg.table}`);
     const quickCheck=scalar(db,"PRAGMA quick_check");
     db.close();db=null;
     let cdb=null;
     try{
       cdb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","c");
       cdb.exec(`CREATE TABLE IF NOT EXISTS shard_catalog(
         shard_key TEXT PRIMARY KEY, logical_name TEXT NOT NULL, dataset TEXT NOT NULL,
         range_start TEXT, range_end TEXT, schema_version TEXT, state TEXT NOT NULL, updated_at TEXT NOT NULL
       )`);
       const esc=x=>String(x||"").replaceAll("'","''"),now=new Date().toISOString().replaceAll("'","''");
       cdb.exec(`INSERT INTO shard_catalog(shard_key,logical_name,dataset,range_start,range_end,schema_version,state,updated_at)
       VALUES('${cfg.key}','${esc(cfg.db)}','${cfg.dataset}','${esc(minDate||from)}','${esc(maxDate||to)}','raw-v1','ready','${now}')
       ON CONFLICT(shard_key) DO UPDATE SET logical_name=excluded.logical_name,dataset=excluded.dataset,
       range_start=excluded.range_start,range_end=excluded.range_end,schema_version=excluded.schema_version,
       state=excluded.state,updated_at=excluded.updated_at`);
       cdb.close();
     }catch(_){try{if(cdb)cdb.close()}catch(__){}}
     self.postMessage({ok:true,type:"result",dbName:cfg.db,rows:count,minDate,maxDate,quickCheck});
     return;
   }catch(err){try{if(db)db.close()}catch(_){} throw err}
 }


 if(cmd==="financial-normalize-latest"){
   let db=null;
   try{
     db=new p.OpfsSAHPoolDb("/jq_fins_summary_v1.sqlite","r");
     const rs=execRows(db,"SELECT raw_json FROM fins_summary");
     const byCode=new Map();
     const num=(o,...ks)=>{for(const k of ks){const v=o?.[k];if(v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v)))return Number(v)}return null};
     const str=(o,...ks)=>{for(const k of ks){const v=o?.[k];if(v!==null&&v!==undefined&&String(v).trim())return String(v).trim()}return null};
     for(const rr of rs){
       let o={}; try{o=JSON.parse(String(rr.raw_json||"{}"))}catch(_){continue}
       let code=str(o,"Code","code"); if(!code)continue;
       if(code.length===5&&code.endsWith("0"))code=code.slice(0,4);
       const disc=str(o,"DiscDate","DisclosedDate","Date","date")||"";
       const tm=str(o,"DiscTime","DisclosedTime")||"";
       const stamp=disc+" "+tm;
       const prev=byCode.get(code);
       if(prev && prev._stamp>stamp)continue;
       const sales=num(o,"Sales","NetSales");
       const op=num(o,"OP","OperatingProfit");
       const odp=num(o,"OdP","OrdinaryProfit");
       const np=num(o,"NP","Profit","NetIncome");
       const eps=num(o,"EPS","EarningsPerShare");
       const bps=num(o,"BPS","BookValuePerShare");
       const eq=num(o,"Eq","Equity");
       const ta=num(o,"TA","TotalAssets");
       const cash=num(o,"CashEq","CashAndEquivalents");
       const cfo=num(o,"CFO","CashFlowsFromOperatingActivities");
       const cfi=num(o,"CFI","CashFlowsFromInvestingActivities");
       const cff=num(o,"CFF","CashFlowsFromFinancingActivities");
       const fsales=num(o,"FSales","ForecastSales","ForecastNetSales");
       const fop=num(o,"FOP","ForecastOP","ForecastOperatingProfit");
       const fodp=num(o,"FOdP","ForecastOdP","ForecastOrdinaryProfit");
       const fnp=num(o,"FNP","ForecastNP","ForecastProfit","ForecastNetIncome");
       const feps=num(o,"FEPS","ForecastEPS","ForecastEarningsPerShare");
       byCode.set(code,{code,discDate:disc,discTime:tm,docType:str(o,"DocType","TypeOfDocument"),
         curPerType:str(o,"CurPerType","CurrentPeriodType"),curFYEnd:str(o,"CurFYEn","CurrentFiscalYearEndDate"),
         sales,op,odp,np,eps,bps,equity:eq,totalAssets:ta,cashEq:cash,cfo,cfi,cff,
         forecastSales:fsales,forecastOP:fop,forecastOdP:fodp,forecastNP:fnp,forecastEPS:feps,_stamp:stamp});
     }
     db.close();db=null;
     const rows=[...byCode.values()].map(({_stamp,...x})=>x).sort((x,y)=>x.code.localeCompare(y.code));
     self.postMessage({ok:true,type:"result",rows,count:rows.length});
     return;
   }catch(err){try{if(db)db.close()}catch(_){} throw err}
 }

 if(cmd==="portfolio-integrated-snapshot"){
   const payload=d.payload||{}, stocks=payload.stocks||[], techRows=payload.techRows||[], finRows=payload.finRows||[];
   const tmap=new Map(techRows.map(x=>[String(x.code),x]));
   const fmap=new Map(finRows.map(x=>[String(x.code),x]));
   let mdb=null; const names=new Map();
   try{
     mdb=new p.OpfsSAHPoolDb("/jq_equities_master_v1.sqlite","r");
     const rs=execRows(mdb,"SELECT code,company_name,market,sector17,sector33,margin_category FROM equities_master");
     for(const r of rs){
       let c=String(r.code||""); if(c.length===5&&c.endsWith("0"))c=c.slice(0,4);
       names.set(c,r);
     }
     mdb.close();mdb=null;
   }catch(_){try{if(mdb)mdb.close()}catch(__){}}
   const rows=stocks.map(st=>{
     let code=String(st.code??st.Code??"").trim(); if(code.length===5&&code.endsWith("0"))code=code.slice(0,4);
     const t=tmap.get(code)||{},f=fmap.get(code)||{},m=names.get(code)||{};
     const shares=Number(st.shares??st.Shares??0)||0,avgCost=Number(st.avgCost??st.AvgCost??0)||0;
     const close=Number.isFinite(Number(t.close))?Number(t.close):null;
     const marketValue=close!=null?close*shares:null;
     const cost=avgCost*shares;
     const unrealized=marketValue!=null?marketValue-cost:null;
     const unrealizedPct=cost?unrealized/cost*100:null;
     return {code,name:st.name??st.Name??m.company_name??"",account:st.account??st.Account??"",
       shares,avgCost,close,marketValue,unrealized,unrealizedPct,
       ma25:t.ma25??null,ma75:t.ma75??null,rsi14:t.rsi14??null,return20D:t.ret20??null,relativeToTOPIX20D:t.rel20??null,
       companyName:m.company_name??null,market:m.market??null,sector17:m.sector17??null,sector33:m.sector33??null,marginCategory:m.margin_category??null,
       discDate:f.discDate??null,sales:f.sales??null,op:f.op??null,np:f.np??null,eps:f.eps??null,
       forecastSales:f.forecastSales??null,forecastOP:f.forecastOP??null,forecastNP:f.forecastNP??null,forecastEPS:f.forecastEPS??null};
   });
   self.postMessage({ok:true,type:"result",rows,count:rows.length});
   return;
 }

 if(cmd==="technical-screening-poc"){
   const payload=e.data.payload||{};
   const asOf=String(payload.asOf||"");
   const lookback=Math.max(75,Math.min(360,Number(payload.lookback||320)));
   const topN=Math.max(10,Math.min(200,Number(payload.topN||50)));
   let cdb=null,stage="01-validate";
   try{
     if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw new Error("asOf invalid");
     stage="02-catalog";
     cdb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","r");
     const cats=execRows(cdb,`SELECT shard_key,logical_name,range_start,range_end
       FROM shard_catalog WHERE dataset='bars_daily' AND state='ready'
       AND shard_key GLOB 'bars_[0-9][0-9][0-9][0-9]' ORDER BY shard_key DESC`);
     cdb.close();cdb=null;
     const usable=cats.filter(x=>String(x.range_start||"")<=asOf);
     if(!usable.length)throw new Error("No ready year shard for asOf");

     // Gather distinct trading dates backwards across only the shards needed.
     stage="03-dates";
     const dates=[];
     for(const s of usable){
       let db=null;
       try{
         const name=String(s.logical_name||"");
         db=new p.OpfsSAHPoolDb(name.startsWith("/")?name:"/"+name,"r");
         const rs=execRows(db,`SELECT DISTINCT date FROM bars_daily WHERE date<=? ORDER BY date DESC LIMIT ${lookback}`,[asOf]);
         for(const r of rs){const d=String(r.date);if(!dates.includes(d))dates.push(d)}
         dates.sort().reverse();
         if(dates.length>=lookback)break;
       }finally{try{if(db)db.close()}catch(_){}}
     }
     const chosen=dates.sort().slice(-lookback);
     if(chosen.length<75)throw new Error(`Need >=75 trading dates, got ${chosen.length}`);
     const from=chosen[0],actualAsOf=chosen[chosen.length-1];
     const chosenSet=new Set(chosen);

     stage="04-bars";
     const byCode=new Map(),usedShards=[];
     for(const s of usable.slice().reverse()){
       if(String(s.range_end||"")<from||String(s.range_start||"")>actualAsOf)continue;
       let db=null;
       try{
         const name=String(s.logical_name||"");
         db=new p.OpfsSAHPoolDb(name.startsWith("/")?name:"/"+name,"r");
         const rs=execRows(db,`SELECT code,date,
                  COALESCE(adj_h,h,adj_c,c) AS h,
                  COALESCE(adj_l,l,adj_c,c) AS l,
                  COALESCE(adj_c,c) AS c,
                  volume AS volume FROM bars_daily
           WHERE date>=? AND date<=? AND COALESCE(adj_c,c) IS NOT NULL ORDER BY code,date`,[from,actualAsOf]);
         usedShards.push(String(s.shard_key));
         for(const r of rs){
           const d=String(r.date); if(!chosenSet.has(d))continue;
           const code=String(r.code), c=Number(r.c),v=(r.volume==null||r.volume==="")?null:Number(r.volume),
                 h=Number(r.h),l=Number(r.l);
           if(!Number.isFinite(c)||c<=0)continue;
           if(!byCode.has(code))byCode.set(code,[]);
           byCode.get(code).push({date:d,c,v,h:Number.isFinite(h)?h:c,l:Number.isFinite(l)?l:c});
         }
       }finally{try{if(db)db.close()}catch(_){}}
     }

     stage="04b-topix";
     let topixReturns={ret5:null,ret20:null,ret60:null,ret120:null}, topixStatus="missing";
     let tdb=null;
     try{
       tdb=new p.OpfsSAHPoolDb("/jq_topix_v1.sqlite","r");
       const trs=execRows(tdb,"SELECT raw_json FROM topix");
       const tm=new Map();
       for(const rr of trs){
         try{
           const o=JSON.parse(String(rr.raw_json||"{}"));
           const d=String(o.Date??o.date??"").slice(0,10);
           const c=Number(o.C??o.Close??o.c??o.close);
           if(d&&Number.isFinite(c)&&c>0)tm.set(d,c);
         }catch(_){}
       }
       const tc=chosen.map(d=>tm.get(d));
       const li=tc.length-1,last=tc[li];
       const rp=n=>(li>=n&&Number.isFinite(last)&&Number.isFinite(tc[li-n])&&tc[li-n]>0)?((last/tc[li-n])-1)*100:null;
       topixReturns={ret5:rp(5),ret20:rp(20),ret60:rp(60),ret120:rp(120)};
       topixStatus=Number.isFinite(topixReturns.ret20)?"ready":"insufficient";
       tdb.close();tdb=null;
     }catch(_){try{if(tdb)tdb.close()}catch(__){}}

     stage="05-calc";
     const avg=(a)=>a.reduce((x,y)=>x+y,0)/a.length;
     const pct=(a,b)=>b?((a/b)-1)*100:null;
     function rsi14(xs){
       if(xs.length<15)return null;
       let g=0,l=0;
       for(let i=1;i<=14;i++){const d=xs[i]-xs[i-1];if(d>0)g+=d;else l-=d}
       let ag=g/14,al=l/14;
       for(let i=15;i<xs.length;i++){
         const d=xs[i]-xs[i-1],gg=d>0?d:0,ll=d<0?-d:0;
         ag=((ag*13)+gg)/14; al=((al*13)+ll)/14;
       }
       if(al===0)return 100;
       return 100-(100/(1+(ag/al)));
     }
     const rows=[];
     for(const [code,a0] of byCode){
       const a=a0.sort((x,y)=>x.date.localeCompare(y.date));
       if(a.length<75)continue;
       const closes=a.map(x=>x.c), vols=a.map(x=>x.v), highs=a.map(x=>x.h), lows=a.map(x=>x.l), last=a[a.length-1];
       if(last.date!==actualAsOf)continue;
       const ma5=avg(closes.slice(-5)),ma25=avg(closes.slice(-25)),ma75=avg(closes.slice(-75));
       const high20=Math.max(...highs.slice(-20)), low20=Math.min(...lows.slice(-20));
       const high60=Math.max(...highs.slice(-60)), low60=Math.min(...lows.slice(-60));
       const lowClose20=Math.min(...closes.slice(-20)), lowClose60=Math.min(...closes.slice(-60));
       const distMa25=pct(last.c,ma25), distMa75=pct(last.c,ma75);
       const pos20=high20>low20?((last.c-low20)/(high20-low20))*100:null;
       const pos60=high60>low60?((last.c-low60)/(high60-low60))*100:null;
       const prev5=closes.length>=6?closes[closes.length-6]:null;
       const prev20=closes.length>=21?closes[closes.length-21]:null;
       const prev60=closes.length>=61?closes[closes.length-61]:null;
       const prev120=closes.length>=121?closes[closes.length-121]:null;
       const vol20vals=vols.slice(-20).filter(v=>Number.isFinite(v));
       const vol20=vol20vals.length?avg(vol20vals):null;
       const rs=rsi14(closes);
       const ret5=prev5?pct(last.c,prev5):null,ret20=prev20?pct(last.c,prev20):null;
       const ret60=prev60?pct(last.c,prev60):null,ret120=prev120?pct(last.c,prev120):null;
       const rel5=(ret5!=null&&topixReturns.ret5!=null)?ret5-topixReturns.ret5:null;
       const rel20=(ret20!=null&&topixReturns.ret20!=null)?ret20-topixReturns.ret20:null;
       const rel60=(ret60!=null&&topixReturns.ret60!=null)?ret60-topixReturns.ret60:null;
       const rel120=(ret120!=null&&topixReturns.ret120!=null)?ret120-topixReturns.ret120:null;
       const volRatio=(Number.isFinite(last.v)&&vol20>0)?last.v/vol20:null;
       // Transparent PoC score: trend + momentum + volume. Not yet the desktop production screener.
       let score=0;
       if(last.c>ma25)score+=1;
       if(ma25>ma75)score+=1;
       if(ret20!=null)score+=Math.max(-2,Math.min(2,ret20/10));
       if(volRatio!=null)score+=Math.max(-1,Math.min(1,(volRatio-1)));
       rows.push({code,date:last.date,close:last.c,ma5,ma25,ma75,distMa25,distMa75,
         high20,low20,high60,low60,pos20,pos60,rsi14:rs,ret5,ret20,ret60,ret120,
         topixRet5:topixReturns.ret5,topixRet20:topixReturns.ret20,topixRet60:topixReturns.ret60,topixRet120:topixReturns.ret120,
         rel5,rel20,rel60,rel120,volume:last.v,vol20,volRatio,score});
     }
     rows.sort((a,b)=>b.score-a.score||b.ret20-a.ret20);
     self.postMessage({ok:true,type:"result",stage:"PASS",requestedAsOf:asOf,asOf:actualAsOf,
       from,tradingDates:chosen.length,usedShards,topixStatus,topixReturns,candidates:rows.length,top:rows.slice(0,topN),
       all:payload.returnAll?rows:undefined,
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){self.postMessage({ok:false,type:"error",stage,message:String(err?.message||err),stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});return}
   finally{try{if(cdb)cdb.close()}catch(_){}}
 }
 if(cmd==="scan-missing-weekdays"){
   let cdb=null,stage="01-catalog";
   try{
     cdb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","r");
     const years=execRows(cdb,`SELECT shard_key,logical_name,range_start,range_end
       FROM shard_catalog WHERE dataset='bars_daily' AND state='ready'
       AND shard_key GLOB 'bars_[0-9][0-9][0-9][0-9]' ORDER BY shard_key`);
     cdb.close();cdb=null;
     const missing=[],stats=[];
     stage="02-scan";
     for(const s of years){
       let db=null;
       try{
         const name=String(s.logical_name||""); db=new p.OpfsSAHPoolDb(name.startsWith("/")?name:"/"+name,"r");
         const dates=new Set(execRows(db,"SELECT DISTINCT date FROM bars_daily ORDER BY date").map(r=>String(r.date)));
         const mn=String(s.range_start||""),mx=String(s.range_end||"");
         let candidate=0;
         if(mn&&mx){
           for(let d=new Date(mn+"T12:00:00Z"),e=new Date(mx+"T12:00:00Z");d<=e;d.setUTCDate(d.getUTCDate()+1)){
             const dow=d.getUTCDay(); if(dow===0||dow===6)continue;
             const iso=d.toISOString().slice(0,10);
             if(!dates.has(iso)){missing.push(iso);candidate++}
           }
         }
         stats.push({shardKey:String(s.shard_key),rangeStart:mn,rangeEnd:mx,tradingDates:dates.size,weekdayCandidates:candidate});
       }finally{try{if(db)db.close()}catch(_){}}
     }
     self.postMessage({ok:true,type:"result",stage:"PASS",years:stats,missing,
       candidateCount:missing.length,elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){self.postMessage({ok:false,type:"error",stage,message:String(err?.message||err),stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});return}
   finally{try{if(cdb)cdb.close()}catch(_){}}
 }
 if(cmd==="catalog-coverage-audit"){
   let cdb=null,stage="01-catalog-open";
   try{
     cdb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","r");
     const has=Number(scalar(cdb,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='shard_catalog'")||0)>0;
     if(!has) throw new Error("shard_catalog missing");
     const rows=execRows(cdb,`SELECT shard_key,logical_name,range_start,range_end,state,updated_at
       FROM shard_catalog WHERE dataset='bars_daily' AND state='ready' ORDER BY range_start,shard_key`);
     cdb.close();cdb=null;

     const years=rows.filter(r=>/^bars_\d{4}$/.test(String(r.shard_key||"")));
     const recent=rows.find(r=>String(r.shard_key)==="bars_recent")||null;
     const gaps=[];
     function daysBetween(a,b){
       if(!a||!b)return null;
       const x=new Date(a+"T00:00:00Z"),y=new Date(b+"T00:00:00Z");
       return Math.round((y-x)/86400000);
     }
     for(let i=1;i<years.length;i++){
       const prev=years[i-1],cur=years[i];
       const d=daysBetween(String(prev.range_end||""),String(cur.range_start||""));
       if(d!=null && d>14) gaps.push({
         after:String(prev.shard_key),before:String(cur.shard_key),
         prevEnd:String(prev.range_end||""),nextStart:String(cur.range_start||""),calendarGapDays:d
       });
     }
     self.postMessage({ok:true,type:"result",stage:"PASS",yearShards:years,recent,gaps,
       coverageStart:years.length?String(years[0].range_start||""):null,
       coverageEnd:years.length?String(years[years.length-1].range_end||""):null,
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,message:String(err?.message||err),
       stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{try{if(cdb)cdb.close()}catch(_){}}
 }

 if(cmd==="catalog-read-bars-range"){
   const payload=e.data.payload||{};
   const from=String(payload.from||""),to=String(payload.to||"");
   const code=String(payload.code||"").trim();
   const sampleLimit=Math.max(1,Math.min(200,Number(payload.sampleLimit||50)));
   let cdb=null,stage="01-validate";
   try{
     if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)
       throw new Error("from/to invalid");
     stage="02-catalog";
     cdb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","r");
     const cat=execRows(cdb,`SELECT shard_key,logical_name,range_start,range_end,state
       FROM shard_catalog
       WHERE dataset='bars_daily' AND state='ready'
         AND COALESCE(range_end,'9999-12-31')>=?
         AND COALESCE(range_start,'0000-01-01')<=?
       ORDER BY range_start,shard_key`,[from,to]);
     cdb.close();cdb=null;

     // Prefer canonical year shards. Use bars_recent only as fallback for years
     // which have no ready year shard, preventing duplicate (code,date) reads.
     const y1=Number(from.slice(0,4)),y2=Number(to.slice(0,4));
     const selected=[],catalogWarnings=[];
     for(let y=y1;y<=y2;y++){
       const yf=`${y}-01-01`,yt=`${y}-12-31`;
       const segFrom=from>yf?from:yf,segTo=to<yt?to:yt;
       let entry=cat.find(r=>String(r.shard_key)===`bars_${y}`);
       if(!entry){
         const rr=cat.find(r=>String(r.shard_key)==="bars_recent" &&
           String(r.range_end||"9999-12-31")>=segFrom && String(r.range_start||"0000-01-01")<=segTo);
         if(rr){
           entry=rr;
           catalogWarnings.push(`${y}: year shard missing; bars_recent fallback`);
         }else{
           catalogWarnings.push(`${y}: no ready shard for requested range`);
           continue;
         }
       }
       selected.push({year:y,segFrom,segTo,...entry});
     }
     if(!selected.length) throw new Error("Catalog could not resolve any shard for requested range");

     stage="03-read";
     const shardStats=[],samples=[];
     let totalRows=0;
     const seen=new Set();
     for(const s of selected){
       let db=null;
       try{
         const name=String(s.logical_name||"");
         db=new p.OpfsSAHPoolDb(name.startsWith("/")?name:"/"+name,"r");
         const where=["date>=?","date<=?"],bind=[s.segFrom,s.segTo];
         if(code){where.push("code=?");bind.push(code)}
         const count=Number(scalarBind(db,`SELECT COUNT(*) FROM bars_daily WHERE ${where.join(" AND ")}`,bind)||0);
         const minDate=scalarBind(db,`SELECT MIN(date) FROM bars_daily WHERE ${where.join(" AND ")}`,bind);
         const maxDate=scalarBind(db,`SELECT MAX(date) FROM bars_daily WHERE ${where.join(" AND ")}`,bind);
         totalRows+=count;
         shardStats.push({shardKey:String(s.shard_key),logicalName:name,segFrom:s.segFrom,segTo:s.segTo,count,minDate,maxDate});

         if(samples.length<sampleLimit){
           const lim=sampleLimit-samples.length;
           const rs=execRows(db,`SELECT code,date,o,h,l,c,volume,turnover_value
             FROM bars_daily WHERE ${where.join(" AND ")}
             ORDER BY date,code LIMIT ${Number(lim)}`,bind);
           for(const r of rs){
             const k=`${r.code}|${r.date}`;
             if(!seen.has(k)){seen.add(k);samples.push(r)}
           }
         }
       }finally{try{if(db)db.close()}catch(_){}}
     }
     self.postMessage({ok:true,type:"result",stage:"PASS",from,to,code:code||null,
       selected:shardStats,totalRows,samples,catalogWarnings,
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,message:String(err?.message||err),
       stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{try{if(cdb)cdb.close()}catch(_){}}
 }
 if(cmd==="shard-native-daily-write"){
   const payload=e.data.payload||{}, date=String(payload.date||""), rows=payload.rows||[];
   let recentDb=null,yearDb=null,catDb=null,stage="01-validate";
   try{
     if(!/^\d{4}-?\d{2}-?\d{2}$/.test(date)) throw new Error("invalid date");
     const iso=date.includes("-")?date:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
     const year=Number(iso.slice(0,4));
     if(!Array.isArray(rows)||!rows.length) throw new Error("API rows empty");

     const aliases={
       date:["Date","date"],code:["Code","code"],
       o:["O","o","Open","open"],h:["H","h","High","high"],l:["L","l","Low","low"],c:["C","c","Close","close"],
       upper_limit:["UL","UpperLimit","upper_limit"],lower_limit:["LL","LowerLimit","lower_limit"],
       volume:["Vo","Volume","volume"],value:["Va","Value","TurnoverValue","value","turnover_value"],
       adj_factor:["AdjFactor","AdjustmentFactor","adj_factor","adjustment_factor"],
       adj_o:["AdjO","AdjustmentOpen","adj_o","adjustment_open"],
       adj_h:["AdjH","AdjustmentHigh","adj_h","adjustment_high"],
       adj_l:["AdjL","AdjustmentLow","adj_l","adjustment_low"],
       adj_c:["AdjC","AdjustmentClose","adj_c","adjustment_close"],
       adj_volume:["AdjVo","AdjustmentVolume","adj_volume","adjustment_volume"],
       turnover_value:["Va","TurnoverValue","turnover_value"],raw_json:["__RAW_JSON__"]
     };
     function pick(obj,c){
       if(c==="raw_json") return JSON.stringify(obj);
       for(const k of (aliases[c]||[c])) if(Object.prototype.hasOwnProperty.call(obj,k)) return obj[k];
       return null;
     }
     function ensureBars(db){
       db.exec(`CREATE TABLE IF NOT EXISTS bars_daily(
         code TEXT NOT NULL,date TEXT NOT NULL,o REAL,h REAL,l REAL,c REAL,
         upper_limit REAL,lower_limit REAL,value REAL,
         adj_o REAL,adj_h REAL,adj_l REAL,adj_c REAL,
         adj_factor REAL,adj_volume REAL,volume REAL,turnover_value REAL,raw_json TEXT,
         PRIMARY KEY(code,date)
       ) WITHOUT ROWID`);
       db.exec(`CREATE INDEX IF NOT EXISTS idx_bars_date ON bars_daily(date)`);
       db.exec(`CREATE TABLE IF NOT EXISTS shard_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);
     }
     function writeRows(db){
       ensureBars(db);
       const cols=tableInfo(db,"bars_daily").map(x=>x.name);
       const insertCols=cols.filter(c=>pick(rows[0],c)!==null||["date","code"].includes(c));
       const updates=insertCols.filter(c=>!["code","date"].includes(c))
         .map(c=>`${qident(c)}=excluded.${qident(c)}`).join(",");
       const sql=`INSERT INTO bars_daily(${insertCols.map(qident).join(",")})
         VALUES(${insertCols.map(()=>"?").join(",")})
         ON CONFLICT(code,date) DO UPDATE SET ${updates}`;
       const stmt=db.prepare(sql);
       try{
         db.exec("BEGIN");
         for(const r of rows) stmt.bind(insertCols.map(c=>pick(r,c))).stepReset();
         db.exec("COMMIT");
       }catch(err){try{db.exec("ROLLBACK")}catch(_){} throw err}
       finally{stmt.finalize()}
     }

     stage="02-open-recent";
     recentDb=new p.OpfsSAHPoolDb("/jq_bars_recent_v1.sqlite","c");
     stage="03-write-recent"; writeRows(recentDb);

     // keep recent to most recent 30 distinct trading dates
     stage="04-trim-recent";
     recentDb.exec(`DELETE FROM bars_daily
       WHERE date < (
         SELECT MIN(date) FROM (
           SELECT DISTINCT date FROM bars_daily ORDER BY date DESC LIMIT 30
         )
       )`);

     stage="05-open-year";
     const yearName=`/jq_bars_${year}_v1.sqlite`;
     yearDb=new p.OpfsSAHPoolDb(yearName,"c");
     stage="06-write-year"; writeRows(yearDb);

     stage="07-verify";
     const esc=iso.replace(/'/g,"''");
     const recentCount=Number(scalar(recentDb,`SELECT COUNT(*) FROM bars_daily WHERE date='${esc}'`)||0);
     const yearCount=Number(scalar(yearDb,`SELECT COUNT(*) FROM bars_daily WHERE date='${esc}'`)||0);
     const recentQc=String(scalar(recentDb,"PRAGMA quick_check")||"");
     const yearQc=String(scalar(yearDb,"PRAGMA quick_check")||"");
     if(recentCount!==rows.length||yearCount!==rows.length)
       throw new Error(`verify mismatch API=${rows.length} recent=${recentCount} year=${yearCount}`);
     if(recentQc!=="ok"||yearQc!=="ok")
       throw new Error(`quick_check recent=${recentQc} year=${yearQc}`);

     const recentMin=String(scalar(recentDb,"SELECT MIN(date) FROM bars_daily")||"");
     const recentMax=String(scalar(recentDb,"SELECT MAX(date) FROM bars_daily")||"");
     const yearMin=String(scalar(yearDb,"SELECT MIN(date) FROM bars_daily")||"");
     const yearMax=String(scalar(yearDb,"SELECT MAX(date) FROM bars_daily")||"");
     const at=new Date().toISOString().replace(/'/g,"''");

     recentDb.close(); recentDb=null;
     yearDb.close(); yearDb=null;

     stage="08-catalog";
     catDb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","c");
     catDb.exec(`CREATE TABLE IF NOT EXISTS shard_catalog(
       shard_key TEXT PRIMARY KEY,logical_name TEXT NOT NULL,dataset TEXT NOT NULL,
       range_start TEXT,range_end TEXT,schema_version TEXT NOT NULL,state TEXT NOT NULL,updated_at TEXT NOT NULL)`);
     for(const x of [
       {k:"bars_recent",n:"/jq_bars_recent_v1.sqlite",a:recentMin,b:recentMax},
       {k:`bars_${year}`,n:`/jq_bars_${year}_v1.sqlite`,a:yearMin,b:yearMax}
     ]){
       catDb.exec(`INSERT INTO shard_catalog(shard_key,logical_name,dataset,range_start,range_end,schema_version,state,updated_at)
         VALUES('${x.k}','${x.n}','bars_daily','${x.a}','${x.b}','bars-v1','ready','${at}')
         ON CONFLICT(shard_key) DO UPDATE SET logical_name='${x.n}',dataset='bars_daily',
         range_start='${x.a}',range_end='${x.b}',schema_version='bars-v1',state='ready',updated_at='${at}'`);
     }
     catDb.close();catDb=null;

     self.postMessage({ok:true,type:"result",stage:"PASS",date:iso,year,apiRows:rows.length,
       recentRows:recentCount,yearRows:yearCount,recentMin,recentMax,yearMin,yearMax,
       recentQuickCheck:recentQc,yearQuickCheck:yearQc,elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,message:String(err?.message||err),
       stack:String(err?.stack||""),elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{
     try{if(catDb)catDb.close()}catch(_){}
     try{if(yearDb)yearDb.close()}catch(_){}
     try{if(recentDb)recentDb.close()}catch(_){}
   }
 }
 if(cmd==="shard-write-api-date"){
   const payload=e.data.payload||{}, date=String(payload.date||""), rows=payload.rows||[];
   let db=null,stage="01-validate";
   try{
     if(!/^\d{4}-?\d{2}-?\d{2}$/.test(date)) throw new Error("invalid date");
     const iso=date.includes("-")?date:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
     const year=Number(iso.slice(0,4));
     if(!Array.isArray(rows)) throw new Error("rows must be an array");
     const shardName=`/jq_bars_${year}_v1.sqlite`;

     stage="02-open";
     db=new p.OpfsSAHPoolDb(shardName,"c");
     db.exec(`CREATE TABLE IF NOT EXISTS bars_daily(
       code TEXT NOT NULL,date TEXT NOT NULL,o REAL,h REAL,l REAL,c REAL,
       upper_limit REAL,lower_limit REAL,value REAL,
       adj_o REAL,adj_h REAL,adj_l REAL,adj_c REAL,
       adj_factor REAL,adj_volume REAL,volume REAL,turnover_value REAL,raw_json TEXT,
       PRIMARY KEY(code,date)
     ) WITHOUT ROWID`);
     db.exec(`CREATE INDEX IF NOT EXISTS idx_bars_year_date ON bars_daily(date)`);
     db.exec(`CREATE TABLE IF NOT EXISTS shard_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);

     if(rows.length){
       stage="03-write";
       const cols=tableInfo(db,"bars_daily").map(x=>x.name);
       const aliases={
         date:["Date","date"],code:["Code","code"],
         o:["O","o","Open","open"],h:["H","h","High","high"],l:["L","l","Low","low"],c:["C","c","Close","close"],
         upper_limit:["UL","UpperLimit","upper_limit"],lower_limit:["LL","LowerLimit","lower_limit"],
         volume:["Vo","Volume","volume"],value:["Va","Value","TurnoverValue","value","turnover_value"],
         adj_factor:["AdjFactor","AdjustmentFactor","adj_factor","adjustment_factor"],
         adj_o:["AdjO","AdjustmentOpen","adj_o","adjustment_open"],
         adj_h:["AdjH","AdjustmentHigh","adj_h","adjustment_high"],
         adj_l:["AdjL","AdjustmentLow","adj_l","adjustment_low"],
         adj_c:["AdjC","AdjustmentClose","adj_c","adjustment_close"],
         adj_volume:["AdjVo","AdjustmentVolume","adj_volume","adjustment_volume"],
         turnover_value:["Va","TurnoverValue","turnover_value"],raw_json:["__RAW_JSON__"]
       };
       function pick(obj,c){
         if(c==="raw_json") return JSON.stringify(obj);
         for(const k of (aliases[c]||[c])) if(Object.prototype.hasOwnProperty.call(obj,k)) return obj[k];
         return null;
       }
       const insertCols=cols.filter(c=>pick(rows[0],c)!==null||["date","code"].includes(c));
       const updates=insertCols.filter(c=>!["code","date"].includes(c))
         .map(c=>`${qident(c)}=excluded.${qident(c)}`).join(",");
       const sql=`INSERT INTO bars_daily(${insertCols.map(qident).join(",")})
         VALUES(${insertCols.map(()=>"?").join(",")})
         ON CONFLICT(code,date) DO UPDATE SET ${updates}`;
       const stmt=db.prepare(sql);
       let written=0;
       try{
         db.exec("BEGIN");
         for(const r of rows){
           stmt.bind(insertCols.map(c=>pick(r,c))).stepReset();
           written++;
         }
         db.exec("COMMIT");
       }catch(err){try{db.exec("ROLLBACK")}catch(_){} throw err}
       finally{stmt.finalize()}
     }

     stage="04-verify-date";
     const cnt=Number(scalar(db,`SELECT COUNT(*) FROM bars_daily WHERE date='${iso.replace(/'/g,"''")}'`)||0);
     const qc=String(scalar(db,"PRAGMA quick_check")||"");
     if(qc!=="ok") throw new Error(`quick_check=${qc}`);
     if(rows.length && cnt!==rows.length) throw new Error(`date verify mismatch API=${rows.length} DB=${cnt}`);
     db.close();db=null;

     self.postMessage({ok:true,type:"result",stage:"PASS",date:iso,year,shardName,
       apiRows:rows.length,verifiedRows:cnt,quickCheck:qc,
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,
       message:String(err&&err.message?err.message:err),
       stack:String(err&&err.stack?err.stack:""),
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{try{if(db)db.close()}catch(_){}}
 }

 if(cmd==="shard-finalize-api-year"){
   const payload=e.data.payload||{}, year=Number(payload.year);
   let db=null,catDb=null,stage="01-validate";
   try{
     if(!Number.isFinite(year)||year<2000||year>2100) throw new Error("invalid year");
     const shardKey=`bars_${year}`, shardName=`/jq_bars_${year}_v1.sqlite`;
     stage="02-open";
     db=new p.OpfsSAHPoolDb(shardName,"c");
     if(!tableInfo(db,"bars_daily").length) throw new Error("bars_daily missing");

     stage="03-verify-year";
     const from=`${year}-01-01`,to=`${year}-12-31`;
     const verified=Number(scalar(db,`SELECT COUNT(*) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||0);
     const days=Number(scalar(db,`SELECT COUNT(DISTINCT date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||0);
     const minDate=String(scalar(db,`SELECT MIN(date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||"");
     const maxDate=String(scalar(db,`SELECT MAX(date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||"");
     const qc=String(scalar(db,"PRAGMA quick_check")||"");
     if(qc!=="ok") throw new Error(`quick_check=${qc}`);
     if(!verified||!days) throw new Error("year shard is empty");

     const at=new Date().toISOString().replace(/'/g,"''");
     db.exec(`CREATE TABLE IF NOT EXISTS shard_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);
     for(const [k,v] of Object.entries({
       role:shardKey,schema_version:"bars-v1",calendar_year:String(year),
       range_start:minDate,range_end:maxDate,source_db:"J-Quants V2 API",
       backfill_mode:"date-by-date",migrated_at:at
     })){
       const kk=String(k).replace(/'/g,"''"),vv=String(v).replace(/'/g,"''");
       db.exec(`INSERT INTO shard_meta(key,value) VALUES('${kk}','${vv}')
         ON CONFLICT(key) DO UPDATE SET value='${vv}'`);
     }
     db.close();db=null;

     stage="04-catalog";
     catDb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","c");
     catDb.exec(`CREATE TABLE IF NOT EXISTS shard_catalog(
       shard_key TEXT PRIMARY KEY,logical_name TEXT NOT NULL,dataset TEXT NOT NULL,
       range_start TEXT,range_end TEXT,schema_version TEXT NOT NULL,state TEXT NOT NULL,updated_at TEXT NOT NULL)`);
     catDb.exec(`INSERT INTO shard_catalog(shard_key,logical_name,dataset,range_start,range_end,schema_version,state,updated_at)
       VALUES('${shardKey}','${shardName}','bars_daily','${minDate}','${maxDate}','bars-v1','ready','${at}')
       ON CONFLICT(shard_key) DO UPDATE SET logical_name='${shardName}',dataset='bars_daily',
       range_start='${minDate}',range_end='${maxDate}',schema_version='bars-v1',state='ready',updated_at='${at}'`);
     catDb.close();catDb=null;

     self.postMessage({ok:true,type:"result",stage:"PASS",year,shardKey,shardName,
       verifiedRows:verified,tradingDays:days,minDate,maxDate,quickCheck:qc,
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,
       message:String(err&&err.message?err.message:err),
       stack:String(err&&err.stack?err.stack:""),
       elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{try{if(catDb)catDb.close()}catch(_){} try{if(db)db.close()}catch(_){}}
 }
 if(cmd==="shard-write-api-year"){
   const payload=e.data.payload||{}, year=Number(payload.year), rows=payload.rows||[];
   let dstDb=null,catDb=null,stage="01-validate";
   try{
     if(!Number.isFinite(year)||year<2000||year>2100) throw new Error("invalid year");
     if(!Array.isArray(rows)||!rows.length) throw new Error("API rows empty");
     const shardKey=`bars_${year}`, shardName=`/jq_bars_${year}_v1.sqlite`;
     stage="02-destination-open";
     dstDb=new p.OpfsSAHPoolDb(shardName,"c");
     dstDb.exec(`CREATE TABLE IF NOT EXISTS bars_daily(
       code TEXT NOT NULL,date TEXT NOT NULL,o REAL,h REAL,l REAL,c REAL,
       upper_limit REAL,lower_limit REAL,value REAL,
       adj_o REAL,adj_h REAL,adj_l REAL,adj_c REAL,
       adj_factor REAL,adj_volume REAL,volume REAL,turnover_value REAL,raw_json TEXT,
       PRIMARY KEY(code,date)
     ) WITHOUT ROWID`);
     dstDb.exec(`CREATE INDEX IF NOT EXISTS idx_bars_year_date ON bars_daily(date)`);
     dstDb.exec(`CREATE TABLE IF NOT EXISTS shard_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);

     const cols=tableInfo(dstDb,"bars_daily").map(x=>x.name);
     const aliases={
       date:["Date","date"],code:["Code","code"],
       o:["O","o","Open","open"],h:["H","h","High","high"],l:["L","l","Low","low"],c:["C","c","Close","close"],
       upper_limit:["UL","UpperLimit","upper_limit"],lower_limit:["LL","LowerLimit","lower_limit"],
       volume:["Vo","Volume","volume"],value:["Va","Value","TurnoverValue","value","turnover_value"],
       adj_factor:["AdjFactor","AdjustmentFactor","adj_factor","adjustment_factor"],
       adj_o:["AdjO","AdjustmentOpen","adj_o","adjustment_open"],
       adj_h:["AdjH","AdjustmentHigh","adj_h","adjustment_high"],
       adj_l:["AdjL","AdjustmentLow","adj_l","adjustment_low"],
       adj_c:["AdjC","AdjustmentClose","adj_c","adjustment_close"],
       adj_volume:["AdjVo","AdjustmentVolume","adj_volume","adjustment_volume"],
       turnover_value:["Va","TurnoverValue","turnover_value"],raw_json:["__RAW_JSON__"]
     };
     function pick(obj,c){
       if(c==="raw_json") return JSON.stringify(obj);
       for(const k of (aliases[c]||[c])) if(Object.prototype.hasOwnProperty.call(obj,k)) return obj[k];
       return null;
     }
     const insertCols=cols.filter(c=>pick(rows[0],c)!==null||["date","code"].includes(c));
     const updates=insertCols.filter(c=>!["code","date"].includes(c))
       .map(c=>`${qident(c)}=excluded.${qident(c)}`).join(",");
     const sql=`INSERT INTO bars_daily(${insertCols.map(qident).join(",")})
       VALUES(${insertCols.map(()=>"?").join(",")})
       ON CONFLICT(code,date) DO UPDATE SET ${updates}`;
     const stmt=dstDb.prepare(sql);
     let written=0;
     stage="03-write";
     try{
       dstDb.exec("BEGIN");
       for(const r of rows){
         stmt.bind(insertCols.map(c=>pick(r,c))).stepReset();
         written++;
         if(written%50000===0) status("03-write",`${written.toLocaleString()} / ${rows.length.toLocaleString()} rows`);
       }
       dstDb.exec("COMMIT");
     }catch(err){try{dstDb.exec("ROLLBACK")}catch(_){} throw err}
     finally{stmt.finalize()}

     stage="04-verify";
     const from=`${year}-01-01`,to=`${year}-12-31`;
     const verified=Number(scalar(dstDb,`SELECT COUNT(*) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||0);
     const days=Number(scalar(dstDb,`SELECT COUNT(DISTINCT date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||0);
     const minDate=String(scalar(dstDb,`SELECT MIN(date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||"");
     const maxDate=String(scalar(dstDb,`SELECT MAX(date) FROM bars_daily WHERE date>='${from}' AND date<='${to}'`)||"");
     const qc=String(scalar(dstDb,"PRAGMA quick_check")||"");
     if(qc!=="ok") throw new Error(`quick_check=${qc}`);
     if(!verified||!days) throw new Error("verified year is empty");

     const at=new Date().toISOString().replace(/'/g,"''");
     for(const [k,v] of Object.entries({
       role:shardKey,schema_version:"bars-v1",calendar_year:String(year),
       range_start:minDate,range_end:maxDate,source_db:"J-Quants V2 API",migrated_at:at
     })){
       const kk=String(k).replace(/'/g,"''"),vv=String(v).replace(/'/g,"''");
       dstDb.exec(`INSERT INTO shard_meta(key,value) VALUES('${kk}','${vv}')
         ON CONFLICT(key) DO UPDATE SET value='${vv}'`);
     }
     dstDb.close();dstDb=null;

     stage="05-catalog";
     catDb=new p.OpfsSAHPoolDb("/jq_catalog_v1.sqlite","c");
     catDb.exec(`CREATE TABLE IF NOT EXISTS shard_catalog(
       shard_key TEXT PRIMARY KEY,logical_name TEXT NOT NULL,dataset TEXT NOT NULL,
       range_start TEXT,range_end TEXT,schema_version TEXT NOT NULL,state TEXT NOT NULL,updated_at TEXT NOT NULL)`);
     catDb.exec(`INSERT INTO shard_catalog(shard_key,logical_name,dataset,range_start,range_end,schema_version,state,updated_at)
       VALUES('${shardKey}','${shardName}','bars_daily','${minDate}','${maxDate}','bars-v1','ready','${at}')
       ON CONFLICT(shard_key) DO UPDATE SET logical_name='${shardName}',dataset='bars_daily',
       range_start='${minDate}',range_end='${maxDate}',schema_version='bars-v1',state='ready',updated_at='${at}'`);
     catDb.close();catDb=null;

     self.postMessage({ok:true,type:"result",stage:"PASS",year,shardName,
       apiRows:rows.length,writtenRows:written,verifiedRows:verified,tradingDays:days,
       minDate,maxDate,quickCheck:qc,elapsedMs:Math.round(performance.now()-t0)});
     return;
   }catch(err){
     self.postMessage({ok:false,type:"error",stage,message:String(err&&err.message?err.message:err),
       stack:String(err&&err.stack?err.stack:""),elapsedMs:Math.round(performance.now()-t0)});
     return;
   }finally{try{if(catDb)catDb.close()}catch(_){} try{if(dstDb)dstDb.close()}catch(_){}}
 }
 if(cmd==="shard-health"){
   const catalogName="/jq_catalog_v1.sqlite";
   let cdb=null,sdb=null,stage="start";
   const mark=(s,detail="")=>{stage=s;status(s,detail)};
   try{
     mark("01-catalog-open","Catalog DB open");
     cdb=new p.OpfsSAHPoolDb(catalogName,"c");

     mark("02-catalog-read","Catalog read");
     const rows=execRows(cdb,"SELECT * FROM shard_catalog ORDER BY shard_key");
     const recent=rows.find(x=>x.shard_key==="bars_recent");
     if(!recent) throw new Error("bars_recent is not registered in catalog");

     mark("03-catalog-close","Catalog close");
     cdb.close();cdb=null;

     mark("04-shard-open","bars_recent reopen (mode=c)");
     const open0=performance.now();
     sdb=new p.OpfsSAHPoolDb(recent.logical_name,"c");
     const openMs=Math.round(performance.now()-open0);

     mark("05-shard-check","bars_recent health check");
     const tableOk=Number(scalar(sdb,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)===1;
     const count=tableOk?Number(scalar(sdb,"SELECT COUNT(*) FROM bars_daily")||0):0;
     const meta=execRows(sdb,"SELECT * FROM shard_meta ORDER BY key");

     mark("06-shard-close","bars_recent close");
     sdb.close();sdb=null;

     self.postMessage({
       ok:tableOk,type:"result",stage:"PASS",
       catalogName,shard:recent,tableOk,count,meta,openMs,
       poolFiles:p.getFileNames(),
       elapsedMs:Math.round(performance.now()-t0)
     });
     return;
   }catch(err){
     self.postMessage({
       ok:false,type:"error",stage,
       message:String(err&&err.message?err.message:err),
       stack:String(err&&err.stack?err.stack:""),
       elapsedMs:Math.round(performance.now()-t0)
     });
     return;
   }finally{
     try{if(sdb)sdb.close()}catch(_){}
     try{if(cdb)cdb.close()}catch(_){}
   }
 }

 if(cmd==="init"){self.postMessage({ok:true,type:"result",sqliteVersion:s.version.libVersion,vfsName:p.vfsName,vfs,poolClass:!!p.OpfsSAHPoolDb,capacity:p.getCapacity(),poolName:"jq-sahpool",poolDirectory:".jq-sahpool-v7c-r5",origin:self.location.origin,files:p.getFileNames(),elapsedMs:Math.round(performance.now()-t0)});return;}
 
  if(cmd==="backup-stats"){
 const resolved=resolveExistingMarketDb(p,name), marketName=resolved.name;db=new p.OpfsSAHPoolDb(marketName,"r");
 const pc=Number(scalar(db,"PRAGMA page_count")||0),ps=Number(scalar(db,"PRAGMA page_size")||0),rows=Number(scalar(db,"SELECT MAX(rowid) FROM bars_daily")||0);
 db.close();db=null;self.postMessage({ok:true,type:"result",dbBytes:pc*ps,rows});return;
}
if(cmd==="backup-create"){
 const resolved=resolveExistingMarketDb(p,name),marketName=resolved.name,backupName="/jq_market_snapshot.sqlite";
 if(p.getFileNames().includes(backupName))p.unlink(backupName);
 db=new p.OpfsSAHPoolDb(marketName,"r");status("backup","VACUUM INTO snapshot");db.exec(`VACUUM INTO '${backupName}'`);db.close();db=null;
 const b=new p.OpfsSAHPoolDb(backupName,"r"),qc=String(scalar(b,"PRAGMA quick_check")||""),rows=Number(scalar(b,"SELECT COUNT(*) FROM bars_daily")||0),minDate=scalar(b,"SELECT MIN(date) FROM bars_daily"),maxDate=scalar(b,"SELECT MAX(date) FROM bars_daily"),pc=Number(scalar(b,"PRAGMA page_count")||0),ps=Number(scalar(b,"PRAGMA page_size")||0);b.close();
 self.postMessage({ok:qc==="ok",type:"result",backupName,qc,rows,minDate,maxDate,dbBytes:pc*ps,elapsedMs:Math.round(performance.now()-t0)});return;
}

if(cmd==="market-warm-open"){
 const marketName=resolveMarketNameWithoutOpen(p,name);
 const tOpen=performance.now();
 const h=getCachedMarketDb(p,marketName);
 const openMs=Math.round(performance.now()-tOpen);
 const schema=Number(scalar(h,"PRAGMA schema_version")||0);
 self.postMessage({ok:true,type:"result",marketName,schema,poolFiles:p.getFileNames(),
   openMs,elapsedMs:Math.round(performance.now()-t0)});
 return;
}

if(cmd==="market-fast-health"){
 let marketName=cachedMarketDbName, h=cachedMarketDb;
 if(!h){
   marketName=resolveMarketNameWithoutOpen(p,name);
   h=getCachedMarketDb(p,marketName);
 }
 const tableOk=Number(scalar(h,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)===1;
 const sample=execRows(h,"SELECT code,date,c FROM bars_daily LIMIT 1")[0]||null;
 self.postMessage({ok:tableOk&&!!sample,type:"result",marketName,tableOk,sample,
   poolFiles:p.getFileNames(),reusedOpenHandle:!!cachedMarketDb,elapsedMs:Math.round(performance.now()-t0)});
 return;
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
   const r=sample[0], before=Number(scalar(db,"SELECT MAX(rowid) FROM bars_daily")||0);
   db.exec("BEGIN IMMEDIATE");
   try{
     db.exec({sql:"UPDATE bars_daily SET c=c WHERE code=? AND date=?",bind:[r.code,r.date]});
     db.exec("COMMIT");
   }catch(err){try{db.exec("ROLLBACK")}catch(_){} throw err}
   const after=Number(scalar(db,"SELECT MAX(rowid) FROM bars_daily")||0);
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
 if(cmd==="open"){const hasBars=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)>0,hasSync=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_log'")||0)>0;const out={ok:true,type:"result",sqliteVersion:s.version.libVersion,vfsUsed:p.vfsName,filename:name,tableCount:Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table'")||0),barsCount:hasBars?Number(scalar(db,"SELECT MAX(rowid) FROM bars_daily")||0):0,minDate:hasBars?scalar(db,"SELECT MIN(date) FROM bars_daily"):null,maxDate:hasBars?scalar(db,"SELECT MAX(date) FROM bars_daily"):null,syncOk:hasSync?Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='OK'")||0):0,elapsedMs:Math.round(performance.now()-t0)};db.close();self.postMessage(out);return;}
 if(cmd==="quick"){const quick=String(scalar(db,"PRAGMA quick_check")??"");db.close();self.postMessage({ok:true,type:"result",quick,elapsedMs:Math.round(performance.now()-t0)});return;}
 throw new Error(`Unknown cmd: ${cmd}`);
 }catch(err){try{if(db)db.close()}catch(_){} self.postMessage({ok:false,type:"result",stage:"caught-exception",error:String(err?.stack||err)})}};
