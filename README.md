# Safety Glass – phone scanner (PWA)
Live camera classifier (v4 YOLO11n-cls, onnxruntime-web/wasm) with Confirm-correct / Correct buttons that upload labelled photos to Google Drive via an Apps Script web app.

## Apps Script setup (once)
1. Open https://script.google.com > New project. Name it "Safety Glass uploader".
2. Replace Code.gs with `apps_script/Code.gs` from this repo. Save.
3. Select function `setup` > Run > approve permissions (Advanced > Go to project if warned). This creates My Drive/Safety Glass/phone_corrections.
4. Deploy > New deployment > gear > Web app. Execute as: **Me**. Who has access: **Anyone**. Deploy.
5. Copy the Web app URL (ends in /exec). On the phone, open the app > ⚙ > paste URL > Save.
(After editing Code.gs later: Deploy > Manage deployments > Edit > Version: New version, so the URL stays the same.)

## Use
Open the site in Chrome on Android > Start camera > allow. Menu ⋮ > Add to Home screen.
Green border = OK (p(ok) ≥ 0.6), red = top defect; smoothed over 5 inferences, every 3rd frame.
Confirm correct = save frame with the model's label. Correct = pick true label (model's guess highlighted in yellow), optional note.
Photos queue in IndexedDB and upload when online (retry every 60 s or via ⚙ > Retry).
Each upload: `<timestamp>_true-<label>_pred-<label>.jpg` + `.json` sidecar (true/pred label, confidence, probs, timestamp, note).

## Audit sessions (v8)
Start audit → site name (recent sites remembered) + optional auditor → camera runs; tap **Record DEFECT / Record NO DEFECT** to log an observation (category + note editable). Live dashboard panel (tap header to expand). **End** → compliance score (= % no-defect), category breakdown, defect list; download HTML/PDF/CSV, Share, or Upload to Drive (`Safety Glass/audit_sessions/<site>_<date>/`, needs the updated Apps Script redeployed). Sessions are kept in IndexedDB and unfinished ones can be resumed. Training buttons: ⚙ → Training mode.
