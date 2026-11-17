/* DH — server-issued session helper (Phase 1, used only by /next/ pages).
   The token lives in sessionStorage (cleared when the tab closes) and is sent as p_token to the
   p_token overloads of the RPCs. The browser never sends an employee id as proof of identity. */
(function () {
  var SUPABASE_URL = 'https://ecfxeebhtgkbsdeuiueb.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_oRxEOMLizp1kjlsRjWWaxg_muaaMHFt';
  var KT = 'dh_token', KE = 'dh_emp';
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function sdel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }

  var DH = {
    token: function () { return sget(KT); },
    emp: function () { try { return JSON.parse(sget(KE) || 'null'); } catch (e) { return null; } },
    save: function (emp, token) { sset(KT, token); sset(KE, JSON.stringify(emp)); },
    clear: function () { sdel(KT); sdel(KE); },

    // plain PostgREST call (apikey only) — for public RPCs and the few direct table calls still left
    rest: async function (path, options) {
      options = options || {};
      var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, options, {
        headers: Object.assign({ 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, options.headers || {})
      }));
      if (!res.ok) {
        var t = await res.text();
        var err = new Error('Supabase error ' + res.status + ': ' + t);
        err.status = res.status;
        throw err;
      }
      return res.status === 204 ? null : res.json();
    },

    // token RPC: adds p_token automatically; an expired/invalid token clears the session
    rpc: async function (name, params) {
      var token = DH.token();
      var body = Object.assign({ p_token: token }, params || {});
      var out;
      try {
        out = await DH.rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
      } catch (e) {
        if (e.status === 401 || /PT401|Not authorized/.test(String(e.message))) { DH.expired(); }
        throw e;
      }
      if (out && !Array.isArray(out) && out.error === 'unauthorized') { DH.expired(); throw new Error('Session expired'); }
      return out;
    },

    expired: function () {
      DH.clear();
      if (!/index\.html$|\/next\/?$/.test(location.pathname)) { location.href = 'index.html?expired=1'; }
    },

    login: async function (username, password) {
      var rows = await DH.rest('rpc/iniciar_sesion', { method: 'POST', body: JSON.stringify({ p_username: username, p_password: password }) });
      if (!rows || !rows.length) return null;
      var r = rows[0], token = r.token;
      var emp = Object.assign({}, r); delete emp.token;
      DH.save(emp, token);
      return emp;
    },

    logout: async function () {
      var t = DH.token();
      DH.clear();
      if (t) { try { await DH.rest('rpc/cerrar_sesion', { method: 'POST', body: JSON.stringify({ p_token: t }) }); } catch (e) {} }
    },

    // re-validate a stored session (returns the employee or null)
    restore: async function () {
      if (!DH.token()) return null;
      try {
        var rows = await DH.rpc('sesion_yo', {});
        if (!rows || !rows.length) { DH.clear(); return null; }
        DH.save(rows[0], DH.token());
        return rows[0];
      } catch (e) { return null; }
    }
  };

  // ---- Private files (Supabase Storage via the workspace-files edge function) ----
  var FN = SUPABASE_URL + '/functions/v1/workspace-files';
  async function fn(payload) {
    var res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify(Object.assign({ token: DH.token() }, payload)) });
    var out = null; try { out = await res.json(); } catch (e) {}
    if (res.status === 401) { DH.expired(); throw new Error('Session expired'); }
    if (!res.ok || !out || out.error) { var er = new Error((out && out.error) || ('HTTP ' + res.status)); er.code = out && out.error; throw er; }
    return out;
  }
  DH.files = {
    // ids -> { id: { url, mime, nombre } }; links last 1 hour
    sign: async function (ids) {
      ids = (ids || []).filter(Boolean);
      var urls = {};
      for (var i = 0; i < ids.length; i += 50) {
        var r = await fn({ action: 'sign', ids: ids.slice(i, i + 50) });
        Object.assign(urls, r.urls || {});
      }
      return urls;
    },
    // downscale big photos so flyers load fast on tablets (PDFs and small images pass through)
    prepare: async function (file) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return file;
      try {
        var bmp = await createImageBitmap(file);
        var max = 2400, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        var c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.88); });
        if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
      } catch (e) {}
      return file;
    },
    // scope: 'promo' | 'recurso'. Returns the archivo_id to attach to a promotion/resource.
    upload: async function (scope, file) {
      if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type)) throw new Error('Only PDF, JPG, PNG or WebP files. / Solo PDF, JPG, PNG o WebP.');
      file = await DH.files.prepare(file);
      if (file.size > 20 * 1024 * 1024) throw new Error('File is larger than 20 MB. / El archivo pesa más de 20 MB.');
      var r = await fn({ action: 'upload', scope: scope, nombre: file.name, mime: file.type, bytes: file.size });
      var fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file);
      var up = await fetch(r.signedUrl, { method: 'PUT', headers: { apikey: SUPABASE_KEY }, body: fd });
      if (!up.ok) throw new Error('Upload failed (' + up.status + '). / Falló la subida.');
      return r.archivo_id;
    }
  };
  window.DH = DH;
})();
