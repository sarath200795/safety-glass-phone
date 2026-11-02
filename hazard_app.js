'use strict';
const $ = (id) => document.getElementById(id);
const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
let model = null, stream = null, facing = 'environment', paused = false, running = false;
const logRows = []; // CSV rows
const lastAlert = {}; // key -> time
let lastVoice = 0;
const ALERT_COOLDOWN_MS = 8000, VOICE_COOLDOWN_MS = 5000;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const HIGH = new Set(['knife', 'scissors', 'car', 'truck', 'bus', 'motorcycle', 'train']);
const ALWAYS_MED = new Set(['dog', 'bicycle']);
const TRIP = new Set(['chair', 'suitcase', 'backpack', 'handbag', 'bottle']);

// Persons are never a hazard on their own: 'person' always classifies LOW.
function classify(p, W, H) {
  const [x, y, w, h] = p.bbox;
  if (HIGH.has(p.class)) return { level: 'HIGH', reason: p.class };
  if (ALWAYS_MED.has(p.class)) return { level: 'MEDIUM', reason: p.class };
  if (TRIP.has(p.class) && y + h > H * (2 / 3)) return { level: 'MEDIUM', reason: p.class + ' trip hazard (floor)' };
  return { level: 'LOW', reason: p.class };
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('status').textContent = 'Camera unavailable: use HTTPS or localhost'; return;
  }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
    catch (e2) { $('status').textContent = 'Camera error: ' + e2.message; return; }
  }
  video.srcObject = stream;
  await video.play();
  video.style.transform = canvas.style.transform = facing === 'user' ? 'scaleX(-1)' : '';
  $('status').textContent = model ? 'Scanning…' : 'Loading model…';
  if (sourceActive('CUSTOM')) updateModeStatus();
  if (!running) { running = true; loop(); }
}

function beep() {
  try {
    const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.2);
  } catch (e) { /* ignore */ }
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const now = Date.now(); if (now - lastVoice < VOICE_COOLDOWN_MS) return;
  lastVoice = now; speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

/* ================= Config ================= */
const AI_DEFAULTS = { url: 'http://localhost:1234/v1/chat/completions', model: 'google/gemma-4-e4b', interval: 4, width: 640,
  closeup: true, confirmAI: 2, confirmCOCO: 3, suppress: true };
const aiCfg = Object.assign({}, AI_DEFAULTS, JSON.parse(localStorage.getItem('sg_ai_cfg') || '{}'));

/* ================= Image helpers ================= */
// Crop a normalized box [x,y,w,h] from a source (video or canvas) with padding, scaled so the longest side = maxSide.
function cropBox(src, box, maxSide, pad, quality) {
  const W = src.videoWidth || src.width, H = src.videoHeight || src.height;
  if (!W || !H || !box) return null;
  const bw = box[2] * W, bh = box[3] * H, px = bw * pad, py = bh * pad;
  const x0 = Math.max(0, box[0] * W - px), y0 = Math.max(0, box[1] * H - py);
  const x1 = Math.min(W, box[0] * W + bw + px), y1 = Math.min(H, box[1] * H + bh + py);
  const cw = x1 - x0, ch = y1 - y0; if (cw < 4 || ch < 4) return null;
  const s = maxSide / Math.max(cw, ch);
  const c = document.createElement('canvas'); c.width = Math.round(cw * s); c.height = Math.round(ch * s);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, x0, y0, cw, ch, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality || 0.8);
}
let lastAIFrame = null; // full-res canvas of the frame sent in the latest AI scan
function grabFullFrame() {
  const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0); return c;
}
function frameDataURL(full) {
  const w = Math.min(aiCfg.width, full.width), h = Math.round(full.height * w / full.width);
  const c = frameDataURL.c || (frameDataURL.c = document.createElement('canvas'));
  c.width = w; c.height = h; c.getContext('2d').drawImage(full, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.75);
}

/* ================= Equipment lookup ================= */
function equipmentFor(f) {
  const L = window.HAZARD_LIBRARY;
  const eq = L.all.filter((h) => h.defects && (h.category === 'Fire-fighting equipment' || h.category === 'Emergency equipment'));
  if (f.hazard_id && L.byId[f.hazard_id] && L.byId[f.hazard_id].defects) return L.byId[f.hazard_id];
  const t = (f.label + ' ' + (f.category || '')).toLowerCase();
  const kw = [['co2', 'ext_co2'], ['foam', 'ext_foam'], ['powder', 'ext_powder'], ['wet chem', 'ext_wetchem'], ['water extinguisher', 'ext_water'],
    ['extinguisher', 'ext_water'], ['hose', 'hose_reel'], ['blanket', 'fire_blanket'], ['sprinkler', 'sprinkler'], ['call point', 'fire_alarm'],
    ['alarm', 'fire_alarm'], ['detector', 'fire_alarm'], ['hydrant', 'hydrant'], ['fire door', 'fire_door'], ['exit sign', 'exit_sign'],
    ['fire exit', 'fire_exit'], ['emergency light', 'emergency_light'], ['first aid', 'first_aid_kit'], ['eyewash', 'eyewash'], ['eye wash', 'eyewash'],
    ['shower', 'safety_shower'], ['aed', 'aed'], ['defibrillator', 'aed'], ['spill', 'spill_kit'], ['assembly', 'assembly_point']];
  for (const [k, id] of kw) if (t.includes(k)) { const h = L.byId[id] || eq.find((e) => e.id.includes(id.split('_')[0])); if (h && h.defects) return h; }
  return eq.find((h) => t.includes(h.name.toLowerCase().split(' (')[0])) || null;
}

