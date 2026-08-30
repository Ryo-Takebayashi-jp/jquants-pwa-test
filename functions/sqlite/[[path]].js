const VERSION="3.53.0-build1";
const BASE=`https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@${VERSION}/dist/`;
const ALLOWED=new Set(["index.mjs","sqlite3.wasm","sqlite3-opfs-async-proxy.js"]);
export async function onRequest(context){
 const rp=context.params.path; const path=Array.isArray(rp)?rp.join("/"):String(rp||"");
 if(!ALLOWED.has(path)) return new Response("Not found",{status:404});
 const incoming=new URL(context.request.url), upstream=new URL(path,BASE); upstream.search=incoming.search;
 const r=await fetch(upstream.toString(),{cf:{cacheEverything:false}}); if(!r.ok) return new Response(`upstream HTTP ${r.status}`,{status:502});
 const h=new Headers(r.headers); h.set("Cache-Control","no-store"); h.set("Cross-Origin-Resource-Policy","same-origin"); h.set("X-JQ-SQLite-Proxy",VERSION);
 if(path==="index.mjs"){ let t=await r.text(),b=t; t=t.replaceAll("sqlite3-opfs-async-proxy.js","sqlite3-opfs-async-proxy.js?vfs=opfs"); h.set("Content-Type","text/javascript; charset=utf-8"); h.set("X-JQ-SQLite-Patch",t!==b?"classic-opfs-query-added":"pattern-not-found"); return new Response(t,{headers:h}); }
 if(path.endsWith(".js")) h.set("Content-Type","text/javascript; charset=utf-8"); if(path.endsWith(".wasm")) h.set("Content-Type","application/wasm"); h.set("X-JQ-SQLite-Patch","none"); return new Response(r.body,{status:r.status,headers:h});
}
