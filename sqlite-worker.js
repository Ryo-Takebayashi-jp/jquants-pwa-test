import sqlite3InitModule from "https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.53.0-build1/dist/index.mjs";

function scalar(db,sql){
 let v=null;
 db.exec({sql,rowMode:"array",callback:(row)=>{if(v===null)v=row[0]}});
 return v;
}
async function init(){
 const sqlite3=await sqlite3InitModule();
 if(!sqlite3.oo1?.OpfsDb)throw new Error("OpfsDbが利用できません");
 return sqlite3;
}
self.onmessage=async(e)=>{
 const t0=performance.now(),cmd=e.data?.cmd,dbName=e.data?.dbName||"/jq_market_v7c.sqlite";
 let db;
 try{
  const sqlite3=await init();
  const opfsAvailable=!!sqlite3.capi.sqlite3_vfs_find("opfs");
  if(!opfsAvailable)throw new Error("SQLite OPFS VFS unavailable");
  db=new sqlite3.oo1.OpfsDb(dbName,"r");
  if(cmd==="open"){
    const tableCount=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table'")||0);
    const hasBars=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bars_daily'")||0)>0;
    const hasSync=Number(scalar(db,"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_log'")||0)>0;
    const barsCount=hasBars?Number(scalar(db,"SELECT COUNT(*) FROM bars_daily")||0):0;
    const minDate=hasBars?scalar(db,"SELECT MIN(date) FROM bars_daily"):null;
    const maxDate=hasBars?scalar(db,"SELECT MAX(date) FROM bars_daily"):null;
    const syncOk=hasSync?Number(scalar(db,"SELECT COUNT(*) FROM sync_log WHERE dataset='bars_daily' AND status='OK'")||0):0;
    db.close();db=null;
    self.postMessage({ok:true,sqliteVersion:sqlite3.version.libVersion,opfsAvailable,filename:dbName,tableCount,barsCount,minDate,maxDate,syncOk,elapsedMs:Math.round(performance.now()-t0)});
  }else if(cmd==="quick"){
    const quick=String(scalar(db,"PRAGMA quick_check")??"");
    db.close();db=null;
    self.postMessage({ok:true,quick,elapsedMs:Math.round(performance.now()-t0)});
  }else throw new Error("unknown command");
 }catch(err){
  try{if(db)db.close()}catch(_){}
  self.postMessage({ok:false,error:String(err?.stack||err)});
 }
};