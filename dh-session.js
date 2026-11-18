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
      var OFFICE = { xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
      if (scope === 'recurso' || scope === 'promo') {
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        if (OFFICE[ext] && file.type !== OFFICE[ext]) file = new File([file], file.name, { type: OFFICE[ext] });
      }
      var okType = /^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type) || (scope === 'promo' && file.type === 'video/mp4') || ((scope === 'recurso' || scope === 'promo') && Object.keys(OFFICE).some(function (k) { return OFFICE[k] === file.type; }));
      if (!okType) throw new Error(scope === 'recurso' ? 'Only PDF, images, Word, Excel or PowerPoint. / Solo PDF, imágenes, Word, Excel o PowerPoint.' : 'Only PDF, images, Excel, Word, PowerPoint or MP4. / Solo PDF, imágenes, Excel, Word, PowerPoint o MP4.');
      file = await DH.files.prepare(file);
      var MAXMB = scope === 'promo' ? 50 : 20;
      if (file.size > MAXMB * 1024 * 1024) throw new Error('File is larger than ' + MAXMB + ' MB. / El archivo pesa más de ' + MAXMB + ' MB.');
      var r = await fn({ action: 'upload', scope: scope, nombre: file.name, mime: file.type, bytes: file.size });
      var fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file);
      var up = await fetch(r.signedUrl, { method: 'PUT', headers: { apikey: SUPABASE_KEY }, body: fd });
      if (!up.ok) throw new Error('Upload failed (' + up.status + '). / Falló la subida.');
      return r.archivo_id;
    }
  };

  // ---- Site-wide language switch (EN / ES), remembered in this browser ----
  // Pages opt in with <meta name="dh-i18n" content="on">. The UI strings are written "English / Español";
  // this shows only the chosen side. Text inside [data-no-i18n] (user-written content) is never touched.
  (function () {
    var KEY = 'dh_lang', ORIG = new WeakMap(), lang;
    try { lang = localStorage.getItem(KEY); } catch (e) {}
    if (lang !== 'en' && lang !== 'es') lang = ((navigator.language || '').toLowerCase().indexOf('es') === 0) ? 'es' : 'en';
    function pick(s, l) {
      if (!s || s.indexOf(' / ') < 0) return s;
      if (s.split(' / ').length !== 2) return s;
      var m = s.match(/^([\s\S]*?\()([^()]*?) \/ ([^()]*?)(\)[\s\S]*)$/);
      if (m) return m[1] + (l === 'es' ? m[3] : m[2]) + m[4];
      var i = s.indexOf(' / '), a = s.slice(0, i), b = s.slice(i + 3);
      var A = a.trim(), B = b.trim(), pre = '', suf = '';
      try {
        pre = (A.match(/^[^\p{L}\p{N}(]+/u) || [''])[0].trim();
        suf = (B.match(/[^\p{L}\p{N}\s.,;:!?)'"\]]+$/u) || [''])[0].trim();
      } catch (e) {}
      var r = l === 'es' ? B : A;
      if (l === 'es' && pre && !/^[^\p{L}\p{N}]/u.test(B)) r = pre + ' ' + B;   // keep a leading icon / arrow
      if (l !== 'es' && suf && A.slice(-suf.length) !== suf) r = A + ' ' + suf;     // keep a trailing ✕
      return a.match(/^\s*/)[0] + r + b.match(/\s*$/)[0];
    }
    var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
    function okText(n) { var p = n.parentNode; return p && !SKIP[p.nodeName] && !(p.closest && p.closest('[data-no-i18n]')); }
    function text(n) {
      if (!okText(n)) return;
      var has = ORIG.has(n), o = has ? ORIG.get(n) : n.nodeValue;
      if (!has) { if (o.indexOf(' / ') < 0) return; ORIG.set(n, o); }
      var v = pick(o, lang); if (v !== n.nodeValue) n.nodeValue = v;
    }
    function attrs(el) {
      if (!el.getAttribute || (el.closest && el.closest('[data-no-i18n]'))) return;
      ['placeholder', 'title', 'aria-label'].forEach(function (a) {
        var v = el.getAttribute(a); if (v === null) return;
        el.__dho = el.__dho || {};
        if (el.__dho[a] === undefined) { if (v.indexOf(' / ') < 0) return; el.__dho[a] = v; }
        var nv = pick(el.__dho[a], lang); if (nv !== v) el.setAttribute(a, nv);
      });
    }
    function walk(root) {
      if (root.nodeType === 3) { text(root); return; }
      if (root.nodeType !== 1) return;
      attrs(root);
      var tw = document.createTreeWalker(root, 4), n; while ((n = tw.nextNode())) text(n);
      var els = root.querySelectorAll('[placeholder],[title],[aria-label]'); for (var i = 0; i < els.length; i++) attrs(els[i]);
    }
    var TITLE0;
    function applyAll() {
      document.documentElement.setAttribute('lang', lang);
      if (TITLE0 === undefined) TITLE0 = document.title;
      document.title = pick(TITLE0, lang);
      walk(document.body);
      var bs = document.querySelectorAll('#dh-lang button'); for (var i = 0; i < bs.length; i++) bs[i].className = bs[i].getAttribute('data-l') === lang ? 'on' : '';
    }
    function set(l) {
      lang = l; try { localStorage.setItem(KEY, l); } catch (e) {}
      applyAll(); try { window.dispatchEvent(new CustomEvent('dh-lang', { detail: l })); } catch (e) {}
    }
    function visible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
    function place(box) {
      var host = document.querySelector('.dash-header .right-group'); if (!visible(host)) host = document.querySelector('header'); if (!visible(host)) { var hm = document.querySelector('.dh-home'); host = visible(hm) ? hm.parentNode : null; }
      if (host) { if (box.parentNode !== host) { box.style.cssText = box.getAttribute('data-base'); host.insertBefore(box, host.querySelector('.dh-home') || host.firstChild); } }
      else if (box.parentNode !== document.body || box.style.position !== 'fixed') { box.style.cssText = box.getAttribute('data-base') + 'position:fixed;top:8px;right:10px;z-index:10001;'; document.body.appendChild(box); }
    }
    function init() {
      if (!document.querySelector('meta[name="dh-i18n"]')) return;
      var st = document.createElement('style');
      st.textContent = '#dh-lang button{background:transparent;border:0;color:#D6E4F7;font:700 11px Arial,sans-serif;padding:5px 10px;cursor:pointer}#dh-lang button.on{background:#C8922A;color:#fff}';
      document.head.appendChild(st);
      var box = document.createElement('div'); box.id = 'dh-lang'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Language');
      var base = 'display:inline-flex;overflow:hidden;border:1px solid rgba(255,255,255,.55);border-radius:16px;background:#1B3A6B;margin-right:12px;flex:none;';
      box.setAttribute('data-base', base);
      box.innerHTML = '<button type="button" data-l="en">EN</button><button type="button" data-l="es">ES</button>';
      box.addEventListener('click', function (e) { var l = e.target && e.target.getAttribute && e.target.getAttribute('data-l'); if (l) set(l); });
      place(box); applyAll();
      new MutationObserver(function (ms) {
        ms.forEach(function (m) { for (var i = 0; i < m.addedNodes.length; i++) { var n = m.addedNodes[i]; if (n !== box && !(box.contains && box.contains(n))) walk(n); } });
      }).observe(document.body, { childList: true, subtree: true });
      setInterval(function () { place(box); }, 1000);
    }
    DH.i18n = { pick: function (s) { return pick(s, lang); }, set: set, get lang() { return lang; } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  })();
  window.DH = DH;
})();
