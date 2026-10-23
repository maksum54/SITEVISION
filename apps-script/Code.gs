/**
 * Site Survey — backend Google Apps Script.
 *
 * Menggantikan Firestore + Cloudinary:
 *   - Data (users, projects, plans, pins, categories) disimpan di Google Sheets
 *     (spreadsheet tempat script ini di-bind).
 *   - Gambar denah & foto temuan disimpan di Google Drive.
 *   - Export laporan ke file Excel (.xlsx).
 *
 * Login memakai akun Google ("Masuk dengan Google"): aplikasi mengirim ID token
 * Google, script ini memverifikasinya ke server Google, lalu membuat token sesi
 * yang disimpan (dalam bentuk hash) di sheet "sessions". Tidak ada password.
 *
 * Cara pasang: lihat README.md bagian "Setup Google Apps Script".
 */

// Versi kode — buka URL Web App (/exec) di browser untuk mengecek versi yang sedang aktif.
var CODE_VERSION = '4-fast';

// ====== KONFIGURASI ======
// OAuth Client ID (Web application) dari Google Cloud Console.
// Harus sama dengan VITE_GOOGLE_CLIENT_ID di aplikasi. Bisa juga diisi lewat
// Project Settings → Script properties dengan nama GOOGLE_CLIENT_ID.
var GOOGLE_CLIENT_ID = '240395032173-vi789j2m350igme7j849r72v5s2vghoa.apps.googleusercontent.com';
// Lama sesi login (hari).
var SESSION_DAYS = 30;
// Nama folder root di Google Drive untuk menyimpan foto & denah.
var DRIVE_ROOT_FOLDER_NAME = 'Site Survey';
// Email yang otomatis jadi admin (opsional). User pertama yang login juga otomatis admin.
var ADMIN_EMAILS = [];
// Batasi siapa yang boleh masuk (opsional). Kosong = semua akun Google boleh.
// Contoh: ALLOWED_DOMAINS = ['perusahaan.co.id']; ALLOWED_EMAILS = ['budi@gmail.com'];
var ALLOWED_DOMAINS = [];
var ALLOWED_EMAILS = [];
// ==========================

var SCHEMA = {
  users: ['id', 'email', 'displayName', 'role', 'banned', 'createdAt', 'googleSub', 'picture'],
  sessions: ['id', 'userId', 'createdAt', 'expiresAt'],
  projects: ['id', 'name', 'createdBy', 'memberUids', 'createdAt'],
  plans: ['id', 'projectId', 'name', 'imageFileId', 'imageURL', 'imageWidth', 'imageHeight', 'createdBy', 'createdAt'],
  pins: ['id', 'projectId', 'planId', 'x', 'y', 'status', 'category', 'notes', 'photoFileId', 'photoURL',
    'createdBy', 'createdByName', 'createdAt', 'updatedAt'],
  categories: ['id', 'name', 'color', 'createdAt'],
};

var NUMBER_FIELDS = { x: 1, y: 1, imageWidth: 1, imageHeight: 1, createdAt: 1, updatedAt: 1, expiresAt: 1 };
var BOOL_FIELDS = { banned: 1 };
var JSON_FIELDS = { memberUids: 1 };

var DEFAULT_CATEGORIES = [
  { id: 'default-structural', name: 'Structural', color: '#2563eb' },
  { id: 'default-electrical', name: 'Electrical', color: '#eab308' },
  { id: 'default-plumbing', name: 'Plumbing', color: '#0891b2' },
  { id: 'default-finishing', name: 'Finishing', color: '#9333ea' },
  { id: 'default-other', name: 'Other', color: '#6b7280' },
];

