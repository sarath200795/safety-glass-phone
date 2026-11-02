/**
 * Safety Glass – phone corrections uploader (Google Apps Script web app).
 * Receives POST {filename, label, meta, image(base64 JPEG)} from the PWA and saves
 * the JPEG + a .json sidecar into  My Drive/Safety Glass/phone_corrections/<label>/
 * Also receives audit-session files: POST {type:'session_file', folder, name, mime, text|data(base64)}
 * saved into  My Drive/Safety Glass/audit_sessions/<folder>/  (same file name overwrites).
 * Deploy: Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 */
// Optional: paste the id of an existing 'phone_corrections' folder here. Leave '' to find/create by path.
var ROOT_FOLDER_ID = '';
var ROOT_PATH = ['Safety Glass', 'phone_corrections'];
var ALLOWED = ['ok','defect_electrical','defect_equipment','defect_facility','defect_fire','defect_physical','defect_signage'];

var SESSION_PATH = ['Safety Glass', 'audit_sessions'];
function session_(d) {
  var f = DriveApp.getRootFolder();
  SESSION_PATH.forEach(function (n) { f = child_(f, n); });
  var folder = child_(f, String(d.folder || 'unnamed').replace(/[\\/]/g, '_').slice(0, 120));
  var name = String(d.name || 'file').replace(/[\\/]/g, '_');
  var old = folder.getFilesByName(name); while (old.hasNext()) old.next().setTrashed(true);
  var blob = d.data != null ? Utilities.newBlob(Utilities.base64Decode(d.data), d.mime || 'application/octet-stream', name)
                            : Utilities.newBlob(String(d.text || ''), d.mime || 'text/plain', name);
  var file = folder.createFile(blob);
  return json_({ok: true, id: file.getId(), url: file.getUrl(), folder: folder.getUrl()});
}
function child_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function root_() {
  if (ROOT_FOLDER_ID) return DriveApp.getFolderById(ROOT_FOLDER_ID);
  var f = DriveApp.getRootFolder();
  ROOT_PATH.forEach(function (n) { f = child_(f, n); });
  return f;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);   // avoid duplicate folders on parallel uploads
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.type === 'session_file') return session_(d);
    if (ALLOWED.indexOf(d.label) < 0) return json_({ok: false, error: 'bad label ' + d.label});
    var folder = child_(root_(), d.label);
    var name = String(d.filename || (new Date().toISOString() + '_' + d.label + '.jpg')).replace(/[\\/]/g, '_');
    var blob = Utilities.newBlob(Utilities.base64Decode(d.image), 'image/jpeg', name);
    var file = folder.createFile(blob);
    file.setDescription(JSON.stringify(d.meta || {}));
    folder.createFile(name.replace(/\.jpg$/i, '.json'), JSON.stringify(d.meta || {}, null, 2), 'application/json');
    return json_({ok: true, id: file.getId(), url: file.getUrl()});
  } catch (err) {
    return json_({ok: false, error: String(err)});
  } finally { lock.releaseLock(); }
}
function doGet() { return json_({ok: true, service: 'Safety Glass uploader', folder: root_().getUrl()}); }
// Run once from the editor to authorize and create the folders.
function setup() { Logger.log(root_().getUrl()); }
