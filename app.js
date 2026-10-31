'use strict';
// Class order from out_v4/README.md (ONNX output index order)
const NAMES=['defect_electrical','defect_equipment','defect_facility','defect_fire','defect_physical','defect_signage','ok'];
const PLAIN={ok:'OK',defect_electrical:'Electrical defect',defect_equipment:'Equipment defect',defect_facility:'Facility defect',defect_fire:'Fire safety defect',defect_physical:'Physical hazard',defect_signage:'Signage defect'};
const SHORT={ok:'OK',defect_electrical:'Electrical',defect_signage:'Signage',defect_physical:'Physical',defect_fire:'Fire',defect_equipment:'Equipment',defect_facility:'Facility'};
const PICK=['ok','defect_electrical','defect_signage','defect_physical','defect_fire','defect_equipment','defect_facility'];
const OK=6,SIZE=256,SIZE1=224,SIZEG=128,SMOOTH=5,STABLE=4;
// Relevance gate (gate.onnx: [background, equipment]) + frame-quality limits, tuned on held-out data
const GATE_EQ=1,DARK=0.10,BLUR=0.0001;
const CATS=['defect_electrical','defect_signage','defect_physical','defect_fire','defect_equipment','defect_facility'];
const $=id=>document.getElementById(id);
const cfg={get url(){return localStorage.sgUrl||''},get T(){return +(localStorage.sgTd||0.5)},get every(){return +(localStorage.sgEvery||3)},get G(){return +(localStorage.sgG||0.5)}};
let session,session1,sessionG,shown='none',cand='none',candN=0,stream,running=false,busy=false,frameN=0,buf=[],cur={label:'ok',conf:0,probs:null},frozen=null,lastMs=0;
const pc=document.createElement('canvas');const pctx=pc.getContext('2d',{willReadFrequently:true});

// Preprocess: resize short side to 256 + centre crop 256 == draw centred square crop of source into 256x256. RGB, /255, CHW.
function toTensor(src,w,h,SIZE){pc.width=pc.height=SIZE;const s=Math.min(w,h),sx=(w-s)/2,sy=(h-s)/2;pctx.imageSmoothingEnabled=true;pctx.imageSmoothingQuality='high';
 pctx.drawImage(src,sx,sy,s,s,0,0,SIZE,SIZE);const d=pctx.getImageData(0,0,SIZE,SIZE).data,n=SIZE*SIZE,f=new Float32Array(3*n);
 for(let i=0;i<n;i++){f[i]=d[4*i]/255;f[n+i]=d[4*i+1]/255;f[2*n+i]=d[4*i+2]/255}return new ort.Tensor('float32',f,[1,3,SIZE,SIZE])}
// Frame quality on a 64x64 grey thumbnail: mean luma and Laplacian variance (sharpness)
const qc=document.createElement('canvas');qc.width=qc.height=64;const qctx=qc.getContext('2d',{willReadFrequently:true});
function quality(src,w,h){const s=Math.min(w,h);qctx.drawImage(src,(w-s)/2,(h-s)/2,s,s,0,0,64,64);const d=qctx.getImageData(0,0,64,64).data,g=new Float32Array(4096);let m=0;
 for(let i=0;i<4096;i++){g[i]=(0.299*d[4*i]+0.587*d[4*i+1]+0.114*d[4*i+2])/255;m+=g[i]}m/=4096;let a=0,a2=0,n=0;
 for(let y=1;y<63;y++)for(let x=1;x<63;x++){const i=y*64+x,l=4*g[i]-g[i-1]-g[i+1]-g[i-64]-g[i+64];a+=l;a2+=l*l;n++}return{luma:m,sharp:a2/n-(a/n)**2}}