var PIN_STATUSES = ['open', 'in_progress', 'done'];
var STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', done: 'Done' };

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function doGet() {
  return json_({ ok: true, service: 'site-survey', version: CODE_VERSION, login: 'google', time: new Date().toISOString() });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var publicHandler = PUBLIC_ACTIONS[body.action];
    if (publicHandler) return json_({ ok: true, data: publicHandler(body.payload || {}) });
    if (body.action === 'batch') return json_({ ok: true, data: runBatch_(body) });
    var handler = ACTIONS[body.action];
    if (!handler) throw httpError_(400, 'Unknown action: ' + body.action);
    var me = authenticate_(body.token);
    var data = handler(me, body.payload || {}, body.token);
    return json_({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    return json_({ ok: false, status: err.status || 500, error: String(err.message || err) });
  }
}

/**
 * Beberapa action sekaligus dalam satu request (aplikasi menggabungkan request
 * yang terjadi bersamaan), supaya tidak perlu bolak-balik ke server berkali-kali.
 */
function runBatch_(body) {
  var me = authenticate_(body.token);
  return (body.calls || []).slice(0, 20).map(function (call) {
    try {
      var handler = ACTIONS[call.action];
      if (!handler || call.action === 'logout') throw httpError_(400, 'Unknown action: ' + call.action);
      var data = handler(me, call.payload || {}, body.token);
      return { ok: true, data: data === undefined ? null : data };
    } catch (err) {
      return { ok: false, status: err.status || 500, error: String(err.message || err) };
    }
  });
}

/** Jalankan dari editor Apps Script setelah mengedit data langsung di spreadsheet. */
function clearCache() {
  Object.keys(SCHEMA).forEach(invalidate_);
  Logger.log('Cache dikosongkan.');
}

/** Jalankan sekali dari editor Apps Script untuk membuat sheet & folder serta memberi izin. */
function setup() {
  Object.keys(SCHEMA).forEach(function (name) { getSheet_(name); });
  seedCategories_();
  getFolder_('plans');
  getFolder_('photos');
  Logger.log('Spreadsheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  Logger.log('Folder Drive: ' + getRootFolder_().getUrl());
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

// Action tanpa login
var PUBLIC_ACTIONS = {
  loginGoogle: function (p) {
    var g = verifyGoogleIdToken_(p.credential);
    var email = g.email.toLowerCase();
    if (!isEmailAllowed_(email)) throw httpError_(403, 'NOT_ALLOWED');
    var user = withLock_(function () {
      var existing = findUserByEmail_(email);
      if (existing) {
        if (existing.banned) throw httpError_(403, 'BANNED');
        return update_('users', existing.id, {
          googleSub: g.sub,
          picture: g.picture || '',
          displayName: g.name || existing.displayName,
        });
      }
      var isFirst = readAll_('users').length === 0;
      return insert_('users', {
        id: newId_(),
        email: email,
        displayName: g.name || email.split('@')[0],
        role: isFirst || ADMIN_EMAILS.indexOf(email) !== -1 ? 'admin' : 'member',
        banned: false,
        createdAt: Date.now(),
        googleSub: g.sub,
        picture: g.picture || '',
      });
    });
    return { token: createSession_(user.id), user: publicUser_(user) };
  },
};

var ACTIONS = {
  me: function (me) {
    return me;
  },
  logout: function (me, p, token) {
    var id = hashToken_(token);
    CacheService.getScriptCache().remove('sess_' + id);
    withLock_(function () { remove_('sessions', id); });
  },

  // ----- Projects -----
  listProjects: function (me) {
    return readAll_('projects')
      .filter(function (p) { return p.memberUids.indexOf(me.id) !== -1; })
      .sort(byDesc_('createdAt'));
  },
  createProject: function (me, p) {
    var name = requireText_(p.name, 'name');
    var id = clientId_(p.id);
    return withLock_(function () {
      var existing = findById_('projects', id);
      if (existing) {
        if (existing.createdBy !== me.id) throw httpError_(409, 'Conflict');
        return existing; // idempotent saat dikirim ulang
      }
      return insert_('projects', {
        id: id, name: name, createdBy: me.id, memberUids: [me.id], createdAt: Date.now(),
      });
    });
  },
  deleteProject: function (me, p) {
    var project = requireProjectAccess_(me, p.projectId);
    if (project.createdBy !== me.id && me.role !== 'admin') throw httpError_(403, 'Forbidden');
    withLock_(function () { remove_('projects', project.id); });
  },

  // ----- Plans -----
  listPlans: function (me, p) {
    requireProjectAccess_(me, p.projectId);
    return readAll_('plans')
      .filter(function (r) { return r.projectId === p.projectId; })
      .sort(byDesc_('createdAt'));
  },
  getPlan: function (me, p) {
    requireProjectAccess_(me, p.projectId);
    var plan = findById_('plans', p.planId);
    if (!plan || plan.projectId !== p.projectId) throw httpError_(404, 'Plan not found');
    return plan;
  },
  uploadPlan: function (me, p) {
    requireProjectAccess_(me, p.projectId);
    var name = requireText_(p.name, 'name');
    var id = clientId_(p.id);
    if (findById_('plans', id)) throw httpError_(409, 'Conflict');
    var file = saveImage_('plans', 'plan-' + id + '-' + (p.fileName || 'plan'), p.mimeType, p.base64);
    return withLock_(function () {
      return insert_('plans', {
        id: id,
        projectId: p.projectId,
        name: name,
        imageFileId: file.getId(),
        imageURL: imageUrl_(file.getId()),
        imageWidth: Number(p.width) || 0,
        imageHeight: Number(p.height) || 0,
        createdBy: me.id,
        createdAt: Date.now(),
      });
    });
  },
  deletePlan: function (me, p) {
    requireProjectAccess_(me, p.projectId);
    withLock_(function () { remove_('plans', p.planId); });
  },

  // ----- Pins -----
  listPins: function (me, p) {
    requireProjectAccess_(me, p.projectId);
    return readAll_('pins')
      .filter(function (r) { return r.projectId === p.projectId && r.planId === p.planId; })
      .sort(byAsc_('createdAt'));
  },
  createPin: function (me, p) {
    requireProjectAccess_(me, p.projectId);
    var id = clientId_(p.id);
    return withLock_(function () {
      var existing = findById_('pins', id);
      if (existing) return existing; // idempotent saat sinkronisasi ulang
      var now = Date.now();
      return insert_('pins', {
        id: id,
        projectId: p.projectId,
        planId: p.planId,
        x: clamp01_(p.x),
        y: clamp01_(p.y),
        status: 'open',
        category: 'Other',
        notes: '',
        photoFileId: '',
        photoURL: '',
        createdBy: me.id,
        createdByName: me.email,
        createdAt: Number(p.createdAt) || now,
        updatedAt: now,
      });
    });
  },
  updatePin: function (me, p) {
    requireProjectAccess_(me, p.projectId);
    var patch = {};
    var src = p.patch || {};
    if (src.status !== undefined) {
      if (PIN_STATUSES.indexOf(src.status) === -1) throw httpError_(400, 'Invalid status');
      patch.status = src.status;
    }
    if (src.category !== undefined) patch.category = String(src.category);
    if (src.notes !== undefined) patch.notes = String(src.notes);
    patch.updatedAt = Date.now();
    return withLock_(function () { return update_('pins', p.pinId, patch); });
  },
  deletePin: function (me, p) {
    requireProjectAccess_(me, p.projectId);
    withLock_(function () {
      var pin = findById_('pins', p.pinId);
      if (!pin) return;
      trashFile_(pin.photoFileId);
      remove_('pins', pin.id);
    });
  },
  uploadPinPhoto: function (me, p) {
    requireProjectAccess_(me, p.projectId);
    var pin = findById_('pins', p.pinId);
    if (!pin) throw httpError_(404, 'Pin not found');
    var file = saveImage_('photos', 'pin-' + pin.id + '-' + (p.fileName || 'photo.jpg'), p.mimeType, p.base64);
    return withLock_(function () {
      var current = findById_('pins', pin.id);
      if (current && current.photoFileId) trashFile_(current.photoFileId);
      return update_('pins', pin.id, {
        photoFileId: file.getId(),
        photoURL: imageUrl_(file.getId()),
        updatedAt: Date.now(),
      });
    });
  },

  // ----- Categories -----
  listCategories: function () {
    seedCategories_();
    return readAll_('categories').sort(function (a, b) { return a.name.localeCompare(b.name); });
  },
  createCategory: function (me, p) {
    requireAdmin_(me);
    var name = requireText_(p.name, 'name');
    return withLock_(function () {
      return insert_('categories', { id: newId_(), name: name, color: String(p.color || '#6b7280'), createdAt: Date.now() });
    });
  },
  updateCategory: function (me, p) {
    requireAdmin_(me);
    var patch = {};
    if (p.patch && p.patch.name !== undefined) patch.name = requireText_(p.patch.name, 'name');
    if (p.patch && p.patch.color !== undefined) patch.color = String(p.patch.color);
    return withLock_(function () { return update_('categories', p.categoryId, patch); });
  },
  deleteCategory: function (me, p) {
    requireAdmin_(me);
    withLock_(function () { remove_('categories', p.categoryId); });
  },

  // ----- Admin -----
  adminListUsers: function (me) {
    requireAdmin_(me);
    return readAll_('users').filter(function (u) { return !u.banned; }).map(publicUser_).sort(byDesc_('createdAt'));
  },
  adminSetUserRole: function (me, p) {
    requireAdmin_(me);
    if (p.role !== 'admin' && p.role !== 'member') throw httpError_(400, 'Invalid role');
    return withLock_(function () { return publicUser_(update_('users', p.userId, { role: p.role })); });
  },
  adminBanUser: function (me, p) {
    requireAdmin_(me);
    if (p.userId === me.id) throw httpError_(400, 'Tidak bisa menghapus akun sendiri');
    withLock_(function () {
      update_('users', p.userId, { banned: true, role: 'member' });
      removeSessionsOf_(p.userId);
    });
  },
  adminListProjects: function (me) {
    requireAdmin_(me);
    return readAll_('projects').sort(byDesc_('createdAt'));
  },
  adminRenameProject: function (me, p) {
    requireAdmin_(me);
    var name = requireText_(p.name, 'name');
    return withLock_(function () { return update_('projects', p.projectId, { name: name }); });
  },
  adminDeleteProject: function (me, p) {
    requireAdmin_(me);
    withLock_(function () { remove_('projects', p.projectId); });
  },
  adminListPhotos: function (me) {
    requireAdmin_(me);
    return readAll_('pins').filter(function (r) { return !!r.photoURL; }).sort(byDesc_('createdAt'));
  },
  adminDeletePhoto: function (me, p) {
    requireAdmin_(me);
    return withLock_(function () {
      var pin = findById_('pins', p.pinId);
      if (!pin) throw httpError_(404, 'Pin not found');
      trashFile_(pin.photoFileId);
      return update_('pins', pin.id, { photoFileId: '', photoURL: '', updatedAt: Date.now() });
    });
  },
  adminStorageStats: function (me) {
    requireAdmin_(me);
    var folder = getRootFolder_();
    var stats = { files: 0, bytes: 0 };
    countFolder_(folder, stats);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return {
      driveUsed: DriveApp.getStorageUsed(),
      driveLimit: DriveApp.getStorageLimit(),
      appFiles: stats.files,
      appBytes: stats.bytes,
      folderUrl: folder.getUrl(),
      spreadsheetUrl: ss.getUrl(),
      users: readAll_('users').filter(function (u) { return !u.banned; }).length,
      projects: readAll_('projects').length,
      plans: readAll_('plans').length,
      pins: readAll_('pins').length,
      photos: readAll_('pins').filter(function (r) { return !!r.photoURL; }).length,
      lastUpdated: Date.now(),
    };
  },

  // ----- Excel -----
  exportExcel: function (me, p) {
    var projects = readAll_('projects');
    var allowed = projects.filter(function (pr) {
      return me.role === 'admin' || pr.memberUids.indexOf(me.id) !== -1;
    });
    if (p.projectId) {
      allowed = allowed.filter(function (pr) { return pr.id === p.projectId; });
      if (!allowed.length) throw httpError_(403, 'Forbidden');
    } else if (me.role !== 'admin') {
      throw httpError_(403, 'Forbidden');
    }
    return buildExcel_(allowed, p.planId || null);
  },
};

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

function buildExcel_(projects, planId) {
  var projectById = {};
  projects.forEach(function (pr) { projectById[pr.id] = pr; });
  var plans = readAll_('plans').filter(function (pl) {
    return projectById[pl.projectId] && (!planId || pl.id === planId);
  });
  var planById = {};
  plans.forEach(function (pl) { planById[pl.id] = pl; });
  var pins = readAll_('pins')
    .filter(function (pin) { return planById[pin.planId]; })
    .sort(function (a, b) {
      return a.projectId.localeCompare(b.projectId) || a.planId.localeCompare(b.planId) || a.createdAt - b.createdAt;
    });

  var tz = Session.getScriptTimeZone();
  var fmt = function (ms) { return ms ? Utilities.formatDate(new Date(ms), tz, 'yyyy-MM-dd HH:mm') : ''; };

  var tmp = SpreadsheetApp.create('Site Survey Export ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HHmm'));
  try {
    // Sheet 1: Punch List
    var sh = tmp.getSheets()[0];
    sh.setName('Punch List');
    var header = ['No', 'Proyek', 'Denah', 'Kategori', 'Status', 'Catatan', 'Dibuat oleh',
      'Dibuat', 'Diperbarui', 'Posisi X (%)', 'Posisi Y (%)', 'Foto'];
    var rows = pins.map(function (pin, i) {
      return [
        i + 1,
        projectById[pin.projectId].name,
        planById[pin.planId].name,
        pin.category,
        STATUS_LABELS[pin.status] || pin.status,
        pin.notes,
        pin.createdByName,
        fmt(pin.createdAt),
        fmt(pin.updatedAt),
        Math.round(pin.x * 1000) / 10,
        Math.round(pin.y * 1000) / 10,
        pin.photoFileId ? '=HYPERLINK("https://drive.google.com/file/d/' + pin.photoFileId + '/view","Lihat foto")' : '',
      ];
    });
    writeSheet_(sh, header, rows);

    // Sheet 2: Ringkasan per denah
    var sum = tmp.insertSheet('Ringkasan');
    var sumRows = plans.map(function (pl) {
      var own = pins.filter(function (pin) { return pin.planId === pl.id; });
      var count = function (s) { return own.filter(function (pin) { return pin.status === s; }).length; };
      return [projectById[pl.projectId].name, pl.name, own.length, count('open'), count('in_progress'), count('done')];
    });
    writeSheet_(sum, ['Proyek', 'Denah', 'Total Temuan', 'Open', 'In Progress', 'Done'], sumRows);

    SpreadsheetApp.flush();
    var url = 'https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx';
    var resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) throw httpError_(500, 'Export Excel gagal (' + resp.getResponseCode() + ')');

    var label = planId && plans[0] ? plans[0].name : projects.length === 1 ? projects[0].name : 'Semua';
    var fileName = 'Site-Survey_' + label.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '_' +
      Utilities.formatDate(new Date(), tz, 'yyyyMMdd-HHmm') + '.xlsx';
    return { fileName: fileName, base64: Utilities.base64Encode(resp.getBlob().getBytes()), rows: rows.length };
  } finally {
    DriveApp.getFileById(tmp.getId()).setTrashed(true);
  }
}

function writeSheet_(sheet, header, rows) {
  var values = [header].concat(rows.map(function (r) {
    return r.map(function (v) {
      return typeof v === 'string' && v.charAt(0) !== '=' ? safeText_(v) : v;
    });
  }));
  sheet.getRange(1, 1, values.length, header.length).setValues(values);
  sheet.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header.length);
}

