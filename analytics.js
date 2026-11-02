'use strict';
const $=i=>document.getElementById(i);
const CATS=['defect_electrical','defect_equipment','defect_facility','defect_fire','defect_physical','defect_signage','other'];
const NM={defect_electrical:'Electrical',defect_equipment:'Equipment',defect_facility:'Facility',defect_fire:'Fire safety',defect_physical:'Physical hazard',defect_signage:'Signage',other:'Other'};
const COL=['#ffb300','#42a5f5','#ab47bc','#ff3b3b','#ff7043','#26c6da','#9e9e9e'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p1=(n,d)=>d?Math.round(n*1000/d)/10:0,fd=iso=>new Date(iso).toLocaleDateString('en-IN',{dateStyle:'medium'});
const DB=new Promise((res,rej)=>{const r=indexedDB.open('sgAudit',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('sessions',{keyPath:'id'});d.createObjectStore('obs',{keyPath:'id',autoIncrement:true}).createIndex('sid','sid')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const all=async st=>{const d=await DB;return new Promise((res,rej)=>{const q=d.transaction(st).objectStore(st).getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})};
let S=[],O=[],charts=[],rows=[];
Chart.defaults.color='#ccc';Chart.defaults.borderColor='#2a2a2a';
async function load(){S=await all('sessions');O=(await all('obs')).map(({thumb,...o})=>o);const sites=[...new Set(S.map(s=>s.site))].sort();
 $('fSite').innerHTML='<option value="">All sites</option>'+sites.map(s=>`<option>${esc(s)}</option>`).join('');const q=new URLSearchParams(location.search).get('site');if(q)$('fSite').value=q;render()}
function render(){charts.forEach(c=>c.destroy());charts=[];const site=$('fSite').value,fr=$('fFrom').value,to=$('fTo').value;
 const ss=S.filter(s=>(!site||s.site===site)&&(!fr||s.start.slice(0,10)>=fr)&&(!to||s.start.slice(0,10)<=to)).sort((a,b)=>a.start.localeCompare(b.start)),ids=new Set(ss.map(s=>s.id)),os=O.filter(o=>ids.has(o.sid));
 if(!S.length||!ss.length){$('main').hidden=true;$('empty').hidden=false;$('empty').innerHTML=S.length?'No sessions match these filters.':'No audit sessions yet.<br><small>Start an audit from the Audit screen (☰ Modes → Defect check &amp; Audit) – results appear here automatically.</small>';rows=[];return}
 $('empty').hidden=true;$('main').hidden=false;const def=os.filter(o=>o.verdict==='defect').length,tot=os.length,pd=p1(def,tot);
 $('kp').innerHTML=`<div><b>${ss.length}</b>Sessions</div><div><b>${new Set(ss.map(s=>s.site)).size}</b>Sites</div><div><b>${tot}</b>Observations</div><div class="r"><b>${def}</b>Defects</div><div class="g"><b>${tot-def}</b>No defect</div><div class="${pd<=10?'g':pd<=30?'y':'r'}"><b>${pd}%</b>Defect %</div><div><b>${tot?p1(tot-def,tot)+'%':'–'}</b>Compliance</div>`;
 rows=ss.map(s=>{const o=os.filter(x=>x.sid===s.id),d=o.filter(x=>x.verdict==='defect').length;return{s,n:o.length,d,p:p1(d,o.length)}});
 charts.push(new Chart($('cTrend'),{type:'line',data:{labels:rows.map(r=>fd(r.s.start)+(site?'':' · '+r.s.site)),datasets:[{label:'% defects',data:rows.map(r=>r.p),borderColor:'#ff5a6a',backgroundColor:'#ff5a6a',tension:.25}]},options:{scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%'}}},plugins:{legend:{display:false}}}}));
 const cs=CATS.map(c=>{const o=os.filter(x=>x.category===c),d=o.filter(x=>x.verdict==='defect').length;return{c,d,ok:o.length-d,n:o.length}});
 charts.push(new Chart($('cCat'),{type:'bar',data:{labels:cs.map(x=>NM[x.c]),datasets:[{label:'Defect',data:cs.map(x=>x.d),backgroundColor:'#ff3b3b'},{label:'No defect',data:cs.map(x=>x.ok),backgroundColor:'#19c15a'}]},options:{scales:{x:{stacked:true},y:{stacked:true,ticks:{precision:0}}}}}));
 const dc=cs.filter(x=>x.d);charts.push(new Chart($('cDon'),{type:'doughnut',data:{labels:dc.map(x=>NM[x.c]),datasets:[{data:dc.map(x=>x.d),backgroundColor:dc.map(x=>COL[CATS.indexOf(x.c)])}]},options:{plugins:{legend:{position:'right'}}}}));
 $('tTop').innerHTML='<tr><th>#</th><th>Category</th><th>Defects</th><th>Share</th><th>% of checks</th></tr>'+(dc.length?dc.sort((a,b)=>b.d-a.d).map((x,i)=>`<tr><td>${i+1}</td><td>${NM[x.c]}</td><td>${x.d}</td><td>${p1(x.d,def)}%</td><td>${p1(x.d,x.n)}%</td></tr>`).join(''):'<tr><td colspan=5>No defects recorded</td></tr>');
 const bySite={};rows.forEach(r=>{const b=bySite[r.s.site]||(bySite[r.s.site]={n:0,o:0,d:0,last:''});b.n++;b.o+=r.n;b.d+=r.d;if(r.s.start>b.last)b.last=r.s.start});
 $('tSite').innerHTML='<tr><th>Site</th><th>Sessions</th><th>Observations</th><th>% defect</th><th>Last audit</th></tr>'+Object.entries(bySite).sort((a,b)=>p1(b[1].d,b[1].o)-p1(a[1].d,a[1].o)).map(([k,b])=>{const p=p1(b.d,b.o);return `<tr><td>${esc(k)}</td><td>${b.n}</td><td>${b.o}</td><td class="${p<=10?'g':p<=30?'y':'r'}">${p}%</td><td>${fd(b.last)}</td></tr>`}).join('')}
$('fSite').onchange=$('fFrom').onchange=$('fTo').onchange=render;$('fReset').onclick=()=>{$('fSite').value=$('fFrom').value=$('fTo').value='';render()};
$('csv').onclick=()=>{if(!rows.length)return alert('No sessions to export');const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const t=['session_id,site,auditor,start,end,observations,defects,no_defects,pct_defect,'+CATS.map(c=>c+'_defects').join(',')].concat(rows.map(r=>{const o=O.filter(x=>x.sid===r.s.id);return[r.s.id,r.s.site,r.s.auditor,r.s.start,r.s.end,r.n,r.d,r.n-r.d,r.p,...CATS.map(c=>o.filter(x=>x.category===c&&x.verdict==='defect').length)].map(q).join(',')})).join('\r\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv'}));a.download='safety_glass_analytics_'+new Date().toISOString().slice(0,10)+'.csv';a.click()};
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
window.SG_ANALYTICS_TEST={reload:load};load();
