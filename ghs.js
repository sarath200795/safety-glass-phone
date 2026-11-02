'use strict';
// YOLO11n detector (det_ghs_firstaid.onnx, 640 input, output [1,4+18,8400])
const N=['ghs_explosive','ghs_flammable','ghs_oxidizing','ghs_gas_cylinder','ghs_corrosive','ghs_toxic','ghs_exclamation','ghs_health_hazard','ghs_environment','cotton_roll','cpr_shield','gauze_pads','band_aids','pain_relief_spray','antiseptic_cream','antiseptic_lotion','chemical_label','expiry_date_label'];
const S=640,$=i=>document.getElementById(i);let se,stream,face='environment',busy=false,last=[];
$('c').value=localStorage.sgDetC||0.4;$('cv').textContent=$('c').value;$('c').oninput=()=>{localStorage.sgDetC=$('c').value;$('cv').textContent=$('c').value};
ort.env.wasm.wasmPaths=new URL('./',location.href).href;ort.env.wasm.numThreads=1;
ort.InferenceSession.create('det_ghs_firstaid.onnx',{executionProviders:['wasm']}).then(s=>{se=s;$('lbl').textContent='Model ready – tap Start camera'}).catch(e=>$('lbl').textContent='Model load failed: '+e);
const pc=document.createElement('canvas');pc.width=pc.height=S;const px=pc.getContext('2d',{willReadFrequently:true});
async function start(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:face,width:{ideal:1280}},audio:false});$('v').srcObject=stream;await $('v').play();loop()}
$('go').onclick=()=>start().catch(e=>$('lbl').textContent='Camera error: '+e.message);$('sw').onclick=()=>{face=face==='environment'?'user':'environment';start()};
function iou(a,b){const x1=Math.max(a[0],b[0]),y1=Math.max(a[1],b[1]),x2=Math.min(a[2],b[2]),y2=Math.min(a[3],b[3]),i=Math.max(0,x2-x1)*Math.max(0,y2-y1);return i/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i)}
async function detect(){const v=$('v'),w=v.videoWidth,h=v.videoHeight,r=Math.min(S/w,S/h),dw=w*r,dh=h*r,ox=(S-dw)/2,oy=(S-dh)/2;
 px.fillStyle='#727272';px.fillRect(0,0,S,S);px.drawImage(v,ox,oy,dw,dh);const d=px.getImageData(0,0,S,S).data,n=S*S,f=new Float32Array(3*n);
 for(let i=0;i<n;i++){f[i]=d[4*i]/255;f[n+i]=d[4*i+1]/255;f[2*n+i]=d[4*i+2]/255}
 const t0=performance.now(),o=await se.run({[se.inputNames[0]]:new ort.Tensor('float32',f,[1,3,S,S])}),out=o[se.outputNames[0]],a=out.data,M=out.dims[2],T=+$('c').value;let bx=[];
 for(let j=0;j<M;j++){let b=-1,bs=0;for(let k=0;k<N.length;k++){const s=a[(4+k)*M+j];if(s>bs){bs=s;b=k}}if(bs<T)continue;
  const cx=a[j],cy=a[M+j],bw=a[2*M+j],bh=a[3*M+j];bx.push({k:b,s:bs,b:[(cx-bw/2-ox)/r,(cy-bh/2-oy)/r,(cx+bw/2-ox)/r,(cy+bh/2-oy)/r]})}
 bx.sort((p,q)=>q.s-p.s);const keep=[];for(const x of bx)if(!keep.some(y=>y.k===x.k&&iou(x.b,y.b)>0.45))keep.push(x);return{keep:keep.slice(0,30),ms:performance.now()-t0,w,h}}
function draw(r){const c=$('ov'),v=$('v');c.width=c.clientWidth;c.height=c.clientHeight;const g=c.getContext('2d'),sc=Math.min(c.width/r.w,c.height/r.h),ox=(c.width-r.w*sc)/2,oy=(c.height-r.h*sc)/2;
 g.lineWidth=3;g.font='bold 15px system-ui';for(const x of r.keep){const col=x.k<9||x.k===16?'#ff5252':'#00e676';g.strokeStyle=col;const[a,b,c2,d]=x.b.map((u,i)=>u*sc+(i%2?oy:ox));g.strokeRect(a,b,c2-a,d-b);
 const t=N[x.k].replace(/_/g,' ')+' '+(x.s*100|0)+'%';g.fillStyle=col;g.fillRect(a,b-20,g.measureText(t).width+8,20);g.fillStyle='#000';g.fillText(t,a+4,b-5)}
 $('lbl').textContent=r.keep.length?r.keep.length+' found: '+[...new Set(r.keep.map(x=>N[x.k].replace(/_/g,' ')))].join(', '):'Nothing detected – point at GHS labels / first-aid kit';$('lbl').title=(r.ms|0)+' ms'}
async function loop(){if(!stream)return;if(se&&!busy&&$('v').videoWidth){busy=true;try{draw(await detect())}catch(e){$('lbl').textContent='Error: '+e}busy=false}setTimeout(loop,60)}
window.__ghs={detect};