// ---------------------------------------------------------------------------
// Auth & users
// ---------------------------------------------------------------------------

function googleClientId_() {
  return GOOGLE_CLIENT_ID || PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '';
}

/** Verifikasi ID token Google (dari tombol "Masuk dengan Google") ke server Google. */
function verifyGoogleIdToken_(credential) {
  var clientId = googleClientId_();
  if (!clientId) throw httpError_(500, 'GOOGLE_CLIENT_ID belum diisi di Code.gs');
  if (!credential) throw httpError_(400, 'INVALID_TOKEN');
  var resp = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
    { muteHttpExceptions: true }
  );
  if (resp.getResponseCode() !== 200) throw httpError_(401, 'INVALID_TOKEN');
  var info = JSON.parse(resp.getContentText());
  var validIssuer = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  var verified = info.email_verified === true || info.email_verified === 'true';
  if (info.aud !== clientId || !validIssuer || !verified || !info.email || Number(info.exp) * 1000 < Date.now()) {
    throw httpError_(401, 'INVALID_TOKEN');
  }
  return { sub: String(info.sub), email: String(info.email), name: info.name || '', picture: info.picture || '' };
}

function isEmailAllowed_(email) {
  if (!ALLOWED_DOMAINS.length && !ALLOWED_EMAILS.length) return true;
  if (ALLOWED_EMAILS.map(function (e) { return e.toLowerCase(); }).indexOf(email) !== -1) return true;
  if (ADMIN_EMAILS.map(function (e) { return e.toLowerCase(); }).indexOf(email) !== -1) return true;
  var domain = email.split('@')[1];
  return ALLOWED_DOMAINS.map(function (d) { return d.toLowerCase(); }).indexOf(domain) !== -1;
}

