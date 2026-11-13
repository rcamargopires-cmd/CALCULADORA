/* Motyq IQ PWA: intentionally network-first and no persistent asset, API or
 * customer-data caches. Online authorization and live financial values remain
 * authoritative, including after installing the app. */
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 // Only the explicit AQUA buyer preview test notification uses this path.
 if(!String(event.notification.tag||'').startsWith('DEMO-'))return;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
  const found=clients.find(c=>new URL(c.url).pathname==='/aqua/lojista');
  return found?found.focus():self.clients.openWindow('/aqua/lojista');
 }));
});
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate'||event.request.method!=='GET')return;
  event.respondWith(fetch(event.request).catch(()=>new Response(
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motyq IQ offline</title><body style="font:16px system-ui;background:#f6f9fc;color:#1f2c42;padding:24px"><h1>Sem conexão</h1><p>O Motyq IQ precisa de internet para avaliações, FIPE e histórico atualizados.</p><button onclick="location.reload()" style="padding:12px 20px;background:#0089cd;color:white;border:0;border-radius:12px">Tentar novamente</button></body></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}
  )));
});