async function run(se,t){const o=await se.run({[se.inputNames[0]]:t});return Array.from(o[se.outputNames[0]].data)}
// Returns [v4 7 probs..., v1 p(defect), gate p(equipment), luma, sharpness] (11 numbers) so smoothing averages everything.
async function probs(src,w,h){const pg=await run(sessionG,toTensor(src,w,h,SIZEG));const q=quality(src,w,h);const p4=await run(session,toTensor(src,w,h,SIZE));const p1=await run(session1,toTensor(src,w,h,SIZE1));return [...p4,p1[0],pg[GATE_EQ],q.luma,q.sharp]}
// Two-stage: defect score = mean of v1 p(defect) and v4 (1-p(ok)); defect if >= T. Category = top non-ok v4 class (shown even when OK).
function decide(p,T){const p1=p[7],pd=(p1+1-p[OK])/2;let b=-1,bi=0;for(let i=0;i<7;i++)if(i!==OK&&p[i]>b){b=p[i];bi=i}
 const cs=1-p[OK]>0?b/(1-p[OK]):0;return{defect:pd>=T,pDefect:pd,pV1:p1,pOk4:p[OK],category:NAMES[bi],catConf:cs,label:pd>=T?NAMES[bi]:'ok',conf:pd>=T?pd:1-pd,pEq:p[8],luma:p[9],sharp:p[10]}}
// Per-frame state: 'dark' | 'blur' | 'none' (no equipment) | 'defect' | 'ok'
function frameState(d,G){if(d.luma<DARK)return'dark';if(d.sharp<BLUR)return'blur';if(d.pEq<G)return'none';return d.defect?'defect':'ok'}
window.SG={probs,decide,frameState,quality,NAMES,load}; // used by tests

async function load(base=''){ort.env.wasm.wasmPaths=base||new URL('./',location.href).href;ort.env.wasm.numThreads=1;
 session=await ort.InferenceSession.create((base||'')+'model.onnx',{executionProviders:['wasm']});session1=await ort.InferenceSession.create((base||'')+'binary.onnx',{executionProviders:['wasm']});sessionG=await ort.InferenceSession.create((base||'')+'gate.onnx',{executionProviders:['wasm']});return session}

const pct=x=>Math.round(x*100)+'%';
const NEUTRAL={none:'Point at equipment',dark:'Too dark — add light',blur:'Hold steady — image blurry'};
function show(){const st=$('stage');if(!(shown==='defect'||shown==='ok')){st.className='idle';$('okBtn').disabled=$('fixBtn').disabled=true;
  $('label').innerHTML=`<b>${NEUTRAL[shown]||'Point at equipment'}</b><small>No equipment detected · equipment ${pct(cur.pEq||0)}</small>`;return}
 $('okBtn').disabled=$('fixBtn').disabled=false;st.className=shown==='defect'?'bad':'ok';
 $('label').innerHTML=`<b>${shown==='defect'?'DEFECT':'NO DEFECT'}</b> · ${SHORT[cur.category]}<small>defect ${pct(cur.pDefect)} · no-defect ${pct(1-cur.pDefect)} · category ${pct(cur.catConf)} · equipment ${pct(cur.pEq)}</small>`}
async function loop(){if(!running)return;const v=$('video');
 if(!frozen&&!busy&&v.videoWidth&&frameN++%cfg.every===0){busy=true;const t=performance.now();
  try{const p=await probs(v,v.videoWidth,v.videoHeight);buf.push(p);if(buf.length>SMOOTH)buf.shift();
   const avg=p.map((_,i)=>buf.reduce((a,b)=>a+b[i],0)/buf.length);cur={...decide(avg,cfg.T),probs:avg};const fs=frameState(cur,cfg.G);
   // hysteresis: only switch the displayed state after STABLE consecutive agreeing inferences
   if(fs===cand)candN++;else{cand=fs;candN=1}if(cand!==shown&&candN>=STABLE)shown=cand;cur.defect=shown==='defect';show();lastMs=performance.now()-t}catch(e){console.error(e)}busy=false}
 $('status').textContent=`${lastMs|0} ms/inference · queue ${qCount}`;requestAnimationFrame(loop)}

async function start(){try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
 const v=$('video');v.srcObject=stream;await v.play();running=true;$('startBtn').hidden=true;shown=cand='none';candN=0;buf=[];show();loop()}
 catch(e){alert('Camera error: '+e.message+'\n(Needs HTTPS and camera permission.)')}}

function freeze(){const v=$('video'),c=$('frozen');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
 frozen={canvas:c,pred:cur.label,d:{...cur},conf:cur.conf,probs:cur.probs,ts:new Date().toISOString()};c.hidden=false;v.hidden=true}
