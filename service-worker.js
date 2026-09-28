const CACHE="jq-invest-v10.2.1-feedback-phase2e";
const ASSETS=["./","./index.html","./app-v10.2.1.js?v=feedback-phase2e","./sqlite-worker.js?v=feedback-phase2e","./manifest.webmanifest","./release_history.json","./CHANGELOG.md"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin===location.origin)e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)))});