/* ================= Feedback store ================= */
const FB_KEY = 'sg_feedback', FB_MAX = 300;
let feedback = JSON.parse(localStorage.getItem(FB_KEY) || '[]');
let fbStats = {};
function recomputeFb() {
  fbStats = {};
  for (const e of feedback) {
    const k = String(e.label || '').toLowerCase(); const s = fbStats[k] || (fbStats[k] = { label: e.label, correct: 0, wrong: 0 });
    if (e.verdict === 'correct') s.correct++; else s.wrong++;
  }
}
recomputeFb();
function saveFb() {
  while (true) {
    try { localStorage.setItem(FB_KEY, JSON.stringify(feedback)); break; }
    catch (e) { if (!feedback.length) break; feedback.shift(); } // quota: drop oldest
  }
  recomputeFb(); SYS_PROMPT = null;
}
function addFeedback(meta, verdict, note) {
  feedback.push({ timestamp: new Date().toISOString(), label: meta.label, hazard_id: meta.hazard_id || null, severity: meta.severity,
    defect: meta.defect || null, source: meta.source, category: meta.category || '', box: meta.box || null,
    verdict, note: note || '', thumbnail: meta.thumb || null });
  while (feedback.length > FB_MAX) feedback.shift();
  saveFb();
}
function isSuppressed(label) {
  if (!aiCfg.suppress) return false;
  const s = fbStats[String(label).toLowerCase()];
  return !!s && s.wrong >= 3 && s.wrong > s.correct;
}
function recentWrongLabels() {
  const out = [];
  for (let i = feedback.length - 1; i >= 0 && out.length < 5; i--) {
    const e = feedback[i]; if (e.verdict !== 'wrong') continue;
    const s = e.label + (e.defect ? ' (defect: ' + e.defect + ')' : '');
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/* ================= Tracker (multi-frame confirmation) ================= */
let tracks = [], trackSeq = 0;
const cycles = { AI: 0, COCO: 0, CUSTOM: 0 };
const DROP_AFTER = { AI: 3, COCO: 10, CUSTOM: 10 }; // cycles unseen before a track is dropped
function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1), u = a[2] * a[3] + b[2] * b[3] - i;
  return u > 0 ? i / u : 0;
}
const keyOf = (f) => String(f.hazard_id || f.label).toLowerCase();
const needN = (src) => Math.max(1, Number(src === 'AI' ? aiCfg.confirmAI : aiCfg.confirmCOCO) || 1);
function isIssue(t) { return t.severity !== 'LOW' || !!t.defect; }
function levelOf(t) { return t.defect && t.severity === 'LOW' ? 'MEDIUM' : t.severity; }

// dets: normalized findings {label, hazard_id, severity, defect, ghs, category, action, box, score}
function updateTracks(src, dets, frameSrc) {
  const cyc = ++cycles[src], used = new Set(), seenNow = [];
  for (const d of dets) {
    const k = keyOf(d); let best = null, bestIoU = 0;
    for (const t of tracks) {
      if (t.source !== src || used.has(t) || t.key !== k) continue;
      const v = t.box && d.box ? iou(t.box, d.box) : (!t.box && !d.box ? 1 : 0);
      if (v > 0.3 && v > bestIoU) { best = t; bestIoU = v; }
    }
    if (!best) { best = { id: ++trackSeq, source: src, key: k, seen: [], confirmed: false, logged: false, closeup: null, closeupAt: 0 }; tracks.push(best); }
    used.add(best);
    const keepDefect = best.closeup && best.closeup.applied ? best.defect : null;
    Object.assign(best, d, { lastSeen: cyc, lastSeenAt: Date.now() });
    if (keepDefect !== null && best.closeup) best.defect = keepDefect; // close-up result wins over the coarse pass
    if (best.closeup && best.closeup.overall === 'OK') best.defect = null;
    best.seen.push(cyc); if (best.seen.length > 12) best.seen.shift();
    const N = needN(src), recent = best.seen.filter((c) => c > cyc - (N + 1)).length; // allows one missed cycle
    if (!best.confirmed && recent >= N) {
      best.confirmed = true;
      best.thumb = cropBox(frameSrc, best.box, 256, 0.15, 0.7);
    }
    if (best.confirmed && !isSuppressed(best.label) && (isIssue(best) || $('showAllChk').checked) && !best.logged) { best.logged = true; record(best); }
    seenNow.push(best);
  }
  tracks = tracks.filter((t) => t.source !== src || cyc - t.lastSeen <= DROP_AFTER[src]);
  return seenNow;
}

/* ================= Logging & alerts ================= */
const logEntries = new Map(); let logSeq = 0;
function metaOf(t) {
  return { label: t.label, hazard_id: t.hazard_id || null, severity: levelOf(t), defect: t.defect || null, source: t.source,
    category: t.category || '', box: t.box, thumb: t.thumb || null, ghs: t.ghs || '', action: t.action || '', score: t.score };
}
function record(t, note) {
  const m = metaOf(t), now = new Date(), key = m.source + ':' + m.severity + ':' + m.label + ':' + (m.defect || '');
  if (lastAlert[key] && now - lastAlert[key] < ALERT_COOLDOWN_MS) return;
  lastAlert[key] = now.getTime();
  logRows.push([now.toISOString(), m.severity, m.label, m.score == null ? '' : m.score.toFixed(2), m.source,
    m.category, m.defect || '', m.ghs, m.action, note || '']);
  const id = ++logSeq; logEntries.set(id, m);
  const li = document.createElement('li'); li.className = m.severity;
  const conf = m.score == null ? m.source : Math.round(m.score * 100) + '%';
  li.innerHTML = '<span>' + esc(`${now.toLocaleTimeString()} [${m.severity}] ${m.label}${m.defect ? ' – DEFECT: ' + m.defect : ''}${m.ghs ? ' (' + m.ghs + ')' : ''} (${conf})${note ? ' {' + note + '}' : ''}${m.action ? ' → ' + m.action : ''}`) + '</span>' +
    ' <span class="fb"><button class="ok" data-v="correct">✓</button><button class="bad" data-v="wrong">✗</button></span>';
  li.querySelectorAll('.fb button').forEach((b) => { b.onclick = () => { addFeedback(m, b.dataset.v); li.querySelector('.fb').textContent = b.dataset.v === 'correct' ? '✓ marked correct' : '✗ marked wrong'; }; });
  $('log').prepend(li);
  while ($('log').children.length > 100) $('log').lastChild.remove();
  if (logEntries.size > 100) logEntries.delete(logEntries.keys().next().value);
  if (!isIssue(t)) return; // show-all equipment: log only, no alarm
  if ($('beepChk').checked) beep();
  if ($('voiceChk').checked) speak((m.severity === 'HIGH' ? 'Danger: ' : 'Caution: ') + m.label + (m.defect ? ', ' + m.defect : ''));
}