function findUserByEmail_(email) {
  return readAll_('users').filter(function (u) { return u.email.toLowerCase() === email; })[0] || null;
}

/** Data user yang aman dikirim ke aplikasi. */
function publicUser_(u) {
  return {
    id: u.id, email: u.email, displayName: u.displayName, picture: u.picture || '',
    role: u.role, banned: u.banned, createdAt: u.createdAt,
  };
}

function hashToken_(token) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token));
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function createSession_(userId) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  var now = Date.now();
  withLock_(function () {
    insert_('sessions', { id: hashToken_(token), userId: userId, createdAt: now, expiresAt: now + SESSION_DAYS * 86400000 });
  });
  return token;
}

function removeSessionsOf_(userId) {
  var cache = CacheService.getScriptCache();
  readAll_('sessions')
    .filter(function (s) { return s.userId === userId; })
    .forEach(function (s) {
      cache.remove('sess_' + s.id);
      remove_('sessions', s.id);
    });
}

/** Cek token sesi dan kembalikan user yang login. */
function authenticate_(token) {
  if (!token) throw httpError_(401, 'UNAUTHORIZED');
  var id = hashToken_(token);
  var cache = CacheService.getScriptCache();
  var userId = cache.get('sess_' + id);
  if (!userId) {
    var session = findById_('sessions', id);
    if (!session || session.expiresAt < Date.now()) throw httpError_(401, 'UNAUTHORIZED');
    userId = session.userId;
    cache.put('sess_' + id, userId, 600);
  }
  var user = findById_('users', userId);
  if (!user) throw httpError_(401, 'UNAUTHORIZED');
  if (user.banned) throw httpError_(403, 'BANNED');
  return publicUser_(user);
}

