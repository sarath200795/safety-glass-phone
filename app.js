'use strict';
// Class order from out_v4/README.md (ONNX output index order)
const NAMES=['defect_electrical','defect_equipment','defect_facility','defect_fire','defect_physical','defect_signage','ok'];
const PLAIN={ok:'OK',defect_electrical:'Electrical defect',defect_equipment:'Equipment defect',defect_facility:'Facility defect',defect_fire:'Fire safety defect',defect_physical:'Physical hazard',defect_signage:'Signage defect'};
const SHORT={ok:'OK',defect_electrical:'Electrical',defect_signage:'Signage',defect_physical:'Physical',defect_fire:'Fire',defect_equipment:'Equipment',defect_facility:'Facility'};
const PICK=['ok','defect_electrical','defect_signage','defect_physical','defect_fire','defect_equipment','defect_facility'];
const OK=6,SIZE=256,SMOOTH=5;
const $=id=>document.getElementById(id);
const cfg={get url(){return localStorage.sgUrl||''},get T(){return +(localStorage.sgT||0.6)},get every(){return +(localStorage.sgEvery||3)}};
let session,stream,running=false,busy=false,frameN=0,buf=[],cur={label:'ok',conf:0,probs:null},frozen=null,lastMs=0;
const pc=document.createElement('canvas');pc.width=pc.height=SIZE;const pctx=pc.getContext('2d',{willReadFrequently:true});

// Preprocess: resize short side to 256 + centre crop 256 == draw centred square crop of source into 256x256. RGB, /255, CHW.
function toTensor(src,w,h){const s=Math.min(w,h),sx=(w-s)/2,sy=(h-s)/2;pctx.imageSmoothingEnabled=true;pctx.imageSmoothingQuality='high';
 pctx.drawImage(src,sx,sy,s,s,0,0,SIZE,SIZE);const d=pctx.getImageData(0,0,SIZE,SIZE).data,n=SIZE*SIZE,f=new Float32Array(3*n);
 for(let i=0;i<n;i++){f[i]=d[4*i]/255;f[n+i]=d[4*i+1]/255;f[2*n+i]=d[4*i+2]/255}return new ort.Tensor('float32',f,[1,3,SIZE,SIZE])}
async function probs(src,w,h){const o=await session.run({[session.inputNames[0]]:toTensor(src,w,h)});return Array.from(o[session.outputNames[0]].data)}
function decide(p,T){if(p[OK]>=T)return{label:'ok',conf:p[OK]};let b=-1,bi=0;p.forEach((v,i)=>{if(i!==OK&&v>b){b=v;bi=i}});return{label:NAMES[bi],conf:b}}
window.SG={probs,decide,NAMES,load}; // used by tests

async function load(base=''){ort.env.wasm.wasmPaths=base||new URL('./',location.href).href;ort.env.wasm.numThreads=1;
 session=await ort.InferenceSession.create((base||'')+'model.onnx',{executionProviders:['wasm']});return session}

function show(){const st=$('stage');st.className=cur.label==='ok'?'ok':'bad';$('label').textContent=`${PLAIN[cur.label]}  ${Math.round(cur.conf*100)}%`}
async function loop(){if(!running)return;const v=$('video');
 if(!frozen&&!busy&&v.videoWidth&&frameN++%cfg.every===0){busy=true;const t=performance.now();
  try{const p=await probs(v,v.videoWidth,v.videoHeight);buf.push(p);if(buf.length>SMOOTH)buf.shift();
   const avg=p.map((_,i)=>buf.reduce((a,b)=>a+b[i],0)/buf.length);cur={...decide(avg,cfg.T),probs:avg};show();lastMs=performance.now()-t}catch(e){console.error(e)}busy=false}
 $('status').textContent=`${lastMs|0} ms/inference · queue ${qCount}`;requestAnimationFrame(loop)}

async function start(){try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
 const v=$('video');v.srcObject=stream;await v.play();running=true;$('startBtn').hidden=true;$('okBtn').disabled=$('fixBtn').disabled=false;loop()}
 catch(e){alert('Camera error: '+e.message+'\n(Needs HTTPS and camera permission.)')}}

