const DBFILE="jq_poc3_datalake.sqlite";
const state={inspect:null,exported:false}; const $=id=>document.getElementById(id);
function box(id,cls,t){const e=$(id);e.className="result "+cls;e.textContent=t}
function fmt(n){const u=["B","KB","MB","GB"];let x=n,i=0;while(x>=1024&&i<u.length-1){x/=1024;i++}return `${x.toFixed(i>=2?2:1)} ${u[i]}`}
async function root(){if(!navigator.storage?.getDirectory)throw new Error("OPFS未対応");return navigator.storage.getDirectory()}
async function getFile(){const r=await root(),h=await r.getFileHandle(DBFILE);return h.getFile()}
async function inspect(){
 try{
  const f=await getFile(), head=new Uint8Array(await f.slice(0,16).arrayBuffer());
  const exp=[83,81,76,105,116,101,32,102,111,114,109,97,116,32,51,0];
  const ok=exp.every((v,i)=>head[i]===v);
  state.inspect={exists:true,size:f.size,headerOk:ok};
  box("inspectResult",ok?"pass":"warn",`DataLake: FOUND\nファイル: ${DBFILE}\n容量: ${fmt(f.size)} (${f.size.toLocaleString()} bytes)\n更新日時: ${new Date(f.lastModified).toLocaleString()}\nSQLite header: ${ok?"PASS":"不一致"}\n\n${ok?"OPFS上のSQLiteファイルは生存しています。":"ファイルはありますがSQLiteヘッダー不一致です。"}`);
 }catch(e){state.inspect={exists:false};box("inspectResult","fail","DataLakeが見つかりません。\n"+e)}
}
async function listFiles(){
 try{
  const r=await root(),a=[];
  for await(const [name,h] of r.entries()){let s=h.kind+": "+name;if(h.kind==="file"){try{s+=" / "+fmt((await h.getFile()).size)}catch(_){}}a.push(s)}
  a.sort();box("listResult",a.length?"pass":"warn",a.length?a.join("\n"):"OPFSルートは空です。");
 }catch(e){box("listResult","fail","一覧取得FAIL\n"+e)}
}
async function exportDb(){
 try{
  const f=await getFile(),u=URL.createObjectURL(f),a=document.createElement("a");
  a.href=u;a.download=`jq_market_rescue_${new Date().toISOString().replace(/[:.]/g,"-")}.sqlite`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),60000);state.exported=true;
  box("exportResult","pass",`退避処理を開始しました。\n容量: ${fmt(f.size)}\n\nFiles/ダウンロードに .sqlite が保存されたことを確認してください。`);
 }catch(e){box("exportResult","fail","退避FAIL\n"+e)}
}
function summary(){
 const i=state.inspect;
 if(i?.exists&&i?.headerOk)box("summaryResult","pass",`レスキュー判定: PASS\nDataLake生存: YES\nSQLite header: PASS\n退避操作: ${state.exported?"実行済み":"未実行"}\n\n次はこのDBを保全したまま、新しい保存エンジンへ移行できます。`);
 else if(i?.exists)box("summaryResult","warn","レスキュー判定: 要調査\nファイルは存在します。削除せず先に退避してください。");
 else box("summaryResult","fail","まずDataLake軽量チェックを実行してください。");
}
$("inspectBtn").onclick=inspect;$("listBtn").onclick=listFiles;$("exportBtn").onclick=exportDb;$("summaryBtn").onclick=summary;
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));