/* ================= Drawing ================= */
const SEV_COLOR = { HIGH: '#ff1744', MEDIUM: '#ffb300', LOW: 'rgba(255,255,255,0.6)' };
function drawBox(x, y, w, bh, color, label, thick, dashed) {
  const W = canvas.width;
  ctx.setLineDash(dashed ? [8, 6] : []);
  ctx.lineWidth = thick ? Math.max(3, W / 250) : 1; ctx.strokeStyle = color; ctx.strokeRect(x, y, w, bh);
  ctx.setLineDash([]);
  const fs = Math.max(14, W / 50) * (dashed ? 0.8 : 1); ctx.font = `bold ${fs}px sans-serif`;
  ctx.fillStyle = color; ctx.fillRect(x, Math.max(0, y - fs - 6), ctx.measureText(label).width + 8, fs + 6);
  ctx.fillStyle = '#000'; ctx.fillText(label, x + 4, Math.max(fs, y - 5));
}
const MODE_SOURCES = { coco: ['COCO'], ai: ['AI'], both: ['COCO', 'AI'], custom: ['CUSTOM'], custom_ai: ['CUSTOM', 'AI'] };
function sourceActive(src) { return (MODE_SOURCES[$('modeSel').value] || MODE_SOURCES.both).includes(src); }
function visibleTracks() {
  const showAll = $('showAllChk').checked;
  return tracks.filter((t) => sourceActive(t.source) && !isSuppressed(t.label) && (isIssue(t) || showAll) &&
    !(t.source === 'AI' && Date.now() - t.lastSeenAt > AI_FINDING_TTL_MS));
}
function render() {
  const W = video.videoWidth, H = video.videoHeight;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.clearRect(0, 0, W, H);
  let count = 0;
  for (const t of visibleTracks()) {
    const lvl = levelOf(t), issue = isIssue(t);
    if (t.confirmed && issue) count++;
    if (!t.box) continue;
    const [x, y, w, h] = t.box; const src = t.source === 'AI' ? 'AI ' : t.source === 'CUSTOM' ? 'YOLO ' : '';
    let label;
    if (!t.confirmed) label = `${src}${t.label} checking…`;
    else {
      label = `${src}${issue ? lvl + ' ' : ''}${t.label}${t.score != null ? ' ' + Math.round(t.score * 100) + '%' : ''}`;
      if (t.defect) label += ' ⚠ ' + t.defect;
      if (t.ghs) label += ' [' + t.ghs + ']';
      if (t.closeup && t.closeup.pending) label += ' 🔍';
      else if (t.closeup && t.closeup.overall === 'OK') label += ' ✓close-up OK';
      else if (t.closeup && t.closeup.overall === 'UNSURE') label += ' ?close-up';
    }
    drawBox(x * W, y * H, w * W, h * H, SEV_COLOR[lvl], label, t.confirmed && lvl !== 'LOW', !t.confirmed);
  }
  $('hazardCount').textContent = count;
  $('count').classList.toggle('alert', count > 0);
}

async function loop() {
  if (!paused && video.readyState >= 2 && video.videoWidth) {
    try {
      if (model && sourceActive('COCO')) {
        const W = video.videoWidth, H = video.videoHeight;
        const preds = await model.detect(video, 20, 0.5);
        const dets = preds.map((p) => {
          const h = classify(p, W, H);
          return { label: h.reason, hazard_id: null, severity: h.level, defect: null, ghs: null, category: 'COCO', action: '',
            score: p.score, box: [p.bbox[0] / W, p.bbox[1] / H, p.bbox[2] / W, p.bbox[3] / H] };
        });
        const seen = updateTracks('COCO', dets, video);
        // COCO findings with a box: queue a close-up only once confirmed (avoids spamming the VLM at frame rate)
        enqueueCloseups(seen.filter((t) => t.confirmed && isIssue(t)), video);
      }
      if (sourceActive('CUSTOM')) {
        if (!yolo.model && !yolo.loading && !yolo.failed) loadCustomModel();
        if (yolo.model) {
          const seen = updateTracks('CUSTOM', await yoloDetect(video), video);
          enqueueCloseups(seen.filter((t) => t.confirmed && isIssue(t)), video);
        }
      }
      render();
    } catch (e) { console.error(e); }
  }
  requestAnimationFrame(loop);
}

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvEsc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
function csvBlob() {
  const lines = [['timestamp', 'level', 'hazard', 'confidence', 'source', 'category', 'defect', 'ghs', 'action', 'note'], ...logRows].map((r) => r.map(csvEsc).join(','));
  return new Blob([lines.join('\n')], { type: 'text/csv' });
}

