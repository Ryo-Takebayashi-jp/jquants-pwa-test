const VERSION="3.53.0-build1";
const BASE=`https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@${VERSION}/dist/`;
const ALLOWED=new Set(["index.mjs","sqlite3.wasm"]);
export async function onRequest(context){
 const rp=context.params.path; const path=Array.isArray(rp)?rp.join("/"):String(rp||"");
 if(!ALLOWED.has(path)) return new Response("Not found",{status:404});
 const r=await fetch(new URL(path,BASE).toString(),{cf:{cacheEverything:false}}); if(!r.ok)return new Response(`upstream HTTP ${r.status}`,{status:502});
 const h=new Headers(r.headers);h.set("Cache-Control","no-store");h.set("Cross-Origin-Resource-Policy","same-origin");h.set("X-JQ-SQLite-Proxy",VERSION);
 if(path.endsWith(".mjs"))h.set("Content-Type","text/javascript; charset=utf-8");if(path.endsWith(".wasm"))h.set("Content-Type","application/wasm");
 return new Response(r.body,{status:r.status,headers:h});
}
