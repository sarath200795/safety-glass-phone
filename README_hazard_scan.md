# Safety Glass (v2)

Browser app for hazard spotting with a laptop/phone camera. Two detectors:

- **COCO** – fast, offline-ish TensorFlow.js COCO-SSD (generic objects only; often wrong for safety work).
- **AI Hazard Scan** – sends a frame every N seconds to a local vision model in **LM Studio** (default `google/gemma-4-e4b`) with a prompt built from the HSE-based **hazard library** (`hazards.js`). It reports hazards, **GHS pictograms**, **fire-fighting equipment & defects** and **emergency equipment & defects**, with boxes coloured by severity.
- **Custom** – your own YOLO detector (fire-fighting/emergency equipment, GHS pictograms, defects) trained with `training/` and exported to TF.js in `models/safety-yolo/`. Runs fully in the browser; feeds the same tracking, confirmation, close-up and feedback flow. If no model is present, the status bar says so.
- **Mode**: COCO / AI / Both / Custom / Custom+AI (selector in the controls bar; saved in the browser).

**Train your own model:** see [`training/README.md`](training/README.md) (photos → Roboflow labels → free Google Colab → TF.js → `models/safety-yolo/`). No local Python needed.

Files: `index.html`, `style.css`, `app.js`, `hazards.js` (library, `window.HAZARD_LIBRARY`), `README.md`.

> Camera needs **HTTPS or `localhost`**. Opening `index.html` as file:// will not work. Internet is needed on first load (TF.js CDN).

## Run on the laptop (Node is installed, Python is not needed)
```
cd safety-glass
npx http-server -p 8000 -c-1
```
Open http://localhost:8000 in Chrome/Edge → **Start camera** → allow access.

## LM Studio setup (AI Hazard Scan)
1. Install LM Studio, search and download **google/gemma-4-e4b** (vision-capable) and **load** it.
2. Go to **Developer** (Local Server) → enable **CORS** → **Start server** on port **1234**.
3. In Safety Glass → **Settings**: URL `http://localhost:1234/v1/chat/completions`, model `google/gemma-4-e4b`, interval (default 4 s), image width (default 640 px) → **Test connection**.
4. Status badge (top-left): green = connected, blue = thinking, red = error with a hint (e.g. "start LM Studio server with CORS enabled"). Requests never overlap; if the model is slow, the effective interval is longer.
   Model id must match exactly what LM Studio lists (Test connection shows available ids).

## Phone use
- Phone camera needs HTTPS: use `cloudflared tunnel --url http://localhost:8000` (or `ngrok http 8000`) and open the https link.
- For the phone to reach the laptop's LM Studio: enable **"Serve on Local Network"** in LM Studio, then set the Settings URL to `http://<laptop-LAN-IP>:1234/v1/chat/completions` (find IP with `ipconfig`). Note: a page served over HTTPS may be blocked by the browser from calling a plain-http LAN address (mixed content). Options: open the app on the phone through a tunnel that also exposes LM Studio over HTTPS (e.g. a second `cloudflared tunnel --url http://localhost:1234` and use that https URL + `/v1/chat/completions`), or run the AI mode on the laptop only.
- Both devices must be on the same Wi-Fi for LAN access; allow port 1234 in Windows Firewall.

## Hazard Library
**Hazard Library** button → searchable list with severity, visual cues, controls, defect checklists and HSE source links. Content: 11 hazard categories (45 hazards), 9 GHS pictograms, 12 fire-fighting equipment items, 9 emergency equipment items.

## Controls
Pause/Resume · Snapshot report (PNG + log row) · Download CSV (columns: timestamp, level, hazard, confidence, source, category, defect, ghs, action) · Beep / Voice alerts (same hazard max every 8 s, voice every 5 s) · Show all objects (also shows non-defective equipment from AI).

## Close-up defect check (two-stage)
After each scan pass, up to **2** boxed findings (fire-fighting/emergency equipment first; COCO findings only once confirmed) are cropped from the frame that was scanned (+15% padding, upscaled to 512 px) and sent to the vision model with **only that item's defect checklist** (from `hazards.js`). The model returns `{item, defects:[{defect,present,confidence,evidence}], overall: OK|DEFECT|UNSURE}`; defects with present=true and confidence ≥ 0.5 replace the coarse defect on the label (🔍 = pending, "✓close-up OK", "?close-up"). Requests never overlap with each other or the main scan; the queue holds ≤ 4 jobs, drops jobs older than 20 s, and an item is re-checked at most every 30 s. Toggle: **Settings → Close-up defect check** (default on). Non-equipment hazards get a "is this genuinely present?" check instead.

## Multi-frame confirmation
Findings are tracked by `hazard_id` (or label) + box IoU > 0.3. A track becomes **CONFIRMED** (solid box, beep/voice, log entry) only after N recent sightings (one missed cycle allowed): default **2 AI scans** / **3 COCO frames** (Settings). Unconfirmed tracks are dashed thin boxes "checking…". Tracks unseen for 3 AI scans / 10 COCO frames are dropped.

## Feedback & dataset
Every log entry has **✓ / ✗**; tap/click a confirmed box for a popup with ✓ Correct / ✗ Wrong + optional note. Entries (timestamp, label, hazard_id, severity, defect, source, category, box, verdict, note, 256 px JPEG thumbnail) are stored in localStorage (max 300; oldest dropped on quota). **Feedback** panel: counts per label, entries, **Export dataset** (JSON with thumbnails + CSV summary), **Clear**.
Feedback is used: a label marked Wrong ≥ 3 times (and more often wrong than correct) is suppressed (Settings toggle), and up to 5 recent "wrong" labels are added to the AI prompt as common false positives to avoid.

## Caveats
Assistive tool only – not a substitute for a competent inspection or risk assessment. HSE guidance is UK; check Indian requirements (Factories Act/state rules, NBC 2016 Part 4, IS 2190 for extinguishers, IS 15683). Extinguisher colour bands follow UK/EN 3 convention; Indian extinguishers may be fully red with different labels. Small vision models can hallucinate or mis-place boxes; things like pressure-gauge needle position or tag dates need a close, sharp view.
