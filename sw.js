const C='sg-v11-det',F=['./','index.html','app.js','audit.js','app.css','manifest.json','ort.wasm.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','model.onnx','binary.onnx','gate.onnx','icon-192.png','icon-512.png','hazard.html','hazard_app.js','hazards.js','style.css','det.js','det_ghs_firstaid.onnx','analytics.html','analytics.js','chart.umd.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!e.request.url.startsWith(self.location.origin))return;
e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});