function requireAdmin_(me) {
  if (me.role !== 'admin') throw httpError_(403, 'Forbidden');
}

function requireProjectAccess_(me, projectId) {
  var project = findById_('projects', projectId);
  if (!project) throw httpError_(404, 'Project not found');
  if (me.role !== 'admin' && project.memberUids.indexOf(me.id) === -1) throw httpError_(403, 'Forbidden');
  return project;
}

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

function getRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DRIVE_ROOT_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder dihapus, buat ulang */ }
  }
  var folder = DriveApp.createFolder(DRIVE_ROOT_FOLDER_NAME);
  props.setProperty('DRIVE_ROOT_FOLDER_ID', folder.getId());
  return folder;
}

function getFolder_(name) {
  var root = getRootFolder_();
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function saveImage_(folderName, fileName, mimeType, base64) {
  if (!base64) throw httpError_(400, 'File kosong');
  var type = String(mimeType || 'image/jpeg');
  if (type.indexOf('image/') !== 0) throw httpError_(400, 'Hanya file gambar yang diizinkan');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), type, String(fileName).slice(0, 150));
  var file = getFolder_(folderName).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

function trashFile_(fileId) {
  if (!fileId) return;
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* sudah terhapus */ }
}

function imageUrl_(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w2000';
}

function countFolder_(folder, stats) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.isTrashed()) continue;
    stats.files++;
    stats.bytes += f.getSize();
  }
  var subs = folder.getFolders();
  while (subs.hasNext()) countFolder_(subs.next(), stats);
}