function unfreeze(){frozen=null;$('frozen').hidden=true;$('video').hidden=false;$('picker').hidden=true;$('note').value=''}
let pickDef=true,pickCat='defect_electrical';
function renderPicker(){const ch=$('choices');ch.innerHTML='';
 const row=document.createElement('div');row.className='yn';[[true,'DEFECT'],[false,'NO DEFECT']].forEach(([v,t])=>{const b=document.createElement('button');b.textContent=t;
  b.className=(pickDef===v?'sel ':'')+(v?'red':'green');b.onclick=()=>{pickDef=v;renderPicker()};row.appendChild(b)});ch.appendChild(row);
 const h=document.createElement('p');h.textContent='Category:';ch.appendChild(h);
 CATS.forEach(k=>{const b=document.createElement('button');b.textContent=SHORT[k];if(k===pickCat)b.className='sel';b.onclick=()=>{pickCat=k;renderPicker()};ch.appendChild(b)});
 const sv=document.createElement('button');sv.className='big green';sv.textContent='Save';sv.onclick=()=>record(pickDef,pickCat);ch.appendChild(sv)}
function openPicker(){freeze();pickDef=frozen.d.defect;pickCat=frozen.d.category;renderPicker();$('picker').hidden=false}
async function record(isDef,cat){const f=frozen,d=f.d;const blob=await new Promise(r=>f.canvas.toBlob(r,'image/jpeg',0.92));
 const trueLabel=isDef?cat:'ok',tag=(x,c)=>(x?'defect':'nodefect')+'-'+SHORT[c].toLowerCase();
 const stamp=f.ts.replace(/[:.]/g,'-');const item={filename:`${stamp}_true-${tag(isDef,cat)}_pred-${tag(d.defect,d.category)}.jpg`,label:trueLabel,
  meta:{true_defect:isDef,true_category:cat,true_label:trueLabel,predicted_defect:d.defect,predicted_category:d.category,predicted_label:f.pred,
  p_defect:+d.pDefect.toFixed(4),p_defect_v1:+d.pV1.toFixed(4),p_ok_v4:+d.pOk4.toFixed(4),category_conf:+d.catConf.toFixed(4),
  probs:f.probs&&f.probs.slice(0,7).map(x=>+x.toFixed(4)),class_order:NAMES,timestamp:f.ts,
  note:$('note').value||'',width:f.canvas.width,height:f.canvas.height,model:'two-stage: v5 binary.onnx + v4 model.onnx (mean defect score), gate.onnx relevance gate',p_equipment:+(d.pEq||0).toFixed(4),defect_threshold:cfg.T,user_agent:navigator.userAgent},blob};
 await qAdd(item);unfreeze();toast((isDef===d.defect&&cat===d.category)?'Saved as correct ✓':'Saved correction → '+(isDef?'DEFECT':'NO DEFECT')+' · '+SHORT[cat]);flush()}
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

function openSettings(){$('url').value=cfg.url;$('thr').value=cfg.T;$('thrv').textContent=cfg.T;$('every').value=cfg.every;$('gthr').value=cfg.G;$('gthrv').textContent=cfg.G;updQ();$('settings').hidden=false}
function saveSettings(){localStorage.sgUrl=$('url').value.trim();localStorage.sgTd=$('thr').value||0.5;localStorage.sgEvery=$('every').value||3;localStorage.sgG=$('gthr').value||0.5;$('settings').hidden=true;flush()}

if(!window.SG_TEST){document.addEventListener('DOMContentLoaded',async()=>{
 $('startBtn').onclick=start;$('fixBtn').onclick=openPicker;$('okBtn').onclick=()=>{if(!(shown==='defect'||shown==='ok'))return;freeze();record(frozen.d.defect,frozen.d.category)};
 $('cancelBtn').onclick=unfreeze;$('setBtn').onclick=openSettings;$('saveSet').onclick=saveSettings;$('retryBtn').onclick=flush;$('thr').oninput=()=>$('thrv').textContent=$('thr').value;$('gthr').oninput=()=>$('gthrv').textContent=$('gthr').value;
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
 try{await load();$('label').textContent='Ready — tap Start camera'}catch(e){$('label').textContent='Model load failed: '+e.message}
 updQ();flush();if(!cfg.url)$('status').textContent='Set the Apps Script URL in ⚙ to upload'})}
