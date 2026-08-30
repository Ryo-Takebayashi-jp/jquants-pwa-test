const CACHE="jq-pwa-poc5-v1";
const ASSETS=["./","./index.html","./app.js","./manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.origin===location.origin){e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))}
});