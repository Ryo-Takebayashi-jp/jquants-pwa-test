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
     initialCapacity:6
   });
   return {sqlite3,pool,runtimeId:"worker-persistent-v1"};
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
