const status=(stage,detail="")=>self.postMessage({type:"status",stage,detail});
function scalar(db,sql){let v=null;db.exec({sql,rowMode:"array",callback:r=>{if(v===null)v=r[0]}});return v}
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
self.onmessage=async e=>{const d=e.data||{},cmd=d.cmd,name=d.dbName||"/jq_market_v7c.sqlite",t0=performance.now();let db;try{
 const x=await initSqlite(); const s=x.sqlite3,p=x.pool; const vfs=!!s.capi.sqlite3_vfs_find(p.vfsName);
 if(cmd==="init"){self.postMessage({ok:true,type:"result",sqliteVersion:s.version.libVersion,vfsName:p.vfsName,vfs,poolClass:!!p.OpfsSAHPoolDb,capacity:p.getCapacity(),files:p.getFileNames(),elapsedMs:Math.round(performance.now()-t0)});return;}
 if(cmd==="import"){if(!d.file)throw new Error("File missing"); const out=await importFile(d.file,name); self.postMessage({ok:true,type:"result",...out,vfsName:p.vfsName,files:p.getFileNames(),elapsedMs:Math.round(performance.now()-t0)});return;}
 if(!p.getFileNames().includes(name)) throw new Error(`SAH pool DB not found: ${name}`);
 db=new p.OpfsSAHPoolDb(name,"r");
 if(cmd==="open"){const hasBars=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)>0,hasSync=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_log'")||0)>0;const out={ok:true,type:"result",sqliteVersion:s.version.libVersion,vfsUsed:p.vfsName,filename:name,tableCount:Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table'")||0),barsCount:hasBars?Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0):0,minDate:hasBars?scalar(db,"SELECT MIN(date) FROM bars_daily"):null,maxDate:hasBars?scalar(db,"SELECT MAX(date) FROM bars_daily"):null,syncOk:hasSync?Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='OK'")||0):0,elapsedMs:Math.round(performance.now()-t0)};db.close();self.postMessage(out);return;}
 if(cmd==="quick"){const quick=String(scalar(db,"PRAGMA quick_check")??"");db.close();self.postMessage({ok:true,type:"result",quick,elapsedMs:Math.round(performance.now()-t0)});return;}
 throw new Error(`Unknown cmd: ${cmd}`);
 }catch(err){try{if(db)db.close()}catch(_){} self.postMessage({ok:false,type:"result",stage:"caught-exception",error:String(err?.stack||err)})}};
