const status=(stage,detail="")=>self.postMessage({type:"status",stage,detail});
function scalar(db,sql){let v=null;db.exec({sql,rowMode:"array",callback:r=>{if(v===null)v=r[0]}});return v}
async function initSqlite(){
 if(!crossOriginIsolated) throw new Error("crossOriginIsolated=false"); if(typeof SharedArrayBuffer==="undefined") throw new Error("SharedArrayBuffer unavailable");
 globalThis.sqlite3ApiConfig={disable:{vfs:{"kvvfs":true,"opfs":false,"opfs-sahpool":true,"opfs-wl":true}}};
 status("import-module","/sqlite/index.mjs patched for ?vfs=opfs"); const mod=await import("/sqlite/index.mjs");
 status("initialize-sqlite","classic opfs only"); return mod.default({locateFile:p=>new URL(`/sqlite/${p}`,self.location.origin).href,print:(...a)=>status("sqlite-print",a.join(" ")),printErr:(...a)=>status("sqlite-stderr",a.join(" "))});
}
self.onmessage=async e=>{const cmd=e.data?.cmd,fn=e.data?.dbName||"/jq_market_v7c.sqlite",t0=performance.now();let db;try{
 const sqlite3=await initSqlite(); const vfs={opfs:!!sqlite3.capi.sqlite3_vfs_find("opfs"),opfsWl:!!sqlite3.capi.sqlite3_vfs_find("opfs-wl")};
 if(cmd==="init"){self.postMessage({ok:true,type:"result",sqliteVersion:sqlite3.version.libVersion,vfs,opfsClass:!!sqlite3.oo1?.OpfsDb,elapsedMs:Math.round(performance.now()-t0)});return;}
 if(!vfs.opfs||!sqlite3.oo1?.OpfsDb) throw new Error(`classic opfs unavailable ${JSON.stringify(vfs)}`); status("open-db",fn); db=new sqlite3.oo1.OpfsDb(fn,"r");
 if(cmd==="open"){const hasBars=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)>0,hasSync=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_log'")||0)>0; const out={ok:true,type:"result",sqliteVersion:sqlite3.version.libVersion,vfsUsed:"opfs",filename:fn,tableCount:Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table'")||0),barsCount:hasBars?Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0):0,minDate:hasBars?scalar(db,"SELECT MIN(date) FROM bars_daily"):null,maxDate:hasBars?scalar(db,"SELECT MAX(date) FROM bars_daily"):null,syncOk:hasSync?Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='OK'")||0):0,elapsedMs:Math.round(performance.now()-t0)};db.close();self.postMessage(out);return;}
 if(cmd==="quick"){const quick=String(scalar(db,"PRAGMA quick_check")??"");db.close();self.postMessage({ok:true,type:"result",quick,elapsedMs:Math.round(performance.now()-t0)});return;}
 }catch(err){try{if(db)db.close()}catch(_){} self.postMessage({ok:false,type:"result",stage:"caught-exception",error:String(err?.stack||err)})}};
