# Safety Glass (merged app)

One app, three camera modes (switch with **☰ Modes** on the main screen or the buttons on each page):

| Page | What it does |
|---|---|
| `index.html` – **Defect check & Audit** | onnxruntime-web: `gate.onnx` (equipment present), `binary.onnx` (v5 defect/ok), `model.onnx` (v4 category), two-stage rule, stable frames, dark/blur checks, sliders, corrections/training uploads (Apps Script `apps_script/Code.gs`), audit sessions (site, Record DEFECT / NO DEFECT, live dashboard, score, HTML/PDF/CSV report, Drive upload, IndexedDB). |
| `hazard.html` – **Hazard scan** (original Safety Glass) | HSE hazard library (`hazards.js`), COCO-SSD, LM Studio vision AI (Gemma, optional – shows an error badge if LM Studio is not reachable), Custom YOLO (`models/safety-yolo/`, laptop only), close-up defect check, multi-frame confirmation, feedback dataset, snapshot/CSV. Full docs: `README_hazard_scan.md`. `hazard.html#library` opens the Hazard Library. |
| `analytics.html` – **Audit analytics** | All IndexedDB sessions: totals, % defect trend, category bar/donut, top categories, site comparison, site/date filters, CSV export (Chart.js bundled locally). |
| `ghs.html` – **GHS / First aid** | YOLO11n detector `det_ghs_firstaid.onnx` (9 GHS pictograms, first-aid items, chemical/expiry labels) drawing boxes; ~0.3 s/frame on WASM. |

Laptop: double-click `Start_Safety_Glass.bat` (Python 3.11 `http.server` on http://localhost:8000). Phone: https://sarath200795.github.io/safety-glass-phone/ (installable PWA, works offline after first load except the COCO/TF.js CDN in Hazard scan).
Assistive tool only – not a substitute for a competent inspection (Indian standards: Factories Act, NBC 2016 Part 4, IS 2190, IS 15683).