function freeze(){const v=$('video'),c=$('frozen');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
 frozen={canvas:c,pred:cur.label,conf:cur.conf,probs:cur.probs,ts:new Date().toISOString()};c.hidden=false;v.hidden=true}
function unfreeze(){frozen=null;$('frozen').hidden=true;$('video').hidden=false;$('picker').hidden=true;$('note').value=''}
function openPicker(){freeze();const ch=$('choices');ch.innerHTML='';PICK.forEach(k=>{const b=document.createElement('button');b.textContent=SHORT[k];
 if(k===frozen.pred)b.className='guess';b.onclick=()=>record(k);ch.appendChild(b)});$('picker').hidden=false}
async function record(trueLabel){const f=frozen;const blob=await new Promise(r=>f.canvas.toBlob(r,'image/jpeg',0.92));
 const stamp=f.ts.replace(/[:.]/g,'-');const item={filename:`${stamp}_true-${trueLabel}_pred-${f.pred}.jpg`,label:trueLabel,
  meta:{true_label:trueLabel,predicted_label:f.pred,confidence:+f.conf.toFixed(4),probs:f.probs&&f.probs.map(x=>+x.toFixed(4)),class_order:NAMES,timestamp:f.ts,
  note:$('note').value||'',width:f.canvas.width,height:f.canvas.height,model:'v4 best.onnx',threshold:cfg.T,user_agent:navigator.userAgent},blob};
 await qAdd(item);unfreeze();toast(trueLabel===f.pred?'Saved as correct ✓':'Saved correction → '+SHORT[trueLabel]);flush()}
function toast(t){$('label').textContent=t}

// IndexedDB upload queue
let qCount=0;const DB=new Promise((res,rej)=>{const r=indexedDB.open('sg',1);r.onupgradeneeded=()=>r.result.createObjectStore('q',{keyPath:'id',autoIncrement:true});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function tx(mode,fn){const db=await DB;return new Promise((res,rej)=>{const t=db.transaction('q',mode),s=t.objectStore('q');const r=fn(s);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)})}
const qAdd=i=>tx('readwrite',s=>s.add(i)).then(updQ),qAll=()=>tx('readonly',s=>s.getAll()),qDel=id=>tx('readwrite',s=>s.delete(id));
async function updQ(){qCount=(await qAll()).length;$('qinfo').textContent=`${qCount} photo(s) waiting to upload`}
const b64=b=>new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(b)});
let flushing=false;async function flush(){if(flushing||!navigator.onLine||!cfg.url)return updQ();flushing=true;
 try{for(const it of await qAll()){const body=JSON.stringify({filename:it.filename,label:it.label,meta:it.meta,image:await b64(it.blob)});
  // text/plain avoids a CORS preflight, which Apps Script does not answer
  const r=await fetch(cfg.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body});const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));await qDel(it.id);await updQ()}}
 catch(e){console.warn('upload failed, will retry',e);$('qinfo').textContent+=' · last error: '+e.message}finally{flushing=false;updQ()}}
window.addEventListener('online',flush);setInterval(flush,60000);

function openSettings(){$('url').value=cfg.url;$('thr').value=cfg.T;$('every').value=cfg.every;updQ();$('settings').hidden=false}
function saveSettings(){localStorage.sgUrl=$('url').value.trim();localStorage.sgT=$('thr').value||0.6;localStorage.sgEvery=$('every').value||3;$('settings').hidden=true;flush()}

if(!window.SG_TEST){document.addEventListener('DOMContentLoaded',async()=>{
 $('startBtn').onclick=start;$('fixBtn').onclick=openPicker;$('okBtn').onclick=()=>{freeze();record(frozen.pred)};
 $('cancelBtn').onclick=unfreeze;$('setBtn').onclick=openSettings;$('saveSet').onclick=saveSettings;$('retryBtn').onclick=flush;
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
 try{await load();$('label').textContent='Ready — tap Start camera'}catch(e){$('label').textContent='Model load failed: '+e.message}
 updQ();flush();if(!cfg.url)$('status').textContent='Set the Apps Script URL in ⚙ to upload'})}