// ---------------------------------------------------------------------------
// Google Sheets "database"
// ---------------------------------------------------------------------------

var HEADERS_CHECKED = {};

function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  var headers = SCHEMA[name];
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (!HEADERS_CHECKED[name]) {
    // Sesuaikan header dengan versi terbaru; kosongkan kolom yang isinya berubah arti.
    var width = Math.max(sheet.getLastColumn(), headers.length);
    var current = sheet.getRange(1, 1, 1, width).getValues()[0];
    var last = sheet.getLastRow();
    for (var c = 0; c < width; c++) {
      var want = c < headers.length ? headers[c] : '';
      if (String(current[c]) === want) continue;
      if (last > 1 && current[c] !== '') sheet.getRange(2, c + 1, last - 1, 1).clearContent();
      sheet.getRange(1, c + 1).setValue(want).setFontWeight('bold');
      HEADERS_CHECKED[name] = true;
      invalidate_(name);
    }
  }
  HEADERS_CHECKED[name] = true;
  return sheet;
}

// ----- Cache tabel -----
// Isi setiap sheet disimpan sementara di CacheService supaya request baca tidak
// perlu membuka spreadsheet. Setiap penulisan mengganti "versi" tabel, sehingga
// cache lama otomatis tidak dipakai lagi. Di dalam lock (saat menulis) data
// selalu dibaca langsung dari sheet.
var CACHE_TTL = 21600; // 6 jam (maksimum CacheService)
var CACHE_CHUNK = 30000; // karakter per potongan (batas 100KB per key)
var TABLE_MEMO = {};
var IN_LOCK = false;

