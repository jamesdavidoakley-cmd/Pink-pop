/* Shelf Pals service worker: cache-first so the game runs with no connection once visited. */
const CACHE='snackpals-v1';
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png']).catch(()=>{}))); });
self.addEventListener('activate',e=>{ e.waitUntil((async()=>{ const keys=await caches.keys(); await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))); await self.clients.claim(); })()); });
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(e.request,{ignoreSearch:true});
    if(hit) return hit;
    try{ const res=await fetch(e.request); if(res && res.ok && new URL(e.request.url).origin===self.location.origin) cache.put(e.request,res.clone()); return res; }
    catch(err){ if(e.request.mode==='navigate'){ const home=await cache.match('./index.html')||await cache.match('./'); if(home) return home; } throw err; }
  })());
});