function snapshot() {
  if (!video.videoWidth) return;
  const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
  const g = c.getContext('2d'); g.drawImage(video, 0, 0); g.drawImage(canvas, 0, 0);
  const ts = new Date();
  logRows.push([ts.toISOString(), 'SNAPSHOT', `${$('hazardCount').textContent} hazards in frame`, '', '', '', '', '', '', '']);
  const stamp = ts.toISOString().replace(/[:.]/g, '-');
  c.toBlob((b) => download(b, `safety-snapshot-${stamp}.png`), 'image/png');
}

$('startBtn').onclick = () => { startCamera(); $('startBtn').textContent = 'Restart camera'; };
$('switchBtn').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; startCamera(); };
$('pauseBtn').onclick = () => { paused = !paused; $('pauseBtn').textContent = paused ? 'Resume' : 'Pause'; $('status').textContent = paused ? 'Paused' : 'Scanning…'; };
$('snapBtn').onclick = snapshot;
$('csvBtn').onclick = () => download(csvBlob(), 'safety-hazard-log.csv');

(async () => {
  try {
    model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    $('status').textContent = stream ? 'Scanning…' : 'Model ready – tap Start camera';
    if (sourceActive('CUSTOM')) updateModeStatus();
  } catch (e) { $('status').textContent = 'Model failed to load: ' + e.message; }
})();

/* ================= AI Hazard Scan (LM Studio, OpenAI-compatible) ================= */
let vlmBusy = false, aiTimer = null;
const AI_FINDING_TTL_MS = 15000;

function aiStatus(cls, text) { const el = $('aiStatus'); el.className = cls; el.textContent = 'AI: ' + text; }

function buildSystemPrompt() {
  const L = window.HAZARD_LIBRARY, fp = recentWrongLabels();
  return 'You are an expert EHS (occupational safety) inspector analysing ONE workplace camera image. ' +
    'Use this hazard library (ids, severity H/M/L, visual cues) based on HSE UK guidance:\n' + L.compact() + '\n\n' +
    'Tasks: (1) identify real, visible hazards; (2) read any GHS/CLP pictograms on labels (GHS01-GHS09); ' +
    '(3) identify fire-fighting equipment (extinguisher type by label colour band, hose reel, blanket, sprinkler, call point, hydrant, fire door, exit sign) and report visible defects; ' +
    '(4) identify emergency equipment (emergency light, exit sign, first aid kit, eyewash, safety shower, AED, spill kit, assembly point) and report visible defects. ' +
    'Only report what is clearly visible; do not guess. If equipment looks fine, you may report it with severity LOW and defect null. ' +
    'A person or people on their own are NEVER a hazard; do not report people, faces or bodies as findings. Only report a person when they are in an unsafe condition from the library (e.g. at height without harness, next to a moving vehicle, missing required PPE), and label the unsafe condition, not the person. ' +
    (fp.length ? 'Common false positives to avoid (the user marked these as wrong before; only report them if unmistakable): ' + fp.join('; ') + '. ' : '') +
    'Respond with STRICT JSON only, no prose, no markdown: {"findings":[{"label":string,"category":string,"hazard_id":string|null,"severity":"HIGH"|"MEDIUM"|"LOW","defect":string|null,"ghs":"GHS0x"|null,"box":[x,y,w,h],"action":string}]} ' +
    'where box values are normalized 0-1 relative to image width/height (x,y = top-left). Return {"findings":[]} if nothing relevant.';
}
let SYS_PROMPT = null;

function parseJSONLoose(text) {
  if (!text) throw new Error('empty response');
  let t = String(text).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(t); } catch (e) { /* fall through */ }
  const start = t.indexOf('{'); if (start < 0) throw new Error('no JSON in response');
  let depth = 0, inStr = false, escp = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (escp) escp = false; else if (c === '\\') escp = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error('unterminated JSON');
}

function normFinding(f) {
  const sev = String(f.severity || 'LOW').toUpperCase();
  let box = Array.isArray(f.box) && f.box.length === 4 ? f.box.map(Number) : null;
  if (box && box.some((v) => !isFinite(v))) box = null;
  if (box && box.some((v) => v > 1.5)) box = null; // model ignored normalization
  if (box) box = box.map((v) => Math.min(1, Math.max(0, v)));
  if (box && (box[2] <= 0.005 || box[3] <= 0.005)) box = null;
  const nul = (v) => (v == null || v === 'null' || v === '' ? null : String(v));
  return { label: String(f.label || f.hazard_id || 'hazard'), category: nul(f.category) || '', hazard_id: nul(f.hazard_id),
    severity: ['HIGH', 'MEDIUM', 'LOW'].includes(sev) ? sev : 'LOW', defect: nul(f.defect), ghs: nul(f.ghs), box, action: nul(f.action) || '', score: null };
}
const PERSON_ONLY = /^(a\s+)?(person|people|man|woman|worker|human|face|body|individual)s?$/i;

async function vlmCall(system, userText, imageURL, maxTokens) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(aiCfg.url, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: aiCfg.model, temperature: 0.1, max_tokens: maxTokens, stream: false, messages: [
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: imageURL } }] }] }) });
    if (!res.ok) { const body = await res.text(); throw new Error('HTTP ' + res.status + ': ' + body.slice(0, 160)); }
    const data = await res.json();
    return parseJSONLoose(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
  } finally { clearTimeout(to); }
}
function aiErr(e) {
  const msg = e.name === 'AbortError' ? 'timeout – model too slow?' :
    e instanceof TypeError ? 'cannot reach ' + aiCfg.url + ' – start LM Studio server with CORS enabled (port 1234)' : e.message;
  aiStatus('err', 'error: ' + msg); console.error(e);
}

