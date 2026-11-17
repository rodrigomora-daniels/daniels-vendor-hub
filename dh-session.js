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
  window.DH = DH;
})();