function tableVersion_(cache, name) {
  var key = 'tblver_' + name;
  var v = cache.get(key);
  if (!v) {
    v = newId_();
    cache.put(key, v, CACHE_TTL);
  }
  return v;
}

function invalidate_(name) {
  delete TABLE_MEMO[name];
  try {
    CacheService.getScriptCache().put('tblver_' + name, newId_(), CACHE_TTL);
  } catch (e) { /* cache tidak tersedia */ }
}

function cacheGetChunked_(cache, key) {
  var n = Number(cache.get(key + '_n') || 0);
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + '_' + i);
  var parts = cache.getAll(keys);
  var out = '';
  for (var j = 0; j < n; j++) {
    if (typeof parts[keys[j]] !== 'string') return null;
    out += parts[keys[j]];
  }
  return out;
}

function cachePutChunked_(cache, key, str) {
  var n = Math.ceil(str.length / CACHE_CHUNK) || 1;
  if (n > 60) return; // terlalu besar untuk di-cache
  var obj = {};
  for (var i = 0; i < n; i++) obj[key + '_' + i] = str.substr(i * CACHE_CHUNK, CACHE_CHUNK);
  obj[key + '_n'] = String(n);
  try { cache.putAll(obj, CACHE_TTL); } catch (e) { /* abaikan */ }
}