async function aiScan() {
  if (vlmBusy || paused || !sourceActive('AI') || !video.videoWidth) return;
  vlmBusy = true; aiStatus('busy', 'thinking…');
  const t0 = performance.now();
  try {
    SYS_PROMPT = SYS_PROMPT || buildSystemPrompt();
    const full = grabFullFrame();
    const parsed = await vlmCall(SYS_PROMPT, 'Inspect this image and return the JSON findings.', frameDataURL(full), 1200);
    lastAIFrame = full;
    const dets = (Array.isArray(parsed.findings) ? parsed.findings : []).map(normFinding)
      .filter((f) => !(PERSON_ONLY.test(f.label.trim()) && !f.hazard_id && !f.defect));
    const seen = updateTracks('AI', dets, full);
    // Equipment first, then other boxed findings
    enqueueCloseups(seen.filter((t) => t.box).sort((a, b) => (equipmentFor(b) ? 1 : 0) - (equipmentFor(a) ? 1 : 0)), full);
    aiStatus('ok', `connected (${aiCfg.model}) – ${dets.length} findings, ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) { aiErr(e); }
  finally { vlmBusy = false; }
}

/* ================= Two-stage close-up defect check ================= */
const closeQ = []; const CLOSEUP_PER_CYCLE = 2, CLOSEUP_RECHECK_MS = 30000, CLOSEUP_MAX_AGE_MS = 20000;
function enqueueCloseups(cands, frameSrc) {
  if (!aiCfg.closeup) return;
  let n = 0; const now = Date.now();
  for (const t of cands) {
    if (n >= CLOSEUP_PER_CYCLE) break;
    if (!t.box || isSuppressed(t.label) || (t.closeup && t.closeup.pending) || now - t.closeupAt < CLOSEUP_RECHECK_MS) continue;
    if (closeQ.some((j) => j.track === t)) continue;
    const img = cropBox(frameSrc, t.box, 512, 0.15, 0.85); if (!img) continue;
    t.closeupAt = now; t.closeup = Object.assign({}, t.closeup, { pending: true });
    closeQ.push({ track: t, img, at: now, eq: equipmentFor(t) }); n++;
  }
  // keep queue small: equipment first, drop stale
  closeQ.sort((a, b) => (b.eq ? 1 : 0) - (a.eq ? 1 : 0));
  while (closeQ.length > 4) { const j = closeQ.pop(); j.track.closeup.pending = false; }
}
async function pumpCloseups(max) {
  let done = 0;
  while (closeQ.length && done < max && !vlmBusy && !paused && aiCfg.closeup) {
    const job = closeQ.shift();
    if (Date.now() - job.at > CLOSEUP_MAX_AGE_MS || !tracks.includes(job.track)) { job.track.closeup.pending = false; continue; }
    vlmBusy = true; aiStatus('busy', 'close-up: ' + job.track.label + '…');
    try { applyCloseup(job, await closeupRequest(job)); aiStatus('ok', 'close-up done: ' + job.track.label); }
    catch (e) { job.track.closeup.pending = false; aiErr(e); }
    finally { vlmBusy = false; done++; }
  }
}
function closeupRequest(job) {
  const t = job.track, eq = job.eq, L = window.HAZARD_LIBRARY;
  let name, checklist;
  if (eq) { name = eq.name; checklist = eq.defects; }
  else {
    const h = t.hazard_id && L.byId[t.hazard_id];
    name = h ? h.name : t.label;
    checklist = [(h ? h.name : t.label) + ' is genuinely present' + (h && h.cues ? ' (' + h.cues.join('; ') + ')' : '')];
    if (t.defect) checklist.push(t.defect);
  }
  const sys = 'You are a safety inspector examining a CLOSE-UP crop of ONE item: "' + name + '". ' +
    'Check ONLY these items, one by one (present=true means the problem/condition is clearly visible in the crop):\n- ' + checklist.join('\n- ') + '\n' +
    'Be strict: if something cannot be seen clearly, set present:false with low confidence and overall "UNSURE". A person alone is never a defect. ' +
    'If the crop does not actually show this item, return overall "UNSURE". ' +
    'Respond with STRICT JSON only: {"item":string,"defects":[{"defect":string,"present":true|false,"confidence":0-1,"evidence":string}],"overall":"OK"|"DEFECT"|"UNSURE"}';
  return vlmCall(sys, 'Inspect this close-up and return the JSON.', job.img, 700);
}
function applyCloseup(job, r) {
  const t = job.track, defs = Array.isArray(r.defects) ? r.defects : [];
  const found = defs.filter((d) => (d.present === true || d.present === 'true') && Number(d.confidence) >= 0.5).map((d) => String(d.defect));
  let overall = String(r.overall || 'UNSURE').toUpperCase(); if (!['OK', 'DEFECT', 'UNSURE'].includes(overall)) overall = 'UNSURE';
  if (found.length && overall === 'OK') overall = 'DEFECT';
  t.closeup = { pending: false, overall, defects: defs, found, item: r.item || '', at: Date.now(), applied: false };
  if (job.eq) {
    const before = t.defect;
    if (overall === 'DEFECT' && found.length) { t.defect = found.join('; '); t.closeup.applied = true; if (t.severity === 'LOW') t.severity = 'MEDIUM'; }
    else if (overall === 'OK') t.defect = null;
    if (t.confirmed && t.defect && t.defect !== before && !isSuppressed(t.label)) record(t, 'close-up');
  } else if (overall === 'OK' || (overall !== 'DEFECT' && !found.length)) {
    t.closeup.overall = overall === 'OK' ? 'UNSURE' : overall; // hazard not confirmed by close-up: flag as doubtful
  }
}

function scheduleAI() {
  clearTimeout(aiTimer);
  if (!sourceActive('AI')) aiStatus('idle', 'off' + (aiCfg.closeup ? ' (close-ups only)' : ''));
  const tick = async () => {
    if (sourceActive('AI')) await aiScan();
    await pumpCloseups(CLOSEUP_PER_CYCLE);
    aiTimer = setTimeout(tick, (sourceActive('AI') ? Math.max(1, aiCfg.interval) : 1) * 1000);
  };
  aiTimer = setTimeout(tick, 500);
  if (!vlmBusy && sourceActive('AI')) aiStatus('idle', 'waiting for camera…');
}

/* ================= Settings ================= */
function openSettings() {
  $('aiUrl').value = aiCfg.url; $('aiModel').value = aiCfg.model; $('aiInterval').value = aiCfg.interval; $('aiWidth').value = aiCfg.width;
  $('closeupChk').checked = aiCfg.closeup; $('confirmAI').value = aiCfg.confirmAI; $('confirmCOCO').value = aiCfg.confirmCOCO; $('suppressChk').checked = aiCfg.suppress;
  $('settings').hidden = false;
}
function saveSettings() {
  aiCfg.url = $('aiUrl').value.trim() || AI_DEFAULTS.url; aiCfg.model = $('aiModel').value.trim() || AI_DEFAULTS.model;
  aiCfg.interval = Math.max(1, Number($('aiInterval').value) || AI_DEFAULTS.interval);
  aiCfg.width = Math.max(256, Number($('aiWidth').value) || AI_DEFAULTS.width);
  aiCfg.closeup = $('closeupChk').checked; aiCfg.suppress = $('suppressChk').checked;
  aiCfg.confirmAI = Math.max(1, Math.round(Number($('confirmAI').value) || AI_DEFAULTS.confirmAI));
  aiCfg.confirmCOCO = Math.max(1, Math.round(Number($('confirmCOCO').value) || AI_DEFAULTS.confirmCOCO));
  if (!aiCfg.closeup) while (closeQ.length) closeQ.pop().track.closeup.pending = false;
  localStorage.setItem('sg_ai_cfg', JSON.stringify(aiCfg)); scheduleAI();
}
async function testAI() {
  saveSettings();
  const modelsUrl = aiCfg.url.replace(/\/chat\/completions\/?$/, '/models');
  try {
    const r = await fetch(modelsUrl); const j = await r.json();
    const ids = (j.data || []).map((m) => m.id);
    aiStatus(ids.includes(aiCfg.model) ? 'ok' : 'err', ids.includes(aiCfg.model) ? 'connected – model available' : 'connected, but model "' + aiCfg.model + '" not loaded. Available: ' + ids.join(', '));
  } catch (e) { aiStatus('err', 'cannot reach LM Studio – start server with CORS enabled'); }
}
$('settingsBtn').onclick = openSettings;
$('settingsClose').onclick = () => { saveSettings(); $('settings').hidden = true; };
$('aiTestBtn').onclick = testAI;
$('modeSel').onchange = () => { localStorage.setItem('sg_mode', $('modeSel').value); scheduleAI(); yolo.failed = false; updateModeStatus(); };
$('modeSel').value = MODE_SOURCES[localStorage.getItem('sg_mode')] ? localStorage.getItem('sg_mode') : 'both';

/* ================= Tap a box -> feedback popup ================= */
let popTrack = null;
canvas.addEventListener('click', (ev) => {
  const W = canvas.width, H = canvas.height; if (!W) return;
  const r = canvas.getBoundingClientRect(), s = Math.min(r.width / W, r.height / H);
  const ox = (r.width - W * s) / 2, oy = (r.height - H * s) / 2;
  let cx = ev.clientX - r.left; if (facing === 'user') cx = r.width - cx;
  const nx = (cx - ox) / (W * s), ny = (ev.clientY - r.top - oy) / (H * s);
  const hit = visibleTracks().filter((t) => t.confirmed && t.box && nx >= t.box[0] && nx <= t.box[0] + t.box[2] && ny >= t.box[1] && ny <= t.box[1] + t.box[3])
    .sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3])[0];
  if (!hit) { $('fbPop').hidden = true; return; }
  popTrack = hit; const m = metaOf(hit);
  const cu = hit.closeup && !hit.closeup.pending ? '<br>Close-up: ' + esc(hit.closeup.overall) + (hit.closeup.found && hit.closeup.found.length ? ' – ' + esc(hit.closeup.found.join('; ')) : '') : '';
  $('fbPopInfo').innerHTML = '<b>' + esc(m.label) + '</b> [' + esc(m.severity) + '] ' + esc(m.source) + (m.defect ? '<br>Defect: ' + esc(m.defect) : '') + cu;
  $('fbNote').value = '';
  const st = $('stage').getBoundingClientRect(), pop = $('fbPop');
  pop.hidden = false;
  pop.style.left = Math.max(4, Math.min(ev.clientX - st.left, st.width - pop.offsetWidth - 4)) + 'px';
  pop.style.top = Math.max(4, Math.min(ev.clientY - st.top, st.height - pop.offsetHeight - 4)) + 'px';
});
function popVerdict(v) {
  if (!popTrack) return;
  const m = metaOf(popTrack); if (!m.thumb) m.thumb = cropBox(popTrack.source === 'AI' && lastAIFrame ? lastAIFrame : video, popTrack.box, 256, 0.15, 0.7);
  addFeedback(m, v, $('fbNote').value.trim()); $('fbPop').hidden = true; popTrack = null;
}
$('fbPopOk').onclick = () => popVerdict('correct');
$('fbPopBad').onclick = () => popVerdict('wrong');
$('fbPopClose').onclick = () => { $('fbPop').hidden = true; };

/* ================= Feedback panel ================= */
function renderFeedback() {
  const c = feedback.filter((e) => e.verdict === 'correct').length, w = feedback.length - c;
  const labels = Object.values(fbStats).sort((a, b) => b.wrong - a.wrong);
  $('fbSummary').innerHTML = `<b>${feedback.length}</b> entries – ✓ ${c} correct, ✗ ${w} wrong` +
    (labels.length ? '<table><tr><th>Label</th><th>✓</th><th>✗</th><th></th></tr>' + labels.map((s) =>
      `<tr><td>${esc(s.label)}</td><td>${s.correct}</td><td>${s.wrong}</td><td>${isSuppressed(s.label) ? 'suppressed' : ''}</td></tr>`).join('') + '</table>' : '');
  $('fbList').innerHTML = feedback.slice().reverse().map((e) => '<div class="fb-item">' +
    (e.thumbnail ? '<img src="' + e.thumbnail + '" alt="">' : '<div class="noimg"></div>') +
    '<div><span class="' + (e.verdict === 'correct' ? 'v-ok' : 'v-bad') + '">' + (e.verdict === 'correct' ? '✓' : '✗') + '</span> <b>' + esc(e.label) + '</b> [' + esc(e.severity) + '] ' + esc(e.source) +
    (e.defect ? '<br>Defect: ' + esc(e.defect) : '') + (e.note ? '<br>Note: ' + esc(e.note) : '') +
    '<br><small>' + esc(new Date(e.timestamp).toLocaleString()) + '</small></div></div>').join('') || '<p class="hint">No feedback yet. Use ✓ / ✗ in the log or tap a box.</p>';
}
function exportDataset() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const data = { app: 'safety-glass', version: 1, exported_at: new Date().toISOString(), model: aiCfg.model,
    box_format: 'normalized [x,y,w,h] in full frame; thumbnail = padded 15% crop, JPEG data URL', entries: feedback };
  download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `safety-feedback-${stamp}.json`);
  const cols = ['timestamp', 'label', 'hazard_id', 'severity', 'defect', 'source', 'category', 'verdict', 'note', 'box', 'has_thumbnail'];
  const rows = feedback.map((e) => [e.timestamp, e.label, e.hazard_id, e.severity, e.defect, e.source, e.category, e.verdict, e.note, e.box ? e.box.map((v) => v.toFixed(4)).join(' ') : '', e.thumbnail ? 'yes' : 'no']);
  setTimeout(() => download(new Blob([[cols, ...rows].map((r) => r.map(csvEsc).join(',')).join('\n')], { type: 'text/csv' }), `safety-feedback-${stamp}.csv`), 400);
}
$('fbBtn').onclick = () => { renderFeedback(); $('feedbackPanel').hidden = false; };
$('fbClose').onclick = () => { $('feedbackPanel').hidden = true; };
$('fbExport').onclick = exportDataset;
$('fbClear').onclick = () => { if (confirm('Delete all ' + feedback.length + ' feedback entries?')) { feedback = []; saveFb(); renderFeedback(); } };

/* ================= Hazard Library panel ================= */
function renderLibrary(q) {
  const L = window.HAZARD_LIBRARY; q = (q || '').toLowerCase().trim();
  const groups = {};
  for (const h of L.all) {
    const hay = [h.id, h.name, h.category, h.control, ...(h.cues || []), ...(h.defects || [])].join(' ').toLowerCase();
    if (q && !hay.includes(q)) continue;
    (groups[h.category] = groups[h.category] || []).push(h);
  }
  $('libList').innerHTML = Object.keys(groups).map((cat) => '<div class="lib-cat"><h3>' + esc(cat) + ' (' + groups[cat].length + ')</h3>' +
    groups[cat].map((h) => '<div class="lib-item"><span class="sev ' + h.severity + '">' + h.severity + '</span> <b>' + esc(h.name) + '</b> <code>' + esc(h.id) + '</code><br>' +
      '<i>Look for:</i> ' + esc((h.cues || []).join('; ')) + '<br><i>Control:</i> ' + esc(h.control) +
      (h.defects ? '<br><i>Defect checks:</i> ' + esc(h.defects.join('; ')) : '') +
      '<br><a href="' + esc(h.source) + '" target="_blank" rel="noopener">HSE source</a></div>').join('') + '</div>').join('') || '<p>No matches.</p>';
}
$('libBtn').onclick = () => { $('libDisclaimer').textContent = window.HAZARD_LIBRARY.disclaimer; renderLibrary($('libSearch').value); $('library').hidden = false; };
$('libClose').onclick = () => { $('library').hidden = true; };
$('libSearch').oninput = (e) => renderLibrary(e.target.value);

scheduleAI();

/* ================= Custom YOLO model (TF.js export of Ultralytics YOLOv8/YOLO11) ================= */
// Expects ./models/safety-yolo/model.json (+ shards), classes.json (or metadata.yaml) and classes_map.json.
const YOLO_DIR = './models/safety-yolo/', YOLO_CONF = 0.4, YOLO_IOU = 0.45, YOLO_MAX = 30;
const yolo = { model: null, loading: false, failed: false, names: [], map: {}, size: 640 };
function updateModeStatus() {
  if (!sourceActive('CUSTOM')) { if (!sourceActive('COCO') && !sourceActive('AI')) return; $('status').textContent = paused ? 'Paused' : stream ? 'Scanning…' : 'Ready – tap Start camera'; return; }
  if (yolo.failed) $('status').textContent = 'Custom model not found / failed: ' + yolo.failed + ' – see models/safety-yolo/README.txt';
  else if (yolo.model) $('status').textContent = `Custom model ready (${yolo.names.length} classes)` + (stream ? ' – scanning…' : ' – tap Start camera');
  else { $('status').textContent = 'Loading custom model…'; loadCustomModel(); }
}
async function loadCustomModel() {
  if (yolo.loading || yolo.model || yolo.failed) return;
  yolo.loading = true;
  try {
    const head = await fetch(YOLO_DIR + 'model.json', { cache: 'no-cache' });
    if (!head.ok) throw new Error('model.json missing (HTTP ' + head.status + ')');
    let names = null;
    try { const r = await fetch(YOLO_DIR + 'classes.json', { cache: 'no-cache' }); if (r.ok) names = await r.json(); } catch (e) { /* fall back */ }
    if (!Array.isArray(names)) {
      const r = await fetch(YOLO_DIR + 'metadata.yaml', { cache: 'no-cache' });
      if (r.ok) { // parse "names:\n  0: foo" block of the Ultralytics metadata.yaml
        const txt = await r.text(), blk = txt.split(/\nnames:\s*\n/)[1] || ''; names = [];
        for (const line of blk.split('\n')) { const m = /^\s+(\d+):\s*['"]?(.*?)['"]?\s*$/.exec(line); if (!m) break; names[+m[1]] = m[2]; }
        const sz = /imgsz:\s*\n\s*-\s*(\d+)/.exec(txt); if (sz) yolo.size = +sz[1];
      }
    }
    if (!Array.isArray(names) || !names.length) throw new Error('classes.json / metadata.yaml missing');
    try { const r = await fetch(YOLO_DIR + 'classes_map.json', { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); yolo.map = j.classes || j; } } catch (e) { /* optional */ }
    yolo.names = names;
    const m = await tf.loadGraphModel(YOLO_DIR + 'model.json');
    const shp = m.inputs && m.inputs[0] && m.inputs[0].shape; if (shp && shp[1] > 0) yolo.size = shp[1];
    tf.tidy(() => { const o = m.execute(tf.zeros([1, yolo.size, yolo.size, 3])); (Array.isArray(o) ? o : [o]).forEach((t) => t.dispose()); }); // warm-up
    yolo.model = m;
  } catch (e) { console.warn('Custom model:', e); yolo.failed = e.message || String(e); }
  yolo.loading = false;
  updateModeStatus();
}
function yoloMeta(cls) {
  const name = yolo.names[cls] || 'class_' + cls, m = yolo.map[name] || {};
  const ghsM = /^ghs0?([1-9])$/i.exec(name), L = window.HAZARD_LIBRARY;
  const hid = m.hazard_id || (ghsM ? 'GHS0' + ghsM[1] : null), h = hid && L && L.byId[hid];
  return { label: m.label || (h ? h.name : name.replace(/_/g, ' ')), hazard_id: hid, severity: m.severity || (h ? h.severity : 'MEDIUM'),
    defect: m.defect || null, ghs: m.ghs || (ghsM ? 'GHS0' + ghsM[1] : null), category: m.category || (h ? h.category : 'Custom'),
    action: h ? h.control || '' : '', cls: name };
}
async function yoloDetect(src) {
  const W = src.videoWidth || src.width, H = src.videoHeight || src.height, S = yolo.size;
  const r = Math.min(S / W, S / H), nw = Math.round(W * r), nh = Math.round(H * r), px = Math.floor((S - nw) / 2), py = Math.floor((S - nh) / 2);
  const [boxes, scores, classes] = tf.tidy(() => {
    const img = tf.image.resizeBilinear(tf.browser.fromPixels(src).toFloat(), [nh, nw]).div(255); // letterbox, grey 114 padding
    const inp = img.pad([[py, S - nh - py], [px, S - nw - px], [0, 0]], 114 / 255).expandDims(0);
    let out = yolo.model.execute(inp); if (Array.isArray(out)) out = out[0];
    let p = out.squeeze([0]); // [4+nc, N] (Ultralytics) – transpose if exported as [N, 4+nc]
    if (p.shape[0] > p.shape[1]) p = p.transpose();
    p = p.transpose(); // [N, 4+nc]
    const xywh = p.slice([0, 0], [-1, 4]), cls = p.slice([0, 4], [-1, -1]);
    const sc = cls.max(1), ci = cls.argMax(1);
    const [cx, cy, w, h] = tf.split(xywh, 4, 1);
    const b = tf.concat([cy.sub(h.div(2)), cx.sub(w.div(2)), cy.add(h.div(2)), cx.add(w.div(2))], 1); // y1,x1,y2,x2 for NMS
    return [b, sc, ci];
  });
  let keep;
  try { keep = await tf.image.nonMaxSuppressionAsync(boxes, scores, YOLO_MAX, YOLO_IOU, YOLO_CONF); }
  catch (e) { tf.dispose([boxes, scores, classes]); throw e; }
  const idx = await keep.array(), bArr = await boxes.array(), sArr = await scores.array(), cArr = await classes.array();
  tf.dispose([boxes, scores, classes, keep]);
  const coordScale = bArr.length && Math.max(...idx.map((i) => bArr[i][3])) <= 1.5 ? S : 1; // some exports give normalized coords
  return idx.map((i) => {
    const [y1, x1, y2, x2] = bArr[i].map((v) => v * coordScale);
    const fx = Math.max(0, (x1 - px) / r), fy = Math.max(0, (y1 - py) / r), fx2 = Math.min(W, (x2 - px) / r), fy2 = Math.min(H, (y2 - py) / r);
    return Object.assign(yoloMeta(cArr[i]), { score: sArr[i], box: [fx / W, fy / H, Math.max(0, fx2 - fx) / W, Math.max(0, fy2 - fy) / H] });
  }).filter((d) => d.box[2] > 0.005 && d.box[3] > 0.005);
}
if (sourceActive('CUSTOM')) updateModeStatus();

// Merged app: open library directly via hazard.html#library
if(location.hash==='#library')setTimeout(()=>$('libBtn').click(),300);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
