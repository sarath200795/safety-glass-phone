'use strict';
// Audit sessions: site start screen, user-commanded observations, live dashboard, summary/report, IndexedDB persistence.
const ACATS=['defect_electrical','defect_equipment','defect_facility','defect_fire','defect_physical','defect_signage','other'];
const ANAME={defect_electrical:'Electrical',defect_equipment:'Equipment',defect_facility:'Facility',defect_fire:'Fire safety',defect_physical:'Physical hazard',defect_signage:'Signage',other:'Other'};
const ADB=new Promise((res,rej)=>{const r=indexedDB.open('sgAudit',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('sessions',{keyPath:'id'});d.createObjectStore('obs',{keyPath:'id',autoIncrement:true}).createIndex('sid','sid')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function atx(st,mode,fn){const db=await ADB;return new Promise((res,rej)=>{const t=db.transaction(st,mode);const r=fn(t.objectStore(st));t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)})}
const A={
 putS:s=>atx('sessions','readwrite',x=>x.put(s)),allS:()=>atx('sessions','readonly',x=>x.getAll()),getS:id=>atx('sessions','readonly',x=>x.get(id)),
 addO:o=>atx('obs','readwrite',x=>x.add(o)),obsOf:sid=>atx('obs','readonly',x=>x.index('sid').getAll(sid)),
 delS:async id=>{await atx('sessions','readwrite',x=>x.delete(id));const os=await A.obsOf(id);for(const o of os)await atx('obs','readwrite',x=>x.delete(o.id))}};
let aS=null,aObs=[],aPend=null,aSum=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtT=iso=>new Date(iso).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
const dur=(a,b)=>{const m=Math.round((new Date(b)-new Date(a))/60000);return m<60?m+' min':Math.floor(m/60)+' h '+(m%60)+' min'};
const p1=(n,d)=>d?Math.round(n*1000/d)/10:0;
function stats(obs){const t={total:obs.length,def:0,ok:0,cat:{}};ACATS.forEach(c=>t.cat[c]={def:0,ok:0});
 obs.forEach(o=>{const c=t.cat[o.category]||(t.cat[o.category]={def:0,ok:0});if(o.verdict==='defect'){t.def++;c.def++}else{t.ok++;c.ok++}});
 t.pDef=p1(t.def,t.total);t.score=t.total?p1(t.ok,t.total):0;return t}
function catTable(t,bars){return `<table class="ct"><tr><th>Category</th><th>Def</th><th>OK</th><th>% Def</th></tr>`+ACATS.filter(c=>t.cat[c].def+t.cat[c].ok).map(c=>{const x=t.cat[c],n=x.def+x.ok,p=p1(x.def,n);
 return `<tr><td>${ANAME[c]}${bars?`<div class="cb"><i style="width:${p}%"></i></div>`:''}</td><td>${x.def}</td><td>${x.ok}</td><td>${p}%</td></tr>`}).join('')+(t.total?'':'<tr><td colspan=4>No observations yet</td></tr>')+'</table>'}
function renderDash(){if(!aS)return;const t=stats(aObs),d=$('dash'),min=localStorage.sgHudMin==='1';d.hidden=false;d.classList.toggle('min',min);d.classList.add('open');
 const col=!t.total?'n':t.pDef<=10?'g':t.pDef<=30?'y':'r',cs=t.total?(t.score>=90?'g':t.score>=70?'y':'r'):'n';
 if(min){$('dashHead').innerHTML=`📊 ${t.total} obs · <b class="${col}">${t.pDef}% def</b> ▸`;$('dashBody').innerHTML='';return}
 $('dashHead').innerHTML=`<b>${esc(aS.site)}</b> <span class="hmin">— minimise</span>`;
 const cats=ACATS.filter(c=>t.cat[c].def+t.cat[c].ok),mx=Math.max(1,...cats.map(c=>t.cat[c].def+t.cat[c].ok));
 $('dashBody').innerHTML=`<div class="hud"><div class="hbig ${col}"><b>${t.pDef}%</b>defects</div><div class="hk"><span><b>${t.total}</b> obs</span><span class="r"><b>${t.def}</b> defect</span><span class="g"><b>${t.ok}</b> no-defect</span><span class="${cs}"><b>${t.total?t.score+'%':'–'}</b> compliance</span></div></div>`+
 (cats.length?'<div class="hbars">'+cats.map(c=>{const x=t.cat[c];return `<div class="hb"><span>${ANAME[c]}</span><i><em class="d" style="width:${x.def/mx*100}%"></em><em class="o" style="width:${x.ok/mx*100}%"></em></i><small>${x.def}/${x.def+x.ok}</small></div>`}).join('')+'</div>':'<small>No observations yet – tap Record DEFECT / NO DEFECT</small>')}
function setMode(){const on=!!aS,tr=localStorage.sgTrain==='1';['recDef','recOk','endBtn'].forEach(i=>$(i).hidden=!on);$('okBtn').hidden=$('fixBtn').hidden=on&&!tr;$('dash').hidden=!on;$('trainChk').checked=tr;if(on)renderDash()}
// ---- start screen
const recentSites=()=>JSON.parse(localStorage.sgSites||'[]');
async function openStart(){$('aSite').value='';$('aAud').value=localStorage.sgAuditor||'';$('aNow').textContent=fmtT(new Date().toISOString());
 $('siteList').innerHTML=recentSites().map(s=>`<button class="chip">${esc(s)}</button>`).join('');$('siteList').querySelectorAll('button').forEach(b=>b.onclick=()=>$('aSite').value=b.textContent);
 const ss=(await A.allS()).sort((a,b)=>b.start.localeCompare(a.start));
 $('past').innerHTML=ss.length?ss.map(s=>`<div class="ps"><div><b>${esc(s.site)}</b><br><small>${fmtT(s.start)} · ${s.end?'ended':'<span class="r">unfinished</span>'}</small></div><button data-id="${s.id}" data-a="${s.end?'view':'resume'}">${s.end?'View':'Resume'}</button><button data-id="${s.id}" data-a="del" class="sm">🗑</button></div>`).join(''):'<small>No past sessions</small>';
 $('past').querySelectorAll('button').forEach(b=>b.onclick=async()=>{const id=b.dataset.id,a=b.dataset.a;if(a==='del'){if(confirm('Delete this session?')){await A.delS(id);openStart()}}else if(a==='resume')resumeSession(id);else showSummary(id)});
 $('startSheet').hidden=false}
async function beginSession(){const site=$('aSite').value.trim();if(!site){$('aSite').focus();$('aSite').placeholder='Site name is required';$('aSite').classList.add('err');return}
 const aud=$('aAud').value.trim();localStorage.sgAuditor=aud;localStorage.sgSites=JSON.stringify([site,...recentSites().filter(s=>s.toLowerCase()!==site.toLowerCase())].slice(0,8));
 aS={id:'S'+Date.now(),site,auditor:aud,start:new Date().toISOString(),end:null};await A.putS(aS);aObs=[];$('startSheet').hidden=true;setMode();if(!running&&!window.SG_TEST)start()}
async function resumeSession(id){aS=await A.getS(id);aObs=await A.obsOf(id);$('startSheet').hidden=true;$('summary').hidden=true;setMode();if(!running&&!window.SG_TEST)start()}
// ---- record observation
function thumb(){const v=$('video'),c=document.createElement('canvas');let w=v.videoWidth||640,h=v.videoHeight||480;const k=Math.min(1,640/Math.max(w,h));c.width=Math.round(w*k);c.height=Math.round(h*k);
 const g=c.getContext('2d');if(v.videoWidth)g.drawImage(v,0,0,c.width,c.height);else{g.fillStyle='#456';g.fillRect(0,0,c.width,c.height);g.fillStyle='#fff';g.font='40px sans-serif';g.fillText('no camera',20,60)}return c.toDataURL('image/jpeg',0.7)}
function openRec(verdict){const live=shown==='defect'||shown==='ok';const d=cur||{};aPend={verdict,ts:new Date().toISOString(),thumb:thumb(),
  model:live?{state:shown,verdict:d.defect?'defect':'no_defect',category:d.category,p_defect:+(+d.pDefect||0).toFixed(4),p_v1:+(+d.pV1||0).toFixed(4),p_ok_v4:+(+d.pOk4||0).toFixed(4),category_conf:+(+d.catConf||0).toFixed(4),p_equipment:+(+d.pEq||0).toFixed(4)}:{state:shown}};
 $('recTitle').textContent=verdict==='defect'?'Record DEFECT':'Record NO DEFECT';$('recTitle').className=verdict==='defect'?'r':'g';$('recImg').src=aPend.thumb;
 $('recCat').innerHTML=ACATS.map(c=>`<option value="${c}">${ANAME[c]}${live&&c===d.category?' (model)':''}</option>`).join('');$('recCat').value=live&&d.category?d.category:'other';
 $('recModel').textContent=live?`Model: ${shown==='defect'?'DEFECT':'NO DEFECT'} · ${ANAME[d.category]} · defect ${Math.round(d.pDefect*100)}%`:'Model: no stable verdict (point at equipment)';
 $('recNote').value='';$('recSheet').hidden=false}
async function saveRec(){const o={sid:aS.id,site:aS.site,...aPend,category:$('recCat').value,note:$('recNote').value.trim()};o.id=await A.addO(o);aObs.push(o);aPend=null;$('recSheet').hidden=true;renderDash();toast(`Recorded ${o.verdict==='defect'?'DEFECT':'NO DEFECT'} · ${ANAME[o.category]} (#${aObs.length})`)}
// ---- end + summary
async function endSession(){if(!confirm(`End audit at ${aS.site}? (${aObs.length} observations)`))return;aS.end=new Date().toISOString();await A.putS(aS);const id=aS.id;aS=null;aObs=[];setMode();showSummary(id)}
async function showSummary(id){const s=await A.getS(id),obs=await A.obsOf(id),t=stats(obs);aSum={s,obs,t};const end=s.end||new Date().toISOString();
 $('sumBody').innerHTML=`<h2>${esc(s.site)}</h2><p>${fmtT(s.start)} · duration ${dur(s.start,end)}${s.auditor?' · auditor '+esc(s.auditor):''}</p>
 <div class="score ${t.score>=90?'g':t.score>=70?'y':'r'}"><b>${t.score}%</b>Compliance score</div>
 <div class="kp"><div><b>${t.total}</b>Total</div><div class="r"><b>${t.def}</b>Defects</div><div class="g"><b>${t.ok}</b>No defect</div><div><b>${t.pDef}%</b>Defect %</div></div>${catTable(t,true)}
 <h3>Defects (${t.def})</h3>`+obs.filter(o=>o.verdict==='defect').map(o=>`<div class="ob"><img src="${o.thumb}"><div><b>${ANAME[o.category]||o.category}</b><br><small>${fmtT(o.ts)}</small><br>${esc(o.note)}</div></div>`).join('');
 $('upMsg').textContent='';$('startSheet').hidden=true;$('summary').hidden=false}
const fileBase=s=>(s.site.replace(/[^\w-]+/g,'_')+'_'+s.start.slice(0,10));
function csv({s,obs}){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const H=['n','timestamp','site','auditor','category','verdict','note','model_state','model_verdict','model_category','p_defect','p_equipment','photo'];
 return [H.join(',')].concat(obs.map((o,i)=>[i+1,o.ts,s.site,s.auditor,o.category,o.verdict,o.note,o.model.state,o.model.verdict,o.model.category,o.model.p_defect,o.model.p_equipment,`obs_${String(i+1).padStart(3,'0')}.jpg`].map(q).join(','))).join('\r\n')}
function reportHtml({s,obs,t}){const end=s.end||new Date().toISOString();return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Audit ${esc(s.site)} ${s.start.slice(0,10)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:auto;padding:16px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;text-align:left}
.k{display:flex;gap:10px}.k div{flex:1;border:1px solid #ccc;border-radius:8px;padding:8px;text-align:center}.k b{display:block;font-size:24px}.r{color:#b3001b}.g{color:#0a7d2c}
.o{display:flex;gap:12px;border-bottom:1px solid #ddd;padding:8px 0;page-break-inside:avoid}.o img{width:220px;border-radius:6px}.bar{background:#eee;height:8px}.bar i{display:block;height:8px;background:#b3001b}</style></head><body>
<h1>Safety audit report — ${esc(s.site)}</h1><p>Start ${fmtT(s.start)} · End ${fmtT(end)} · Duration ${dur(s.start,end)}${s.auditor?' · Auditor: '+esc(s.auditor):''}</p>
<div class="k"><div><b class="${t.score>=90?'g':'r'}">${t.score}%</b>Compliance score</div><div><b>${t.total}</b>Observations</div><div><b class="r">${t.def}</b>Defects</div><div><b class="g">${t.ok}</b>No defect</div><div><b>${t.pDef}%</b>Defect %</div></div>
<h2>Category breakdown</h2>${catTable(t,true).replace(/class="cb"/g,'class="bar"')}<h2>All observations</h2>`+obs.map((o,i)=>`<div class="o"><img src="${o.thumb}"><div><b>#${i+1} <span class="${o.verdict==='defect'?'r':'g'}">${o.verdict==='defect'?'DEFECT':'NO DEFECT'}</span> · ${ANAME[o.category]||o.category}</b><br>${fmtT(o.ts)}<br>${esc(o.note)}<br><small>Model: ${o.model.verdict||o.model.state}${o.model.category?' / '+(ANAME[o.model.category]||o.model.category):''}${o.model.p_defect!=null?' · p(defect) '+o.model.p_defect:''}</small></div></div>`).join('')+`<p><small>Generated by Safety Glass PWA</small></p></body></html>`}
function dl(name,data,mime){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:mime}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function printReport(){const w=window.open('','_blank');if(!w)return alert('Allow pop-ups to print');w.document.write(reportHtml(aSum));w.document.close();setTimeout(()=>w.print(),600)}
async function share(){const b=fileBase(aSum.s),f=[new File([reportHtml(aSum)],b+'_report.html',{type:'text/html'}),new File([csv(aSum)],b+'.csv',{type:'text/csv'})];
 const text=`Safety audit ${aSum.s.site} ${aSum.s.start.slice(0,10)}: compliance ${aSum.t.score}% · ${aSum.t.def} defects / ${aSum.t.total} observations`;
 try{if(navigator.canShare&&navigator.canShare({files:f}))await navigator.share({files:f,title:'Safety audit',text});else if(navigator.share)await navigator.share({title:'Safety audit',text});else{await navigator.clipboard.writeText(text);alert('Sharing not supported — summary copied to clipboard')}}catch(e){if(e.name!=='AbortError')alert('Share failed: '+e.message)}}
async function uploadDrive(){const m=$('upMsg');if(!cfg.url){m.innerHTML='<span class="r">Drive upload is not configured. Open ⚙ Settings and paste the Apps Script web app URL (see README). Download / Share still work.</span>';return}
 if(!navigator.onLine){m.textContent='Offline — try again when connected. Data is saved on this phone.';return}
 const {s,obs}=aSum,folder=fileBase(s),files=[{name:folder+'_report.html',mime:'text/html',text:reportHtml(aSum)},{name:folder+'.csv',mime:'text/csv',text:csv(aSum)},{name:folder+'_session.json',mime:'application/json',text:JSON.stringify({session:s,stats:aSum.t,observations:obs.map(({thumb,...o})=>o)},null,1)}]
  .concat(obs.map((o,i)=>({name:`obs_${String(i+1).padStart(3,'0')}_${o.verdict}_${o.category}.jpg`,mime:'image/jpeg',data:o.thumb.split(',')[1]})));
 try{let link='';for(let i=0;i<files.length;i++){m.textContent=`Uploading ${i+1}/${files.length}…`;
   const r=await fetch(cfg.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({type:'session_file',folder,...files[i]})});const j=await r.json().catch(()=>({}));
   if(!j.ok)throw new Error(j.error||('HTTP '+r.status+(r.ok?' — is the Apps Script redeployed with session support?':'')));link=j.folder||link}
  s.uploaded=new Date().toISOString();await A.putS(s);m.innerHTML=`<span class="g">Uploaded ${files.length} files to Drive: Safety Glass/audit_sessions/${esc(folder)}</span>`+(link?` <a href="${link}" target="_blank">open</a>`:'')}
 catch(e){m.innerHTML='<span class="r">Upload failed: '+esc(e.message)+'</span>'}}
window.SG_AUDIT={stats,csv,reportHtml,openStart,beginSession,openRec,saveRec,endSession,showSummary,get session(){return aS},get obs(){return aObs}};
document.addEventListener('DOMContentLoaded',async()=>{
 $('aGo').onclick=beginSession;$('aTrain').onclick=()=>{$('startSheet').hidden=true;setMode();if(!running&&!window.SG_TEST)start()};
 $('recDef').onclick=()=>openRec('defect');$('recOk').onclick=()=>openRec('no_defect');$('recSave').onclick=saveRec;$('recCancel').onclick=()=>{aPend=null;$('recSheet').hidden=true};
 $('endBtn').onclick=endSession;$('dashHead').onclick=()=>{localStorage.sgHudMin=localStorage.sgHudMin==='1'?'0':'1';renderDash()};
 $('sumHtml').onclick=()=>dl(fileBase(aSum.s)+'_report.html',reportHtml(aSum),'text/html');$('sumCsv').onclick=()=>dl(fileBase(aSum.s)+'.csv',csv(aSum),'text/csv');$('sumPdf').onclick=printReport;
 $('sumShare').onclick=share;$('sumUp').onclick=uploadDrive;$('sumClose').onclick=()=>{$('summary').hidden=true;openStart()};$('auditBtn').onclick=()=>{if(aS)return;$('settings').hidden=true;openStart()};
 $('trainChk').onchange=()=>{localStorage.sgTrain=$('trainChk').checked?'1':'0';setMode()};
 setMode();const open=(await A.allS()).filter(s=>!s.end).sort((a,b)=>b.start.localeCompare(a.start))[0];
 if(open&&!window.SG_TEST&&confirm(`Resume unfinished audit at ${open.site}?`))resumeSession(open.id);else openStart()});

// test-only hook (used by headless tests; not called by the UI)
window.SG_AUDIT_TEST={A,stats,ACATS,ANAME};