function readAll_(name) {
  if (TABLE_MEMO[name]) return TABLE_MEMO[name].slice();
  var rows;
  if (IN_LOCK) {
    rows = readSheet_(name);
  } else {
    var cache = CacheService.getScriptCache();
    var key = 'tbl_' + name + '_' + tableVersion_(cache, name);
    var cached = cacheGetChunked_(cache, key);
    if (cached) {
      rows = JSON.parse(cached);
    } else {
      rows = readSheet_(name);
      cachePutChunked_(cache, key, JSON.stringify(rows));
    }
  }
  TABLE_MEMO[name] = rows;
  return rows.slice();
}

function readSheet_(name) {
  var sheet = getSheet_(name);
  var headers = SCHEMA[name];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === '') continue;
    out.push(fromRow_(headers, values[i]));
  }
  return out;
}

function findRowIndex_(name, id) {
  var sheet = getSheet_(name);
  var last = sheet.getLastRow();
  if (last < 2 || !id) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function findById_(name, id) {
  if (!id) return null;
  var rows = readAll_(name);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === String(id)) return rows[i];
  }
  return null;
}

function insert_(name, obj) {
  var headers = SCHEMA[name];
  getSheet_(name).appendRow(toRow_(headers, obj));
  invalidate_(name);
  return obj;
}

function update_(name, id, patch) {
  var row = findRowIndex_(name, id);
  if (row === -1) throw httpError_(404, name + ' not found');
  var headers = SCHEMA[name];
  var range = getSheet_(name).getRange(row, 1, 1, headers.length);
  var current = fromRow_(headers, range.getValues()[0]);
  Object.keys(patch).forEach(function (k) { if (k !== 'id') current[k] = patch[k]; });
  range.setValues([toRow_(headers, current)]);
  invalidate_(name);
  return current;
}

function remove_(name, id) {
  var row = findRowIndex_(name, id);
  if (row !== -1) {
    getSheet_(name).deleteRow(row);
    invalidate_(name);
  }
}

function toRow_(headers, obj) {
  return headers.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (JSON_FIELDS[h]) return safeText_(JSON.stringify(v));
    if (typeof v === 'string') return safeText_(v);
    return v;
  });
}

function fromRow_(headers, row) {
  var obj = {};
  headers.forEach(function (h, i) {
    var v = row[i];
    if (NUMBER_FIELDS[h]) obj[h] = v === '' ? 0 : Number(v);
    else if (BOOL_FIELDS[h]) obj[h] = v === true || v === 'TRUE' || v === 'true';
    else if (JSON_FIELDS[h]) obj[h] = v ? JSON.parse(v) : [];
    else obj[h] = v === '' || v === null ? '' : String(v);
  });
  return obj;
}

/** Awalan apostrof memaksa Sheets menyimpan teks apa adanya (mencegah formula injection & konversi angka). */
function safeText_(s) {
  return s === '' ? '' : "'" + s;
}

function seedCategories_() {
  if (getSheet_('categories').getLastRow() >= 2) return;
  withLock_(function () {
    if (getSheet_('categories').getLastRow() >= 2) return;
    DEFAULT_CATEGORIES.forEach(function (c) {
      insert_('categories', { id: c.id, name: c.name, color: c.color, createdAt: Date.now() });
    });
  });
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function withLock_(fn) {
  if (IN_LOCK) return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  TABLE_MEMO = {}; // setelah mendapat lock, baca ulang langsung dari sheet
  IN_LOCK = true;
  try {
    return fn();
  } finally {
    IN_LOCK = false;
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function httpError_(status, message) {
  var err = new Error(message);
  err.status = status;
  return err;
}

/** ID dari aplikasi (supaya data bisa langsung tampil sebelum tersimpan), atau ID baru. */
function clientId_(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(id) ? id : newId_();
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}

function requireText_(v, field) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) throw httpError_(400, field + ' wajib diisi');
  return s.slice(0, 500);
}

function clamp01_(n) {
  n = Number(n);
  if (isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function byDesc_(key) {
  return function (a, b) { return (b[key] || 0) - (a[key] || 0); };
}

function byAsc_(key) {
  return function (a, b) { return (a[key] || 0) - (b[key] || 0); };
}
