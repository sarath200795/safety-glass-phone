'use strict';
// GHS / first-aid detector (det_ghs_firstaid.onnx, YOLO11n 640, output [1,4+18,8400]) running in its own slow async slot beside the defect check.
(()=>{const N=['ghs_explosive','ghs_flammable','ghs_oxidizing','ghs_gas_cylinder','ghs_corrosive','ghs_toxic','ghs_exclamation','ghs_health_hazard','ghs_environment','cotton_roll','cpr_shield','gauze_pads','band_aids','pain_relief_spray','antiseptic_cream','antiseptic_lotion','chemical_label','expiry_date_label'];
const grp=k=>k<9?'GHS':k<16?'First aid':'Label',nice=k=>N[k].replace(/^ghs_/,'').replace(/_/g,' '),COL={GHS:'#ff9100','First aid':'#00e5ff',Label:'#e040fb'};
const S=640,D=document.getElementById.bind(document),on=()=>localStorage.sgDetOn!=='0',T=()=>+(localStorage.sgDetC||0.4),PERIOD=330;
const KIT=N.slice(9,16),KWIN=20000;let kit={},kitManual=false;
let se=null,last={dets:[],ts:0,w:0,h:0},ms=0,stat=[];
const pc=document.createElement('canvas');pc.width=pc.height=S;const px=pc.getContext('2d',{willReadFrequently:true});
function iou(a,b){const x1=Math.max(a[0],b[0]),y1=Math.max(a[1],b[1]),x2=Math.min(a[2],b[2]),y2=Math.min(a[3],b[3]),i=Math.max(0,x2-x1)*Math.max(0,y2-y1);return i/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i)}
async function detect(src,w,h){const r=Math.min(S/w,S/h),dw=w*r,dh=h*r,ox=(S-dw)/2,oy=(S-dh)/2;px.fillStyle='#727272';px.fillRect(0,0,S,S);px.drawImage(src,ox,oy,dw,dh);
 const d=px.getImageData(0,0,S,S).data,n=S*S,f=new Float32Array(3*n);for(let i=0;i<n;i++){f[i]=d[4*i]/255;f[n+i]=d[4*i+1]/255;f[2*n+i]=d[4*i+2]/255}
 const o=await se.run({[se.inputNames[0]]:new ort.Tensor('float32',f,[1,3,S,S])}),out=o[se.outputNames[0]],a=out.data,M=out.dims[2],t=T(),bx=[];
 for(let j=0;j<M;j++){let b=-1,bs=0;for(let k=0;k<N.length;k++){const s=a[(4+k)*M+j];if(s>bs){bs=s;b=k}}if(bs<t)continue;const cx=a[j],cy=a[M+j],bw=a[2*M+j],bh=a[3*M+j];
  bx.push({k:b,cls:N[b],group:grp(b),conf:bs,box:[(cx-bw/2-ox)/r,(cy-bh/2-oy)/r,(cx+bw/2-ox)/r,(cy+bh/2-oy)/r]})}
 bx.sort((p,q)=>q.conf-p.conf);const keep=[];for(const x of bx)if(!keep.some(y=>y.k===x.k&&iou(x.box,y.box)>0.45))keep.push(x);return keep.slice(0,20)}
function draw(){const c=D('detOv'),v=D('video');if(!c)return;const W=c.clientWidth,H=c.clientHeight;if(c.width!==W||c.height!==H){c.width=W;c.height=H}const g=c.getContext('2d');g.clearRect(0,0,W,H);
 if(!on()||!last.w||Date.now()-last.ts>2000||v.hidden)return;const sc=Math.max(W/last.w,H/last.h),ox=(W-last.w*sc)/2,oy=(H-last.h*sc)/2;g.lineWidth=3;g.font='bold 14px system-ui';
 for(const x of last.dets){const col=COL[x.group],[a,b,c2,d]=x.box.map((u,i)=>u*sc+(i%2?oy:ox));g.strokeStyle=col;g.strokeRect(a,b,c2-a,d-b);const t=`${x.group==='Label'?'':x.group+': '}${nice(x.k)} ${Math.round(x.conf*100)}%`;
  g.fillStyle=col;const ty=Math.max(b,18);g.fillRect(a,ty-18,g.measureText(t).width+8,18);g.fillStyle='#000';g.fillText(t,a+4,ty-4)}}
async function tick(){const v=D('video');if(se&&on()&&v&&v.videoWidth&&!v.hidden&&!v.paused){const t0=performance.now();try{last={dets:await detect(v,v.videoWidth,v.videoHeight),ts:Date.now(),w:v.videoWidth,h:v.videoHeight}}catch(e){console.warn('det',e)}
  last.dets.forEach(x=>{if(x.group==='First aid')kit[x.cls]=Date.now()});renderKit();ms=performance.now()-t0;stat.push(ms);if(stat.length>50)stat.shift()}draw();setTimeout(tick,Math.max(60,PERIOD-ms))}
function kitState(){const now=Date.now(),found=KIT.filter(k=>kit[k]&&now-kit[k]<KWIN),active=kitManual||found.length>0;return{active,found,missing:KIT.filter(k=>!found.includes(k)),manual:kitManual}}
function renderKit(){const el=D('kit');if(!el)return;const k=kitState();el.hidden=!k.active||!on();if(el.hidden)return;
 el.innerHTML=`<b>First-aid kit check</b> <small>${k.found.length}/7</small><div>`+KIT.map(c=>`<span class="${k.found.includes(c)?'g':'r'}">${k.found.includes(c)?'✓':'✗'} ${c.replace(/_/g,' ')}</span>`).join('')+`</div><div class="${k.missing.length?'r':'g'}"><b>${k.missing.length?'DEFECT – Missing: '+k.missing.map(c=>c.replace(/_/g,' ')).join(', '):'NO DEFECT – all 7 items found'}</b></div><button id="kitReset">↺ Reset kit check</button><button id="kitEnd">✕ Close</button>`;
 D('kitReset').onclick=()=>{kit={};renderKit()};D('kitEnd').onclick=()=>{kit={};kitManual=false;renderKit()}}
function summary(dets){const g={};(dets||[]).forEach(x=>{(g[x.group]=g[x.group]||new Set()).add(x.cls.replace(/^ghs_/,'').replace(/_/g,' '))});return Object.entries(g).map(([k,s])=>`${k}: ${[...s].join(', ')}`).join(' / ')}
async function init(){try{se=await ort.InferenceSession.create('det_ghs_firstaid.onnx',{executionProviders:['wasm']})}catch(e){console.warn('GHS detector not loaded',e);return}tick()}
window.SG_DET={KIT,kitState,startKit(){kitManual=true;renderKit()},resetKit(){kit={};renderKit()},get current(){return Date.now()-last.ts<2000&&on()?last.dets.map(x=>({cls:x.cls,group:x.group,conf:+x.conf.toFixed(3)})):[]},summary,get ms(){return ms},get stats(){return stat.slice()},detect};
setInterval(()=>{draw();renderKit()},500);
// settings UI
document.addEventListener('DOMContentLoaded',()=>{const sb=D('setBtn');D('detChk').checked=on();D('detC').value=T();D('detCv').textContent=T();
 D('detC').oninput=()=>{D('detCv').textContent=D('detC').value;localStorage.sgDetC=D('detC').value};D('detChk').onchange=()=>{localStorage.sgDetOn=D('detChk').checked?'1':'0';draw()};
 // wait for the defect models (app.js load sets wasm paths), then start
 const w=setInterval(()=>{if(ort.env.wasm.wasmPaths){clearInterval(w);init()}},300)});
})();
