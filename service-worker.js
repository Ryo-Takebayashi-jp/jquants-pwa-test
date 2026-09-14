const CACHE="jq-invest-v9.10";
const ASSETS=["./","./index.html","./app-v9.10.js","./sqlite-worker.js?v=v9.10","./manifest.webmanifest","./release_history.json","./CHANGELOG.md"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin===location.origin)e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)))});
