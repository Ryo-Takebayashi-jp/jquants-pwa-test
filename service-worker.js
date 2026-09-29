const CACHE="jq-invest-v10.2.1-split-phase2i";
const ASSETS=["./","./index.html","./app-v10.2.1.js?v=split-phase2i","./sqlite-worker.js?v=split-phase2i","./manifest.webmanifest","./release_history.json","./CHANGELOG.md"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin===location.origin)e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)))});
