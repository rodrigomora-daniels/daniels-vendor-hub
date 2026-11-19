/* Ask SAL — floating assistant for the Daniels workspace.
   - Loaded lazily by dh-session.js on pages with a signed-in session (never on exams / board / lead form).
   - Searches ONLY what the signed-in person may already see: library pages, promotions, news, channel messages,
     through the sal_buscar RPC (same session token and permission rules as the rest of the workspace).
   - Never invents an answer: it shows what the server returned, with its source, or says nothing was found. */
(function () {
  'use strict';
  if (window.__sal || !window.DH) return;
  var DH = window.DH;
  var SRC = document.currentScript && document.currentScript.src;
  var ART = SRC ? new URL('sal/', SRC).href : 'sal/';
  var FACE = { idle: 'sal-idle.svg', thinking: 'sal-thinking.svg', search: 'sal-search.svg', typing: 'sal-typing.svg', success: 'sal-success.svg', error: 'sal-error.svg' };
  var root, fab, tip, panel, logEl, form, input, sendBtn, faceEl, chipsEl, subEl, titleEl, xBtn;
  var busy = false, faceTimer = 0, typingTimer = 0, slowTimer = 0, lastQ = '', mounted = false, greeted = false;

  function L() { return (DH.i18n && DH.i18n.lang) === 'es' ? 'es' : 'en'; }
  function t(en, es) { return L() === 'es' ? es : en; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hl(s) { return esc(s).replace(/&lt;&lt;/g, '<mark>').replace(/&gt;&gt;/g, '</mark>'); }
  function loc(s) { return (DH.i18n && DH.i18n.pick) ? DH.i18n.pick(s || '') : (s || ''); }
  function fmtDate(d) { if (!d) return ''; var x = new Date(String(d).length > 10 ? d : d + 'T12:00:00'); return x.toLocaleDateString(L() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: x.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); }
  function fmtWhen(d) { var x = new Date(d); return fmtDate(d) + ', ' + x.toLocaleTimeString(L() === 'es' ? 'es-US' : 'en-US', { hour: 'numeric', minute: '2-digit' }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* ---------- where the pages are (client-side map, no server call) ---------- */
  var NAV = [
    { u: 'index.html', en: 'Home (My day)', es: 'Inicio (Mi día)', k: ['home', 'inicio', 'my day', 'mi dia', 'dashboard', 'goal', 'meta del dia'] },
    { u: 'horarios.html', en: 'Schedules', es: 'Horarios', k: ['schedule', 'schedules', 'horario', 'horarios', 'shift', 'turno', 'my hours', 'mis horas', 'time off'] },
    { u: 'calendario.html', en: 'Promo Calendar', es: 'Calendario de promos', k: ['calendar', 'calendario', 'campaign', 'campana', 'wrap', 'retroplanning', 'holiday', 'black friday', 'cyber monday', 'thanksgiving'] },
    { u: 'promociones.html', en: 'Promotions', es: 'Promociones', k: ['promotion', 'promotions', 'promo', 'promos', 'promocion', 'promociones', 'flyer', 'offer', 'oferta'] },
    { u: 'noticias.html', en: "What's New", es: 'Novedades', k: ['news', 'novedades', 'noticias', 'announcement', 'anuncio', "what's new", 'whats new'] },
    { u: 'mensajes.html', en: 'Messages', es: 'Mensajes', k: ['message', 'messages', 'mensaje', 'mensajes', 'channel', 'channels', 'canal', 'canales', 'chat', 'alerts', 'alertas'] },
    { u: 'recursos.html', en: 'Resources library', es: 'Biblioteca de recursos', k: ['resources', 'recursos', 'library', 'biblioteca', 'documents', 'documentos'] },
    { u: 'capacitacion.html', en: 'Training', es: 'Capacitación', k: ['training', 'capacitacion', 'course', 'curso', 'certification', 'certificacion', 'learn', 'aprender'] },
    { u: 'Daniels_Organigrama.html', en: 'Org chart', es: 'Organigrama', k: ['org chart', 'organigrama', 'who is my manager', 'quien es mi gerente', 'reports to'] },
    { u: 'reportes.html', en: 'My Reports', es: 'Mis reportes', k: ['report', 'reports', 'reporte', 'reportes', 'kpi', 'sales vs goal', 'ventas vs meta'] },
    { u: 'notas.html', en: 'Notes', es: 'Notas', k: ['notes', 'notas', 'notebook', 'libreta'] },
    { u: 'Daniels_Lead_Source_Form.html', en: 'How did you find us? (Lead source)', es: '¿Cómo nos encontró? (Lead source)', k: ['lead source', 'how did you find us', 'como nos encontro', 'customer log', 'registro de clientes', 'log a customer'] }
  ];
  function navMatches(q) {
    var n = ' ' + norm(q).replace(/[^a-z0-9\' ]+/g, ' ').replace(/\s+/g, ' ') + ' ', out = [], here = location.pathname.split('/').pop() || 'index.html';
    NAV.forEach(function (p) {
      var hit = p.k.some(function (k) { return n.indexOf(' ' + norm(k).trim() + ' ') >= 0; });
      if (hit && p.u !== here) out.push(p);
    });
    return out.slice(0, 2);
  }

  /* ---------- CSS ---------- */
  var CSS = '' +
    '#sal-root{--n:#0B2D5C;--t:#00D9D9;--o:#F3F6FA;--tx:#1F2937;position:fixed;z-index:9990;right:0;bottom:0;font:14px/1.45 "Segoe UI",system-ui,-apple-system,Arial,sans-serif;color:var(--tx)}' +
    '#sal-root *{box-sizing:border-box}' +
    '#sal-fab{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));width:62px;height:62px;border-radius:50%;border:3px solid var(--t);background:#fff;box-shadow:0 6px 18px rgba(11,45,92,.35);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;transition:transform .18s ease,box-shadow .18s ease}' +
    '#sal-fab:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 10px 22px rgba(11,45,92,.4)}#sal-fab img{height:46px;width:auto;display:block;margin-top:2px;pointer-events:none}' +
    '#sal-fab:focus-visible,#sal-root button:focus-visible,#sal-root input:focus-visible,#sal-root a:focus-visible{outline:3px solid var(--t);outline-offset:2px}' +
    '#sal-fab.hi{animation:salhi 1.3s ease 1.2s 1}@keyframes salhi{0%,100%{transform:none}20%{transform:translateY(-8px) rotate(-6deg)}40%{transform:translateY(0) rotate(5deg)}60%{transform:translateY(-4px) rotate(-3deg)}}' +
    '#sal-tip{position:fixed;right:max(88px,calc(env(safe-area-inset-right) + 88px));bottom:max(30px,calc(env(safe-area-inset-bottom) + 30px));background:var(--n);color:#fff;font-weight:600;padding:8px 14px;border-radius:18px 18px 4px 18px;box-shadow:0 4px 14px rgba(11,45,92,.3);opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap}#sal-tip.on{opacity:1;transform:none}' +
    '#sal-panel{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(90px,calc(env(safe-area-inset-bottom) + 90px));width:min(400px,calc(100vw - 24px));height:min(640px,calc(100dvh - 112px));background:var(--o);border-radius:18px;box-shadow:0 18px 50px rgba(11,45,92,.35);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(14px) scale(.98);transform-origin:bottom right;visibility:hidden;transition:opacity .2s ease,transform .2s ease,visibility 0s linear .2s}' +
    '#sal-panel.open{opacity:1;transform:none;visibility:visible;transition:opacity .2s ease,transform .2s ease}' +
    '#sal-hd{display:flex;align-items:center;gap:10px;background:var(--n);color:#fff;padding:10px 12px 10px 14px;flex:none}' +
    '#sal-face{height:46px;width:auto;flex:none;background:#fff;border-radius:50%;padding:4px 6px 0;border:2px solid var(--t)}#sal-face.pop{animation:salpop .28s ease}@keyframes salpop{0%{transform:scale(.85)}60%{transform:scale(1.08)}100%{transform:none}}' +
    '#sal-hd h2{margin:0;font:700 18px Georgia,serif;letter-spacing:.2px}#sal-hd p{margin:0;font-size:12px;color:#BFE9F2}#sal-hd .tx{flex:1;min-width:0}' +
    '#sal-x{flex:none;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:#fff;font-size:26px;line-height:1;cursor:pointer}#sal-x:hover{background:rgba(255,255,255,.14)}' +
    '#sal-log{flex:1;overflow:auto;padding:14px 12px;display:flex;flex-direction:column;gap:12px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}' +
    '.sal-m{display:flex;gap:8px;align-items:flex-end;max-width:100%;animation:salin .22s ease}@keyframes salin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}' +
    '.sal-m.me{justify-content:flex-end}.sal-m img.av{height:30px;width:auto;flex:none;align-self:flex-start}' +
    '.sal-b{background:#fff;border-radius:14px 14px 14px 4px;padding:10px 12px;box-shadow:0 1px 3px rgba(11,45,92,.12);min-width:0;max-width:calc(100% - 38px);overflow-wrap:anywhere}' +
    '.sal-m.me .sal-b{background:var(--n);color:#fff;border-radius:14px 14px 4px 14px;max-width:85%}' +
    '.sal-dots{display:inline-flex;gap:4px;vertical-align:middle;margin-left:4px}.sal-dots i{width:6px;height:6px;border-radius:50%;background:var(--t);animation:saldot 1s infinite ease-in-out}.sal-dots i:nth-child(2){animation-delay:.15s}.sal-dots i:nth-child(3){animation-delay:.3s}@keyframes saldot{0%,80%,100%{opacity:.25;transform:none}40%{opacity:1;transform:translateY(-3px)}}' +
    '.sal-sec{font:700 11px "Segoe UI",Arial,sans-serif;color:#5B6B82;text-transform:none;letter-spacing:.3px;margin:10px 0 4px}.sal-sec:first-child{margin-top:0}' +
    '.sal-card{border:1px solid #D9E3EF;border-radius:10px;padding:9px 10px;margin:6px 0;background:#fff}.sal-card h4{margin:0 0 2px;font:700 13.5px "Segoe UI",Arial,sans-serif;color:var(--n)}.sal-card .meta{font-size:11.5px;color:#5B6B82;margin-bottom:4px}' +
    '.sal-card p{margin:3px 0;font-size:13px}.sal-card mark{background:#C9F7F7;color:#06304f;border-radius:3px;padding:0 2px}' +
    '.sal-full{white-space:pre-wrap;font-size:12.5px;background:var(--o);border-radius:8px;padding:8px;margin-top:6px;max-height:240px;overflow:auto}' +
    '.sal-act{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.sal-btn{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 12px;border-radius:18px;border:1.5px solid var(--n);background:#fff;color:var(--n);font:600 12.5px "Segoe UI",Arial,sans-serif;cursor:pointer;text-decoration:none}.sal-btn:hover{background:var(--o)}.sal-btn.pri{background:var(--n);color:#fff}.sal-btn.pri:hover{background:#12407f}' +
    '.sal-badge{display:inline-block;font:700 10.5px Arial,sans-serif;padding:2px 8px;border-radius:10px;background:#D6F5F5;color:#05526b;margin-left:6px;vertical-align:middle}.sal-badge.old{background:#E5E7EB;color:#4B5563}.sal-badge.soon{background:#FDF1C9;color:#7a5a00}' +
    '.sal-b p{margin:5px 0 0}.sal-note{font-size:11.5px;color:#5B6B82;margin-top:10px;border-top:1px dashed #D0DAE8;padding-top:6px}' +
    '#sal-chips{display:flex;flex-wrap:wrap;gap:6px;max-height:112px;overflow:auto;padding:0 12px 8px;flex:none}#sal-chips button{min-height:36px;border-radius:18px;border:1.5px solid #B7C6DA;background:#fff;color:var(--n);font:600 12.5px "Segoe UI",Arial,sans-serif;padding:0 12px;cursor:pointer;white-space:nowrap}#sal-chips button:hover{border-color:var(--t);background:#F0FFFF}' +
    '#sal-form{display:flex;gap:8px;padding:8px 12px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #D9E3EF;flex:none}' +
    '#sal-q{flex:1;min-width:0;height:44px;border:1.5px solid #B7C6DA;border-radius:22px;padding:0 16px;font:15px "Segoe UI",Arial,sans-serif;background:var(--o);color:var(--tx)}#sal-q:focus{border-color:var(--t);background:#fff;outline:none;box-shadow:0 0 0 3px rgba(0,217,217,.25)}' +
    '#sal-send{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:var(--n);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}#sal-send:disabled{opacity:.45;cursor:default}#sal-send:not(:disabled):hover{background:#12407f}' +
    '@media (max-width:520px){#sal-panel{right:0;bottom:0;width:100vw;height:100dvh;border-radius:0}#sal-root.open #sal-fab,#sal-root.open #sal-tip{display:none}}' +
    '@media (prefers-reduced-motion:reduce){#sal-root *{animation:none!important;transition:none!important}}' +
    '@media print{#sal-root{display:none!important}}';

  /* ---------- state face ---------- */
  function setFace(state, holdMs) {
    if (!faceEl) return;
    clearTimeout(faceTimer);
    var src = ART + (FACE[state] || FACE.idle);
    if (faceEl.getAttribute('src') !== src) { faceEl.setAttribute('src', src); faceEl.classList.remove('pop'); void faceEl.offsetWidth; faceEl.classList.add('pop'); }
    faceEl.setAttribute('data-state', state);
    if (holdMs) faceTimer = setTimeout(function () { setFace('idle'); }, holdMs);
  }

  /* ---------- log helpers ---------- */
  function scrollEnd() { logEl.scrollTop = logEl.scrollHeight; }
  function addMe(text) {
    var d = document.createElement('div'); d.className = 'sal-m me';
    d.innerHTML = '<div class="sal-b">' + esc(text) + '</div>'; logEl.appendChild(d); scrollEnd();
  }
  function addSal(html, face) {
    var d = document.createElement('div'); d.className = 'sal-m';
    d.innerHTML = '<img class="av" alt="" src="' + ART + (FACE[face || 'idle']) + '"><div class="sal-b">' + html + '</div>';
    logEl.appendChild(d); scrollEnd(); return d;
  }
  function setBubble(node, html, face) {
    node.querySelector('.sal-b').innerHTML = html;
    node.querySelector('img.av').setAttribute('src', ART + FACE[face || 'idle']); scrollEnd();
  }

  /* ---------- opening files / pages ---------- */
  async function openFile(archivoId, page, url, btn) {
    if (!archivoId) { if (url) window.open(url, '_blank', 'noopener'); return; }
    var w = window.open('', '_blank');           // opened inside the tap so tablets don't block it
    var old = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = t('Opening…', 'Abriendo…'); }
    try {
      var r = await DH.files.sign([archivoId]);
      var f = r[archivoId];
      if (!f || !f.url) throw new Error('none');
      var go = f.url + (page && /pdf/.test(f.mime || '') ? '#page=' + page : '');
      if (w) { w.location.href = go; } else { location.href = go; }
    } catch (e) {
      if (w) w.close();
      addSal(esc(t('I could not open that file. It may have been removed, or you may not have access any more.', 'No pude abrir ese archivo. Puede que lo hayan quitado o que ya no tengas acceso.')), 'error');
      setFace('error', 2500);
    } finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  /* ---------- render a search result ---------- */
  function renderResult(r, q) {
    var h = '', navs = navMatches(q);
    if (navs.length) {
      h += '<div class="sal-sec">' + esc(t('Go to', 'Ir a')) + '</div><div class="sal-act">' +
        navs.map(function (p) { return '<a class="sal-btn pri" href="' + esc(p.u) + '">' + esc(p[L()]) + '</a>'; }).join('') + '</div>';
    }
    if (r.respuestas && r.respuestas.length) {
      h += '<div class="sal-sec">' + esc(t('Quick answers', 'Respuestas rápidas')) + '</div>' + r.respuestas.map(function (a, i) {
        return '<div class="sal-card"><h4>' + esc(a.titulo) + '</h4><p style="white-space:pre-wrap">' + esc(a.respuesta) + '</p>' +
          ((a.archivo_id || a.url) ? '<div class="sal-act"><button class="sal-btn" data-open="a' + i + '">' + esc(t('Open source', 'Abrir fuente') + (a.pagina ? ' · ' + t('page ', 'pág. ') + a.pagina : '')) + '</button></div>' : '') + '</div>';
      }).join('');
    }
    if (r.paginas && r.paginas.length) {
      h += '<div class="sal-sec">' + esc(t('In the library', 'En la biblioteca')) + '</div>' + r.paginas.map(function (p, i) {
        var pdf = /pdf/.test(p.mime || '');
        return '<div class="sal-card"><h4>' + esc(p.titulo) + '</h4><div class="meta">' + esc(loc(p.categoria)) + (pdf ? ' · ' + esc(t('page ', 'página ') + p.pagina) : '') + '</div>' +
          '<p>…' + hl(p.fragmento) + '…</p><div class="sal-act">' +
          '<button class="sal-btn pri" data-open="p' + i + '">' + esc(pdf ? t('Open page ', 'Abrir página ') + p.pagina : t('Open', 'Abrir')) + '</button>' +
          '<button class="sal-btn" data-read="p' + i + '" aria-expanded="false">' + esc(t('Read here', 'Leer aquí')) + '</button></div></div>';
      }).join('');
    }
    if (r.documentos && r.documentos.length) {
      h += '<div class="sal-sec">' + esc(t('Documents', 'Documentos')) + '</div>' + r.documentos.map(function (d, i) {
        return '<div class="sal-card"><h4>' + esc(d.titulo) + '</h4><div class="meta">' + esc(loc(d.categoria)) + (d.idioma ? ' · ' + esc(d.idioma) : '') + '</div>' +
          '<div class="sal-act"><button class="sal-btn pri" data-open="d' + i + '">' + esc(t('Open', 'Abrir')) + '</button></div></div>';
      }).join('');
    }
    if (r.promos && r.promos.length) {
      h += '<div class="sal-sec">' + esc(t('Promotions', 'Promociones')) + '</div>' + r.promos.map(function (p, i) {
        var badge = p.estado === 'vigente' ? '<span class="sal-badge">' + esc(t('Active', 'Vigente')) + '</span>' : p.estado === 'programada' ? '<span class="sal-badge soon">' + esc(t('Starts ', 'Empieza ') + fmtDate(p.vigente_desde)) + '</span>' : '<span class="sal-badge old">' + esc(t('Ended', 'Terminada')) + '</span>';
        return '<div class="sal-card"><h4>' + esc(p.titulo) + badge + '</h4><div class="meta">' + esc(fmtDate(p.vigente_desde) + (p.vigente_hasta ? ' – ' + fmtDate(p.vigente_hasta) : ' – ' + t('no end date', 'sin fecha final'))) + (p.seccion ? ' · ' + esc(p.seccion) : '') + '</div>' +
          (p.descripcion ? '<p>' + esc(p.descripcion) + '</p>' : '') + '<div class="sal-act"><button class="sal-btn pri" data-open="r' + i + '">' + esc(t('Open promo', 'Abrir promo')) + '</button></div></div>';
      }).join('') + '<div class="sal-act"><a class="sal-btn" href="promociones.html">' + esc(t('All promotions', 'Todas las promociones')) + '</a></div>';
    }
    if (r.mensajes && r.mensajes.length) {
      h += '<div class="sal-sec">' + esc(t('In channels', 'En canales')) + '</div>' + r.mensajes.map(function (m) {
        return '<div class="sal-card"><div class="meta">' + esc(loc(m.canal)) + ' · ' + esc(m.autor || '') + ' · ' + esc(fmtWhen(m.creado)) + '</div><p style="white-space:pre-wrap">' + esc(m.cuerpo) + '</p>' +
          '<div class="sal-act"><a class="sal-btn" href="mensajes.html#' + esc(m.canal_id) + '">' + esc(t('Open channel', 'Abrir canal')) + '</a></div></div>';
      }).join('');
    }
    if (r.noticias && r.noticias.length) {
      h += '<div class="sal-sec">' + esc(t("What's New", 'Novedades')) + '</div>' + r.noticias.map(function (n) {
        return '<div class="sal-card"><h4>' + esc(n.titulo) + '</h4><div class="meta">' + esc(fmtDate(n.publicada_en)) + '</div><p>' + esc(n.cuerpo) + '</p><div class="sal-act"><a class="sal-btn" href="noticias.html">' + esc(t('Open', 'Abrir')) + '</a></div></div>';
      }).join('');
    }
    if (!h) return '';
    return h + '<div class="sal-note">' + esc(t('These are the passages and posts I found that you can access. Check the source before you act on it.', 'Esto es lo que encontré y a lo que tienes acceso. Revisa la fuente antes de actuar.')) + '</div>';
  }

  function bindResult(node, r) {
    var map = {};
    (r.respuestas || []).forEach(function (a, i) { map['a' + i] = [a.archivo_id, a.pagina, a.url]; });
    (r.paginas || []).forEach(function (p, i) { map['p' + i] = [p.archivo_id, p.pagina, p.url]; });
    (r.documentos || []).forEach(function (d, i) { map['d' + i] = [d.archivo_id, null, d.url]; });
    (r.promos || []).forEach(function (p, i) { map['r' + i] = [p.archivo_id, null, null]; });
    node.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b) return;
      var o = b.getAttribute('data-open');
      if (o && map[o]) { openFile(map[o][0], map[o][1], map[o][2], b); return; }
      var rd = b.getAttribute('data-read');
      if (rd) {
        var card = b.closest('.sal-card'), ex = card.querySelector('.sal-full');
        if (ex) { ex.remove(); b.setAttribute('aria-expanded', 'false'); b.textContent = t('Read here', 'Leer aquí'); return; }
        var p = (r.paginas || [])[+rd.slice(1)]; if (!p) return;
        var d = document.createElement('div'); d.className = 'sal-full'; d.setAttribute('tabindex', '0'); d.textContent = p.texto;   // plain text: nothing from the document can run
        card.appendChild(d); b.setAttribute('aria-expanded', 'true'); b.textContent = t('Hide', 'Ocultar'); scrollEnd();
      }
    });
  }

  /* ---------- ask ---------- */
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error('timeout')); }, ms); })]); }
  async function ask(q) {
    q = String(q || '').trim(); if (q.length < 2 || busy) return;
    busy = true; lastQ = q; sendBtn.disabled = true; input.value = ''; chipsEl.style.display = 'none';
    addMe(q); setFace('search');
    var wait = addSal(esc(t('Searching the library, channels and promotions', 'Buscando en la biblioteca, canales y promociones')) + '<span class="sal-dots" aria-hidden="true"><i></i><i></i><i></i></span>', 'search');
    clearTimeout(slowTimer);
    slowTimer = setTimeout(function () { setFace('thinking'); setBubble(wait, esc(t('Still looking, one moment', 'Sigo buscando, un momento')) + '<span class="sal-dots" aria-hidden="true"><i></i><i></i><i></i></span>', 'thinking'); }, 1800);
    try {
      var r = await withTimeout(DH.rpc('sal_buscar', { p_q: q }), 20000);
      clearTimeout(slowTimer);
      var html = renderResult(r, q);
      if (!html) {
        setBubble(wait, '<b>' + esc(t('I found nothing about “', 'No encontré nada sobre “') + q + '”') + '</b><p>' + esc(t('Nothing in the library, channels, promotions or news that you can access. That does not prove it does not exist: try other words (for example the product name, a policy name or the SKU), or ask your manager.', 'Nada en la biblioteca, canales, promociones ni novedades a los que tienes acceso. Eso no prueba que no exista: prueba con otras palabras (por ejemplo el nombre del producto, de la política o el SKU), o pregunta a tu gerente.')) + '</p>', 'thinking');
        setFace('thinking', 2500);
      } else {
        setBubble(wait, html, 'success'); bindResult(wait, r); setFace('success', 2500);
        wait.querySelector('.sal-b').scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    } catch (e) {
      clearTimeout(slowTimer);
      var expired = /expired/i.test(e && e.message);
      setBubble(wait, '<b>' + esc(expired ? t('Your session ended.', 'Tu sesión terminó.') : t('I could not search right now.', 'No pude buscar en este momento.')) + '</b><p>' + esc(expired ? t('Please sign in again.', 'Inicia sesión de nuevo.') : t('Check your connection and try again.', 'Revisa tu conexión e intenta de nuevo.')) + '</p>' +
        (expired ? '' : '<div class="sal-act"><button class="sal-btn pri" data-retry="1">' + esc(t('Try again', 'Intentar de nuevo')) + '</button></div>'), 'error');
      var rb = wait.querySelector('[data-retry]'); if (rb) rb.addEventListener('click', function () { wait.remove(); ask(lastQ); });
      setFace('error', 3000);
    } finally { busy = false; sendBtn.disabled = false; if (panel.classList.contains('open') && window.matchMedia('(pointer:fine)').matches) input.focus(); }
  }

  /* ---------- chrome ---------- */
  function texts() {
    titleEl.textContent = 'Ask SAL';
    subEl.textContent = t('Your Daniels assistant', 'Tu asistente de Daniels');
    xBtn.setAttribute('aria-label', t('Close Ask SAL', 'Cerrar Ask SAL'));
    fab.setAttribute('aria-label', t('Ask SAL', 'Ask SAL'));
    input.setAttribute('placeholder', t('Ask SAL… e.g. price match, refund, SKU', 'Pregúntale a SAL… ej. price match, reembolso, SKU'));
    input.setAttribute('aria-label', t('Type your question', 'Escribe tu pregunta'));
    sendBtn.setAttribute('aria-label', t('Send', 'Enviar'));
    var q = L() === 'es'
      ? ['Política de price match', '¿Cómo proceso una devolución?', 'Cancelar y reembolsar en Infinity', 'Política de haul away', '¿Hay promociones vigentes?', '¿Dónde está mi horario?']
      : ['Price match policy', 'How do I process a return?', 'Cancel and refund in Infinity', 'Haul away policy', 'Any promotions right now?', 'Where is my schedule?'];
    chipsEl.innerHTML = q.map(function (x) { return '<button type="button">' + esc(x) + '</button>'; }).join('');
  }
  function greet() {
    if (greeted) return; greeted = true;
    var e = DH.emp && DH.emp(); var nm = e && (e.nombre_completo || e.nombre || '').split(' ')[0];
    addSal('<b>' + esc(t('Hi' + (nm ? ', ' + nm : '') + '! I am SAL.', '¡Hola' + (nm ? ', ' + nm : '') + '! Soy SAL.')) + '</b><p>' + esc(t('Ask me about policies, Infinity steps, promotions or what was posted in the channels. I only show what is in the workspace, and I tell you when I find nothing.', 'Pregúntame por políticas, pasos de Infinity, promociones o lo que se publicó en los canales. Solo muestro lo que está en el workspace y te digo cuando no encuentro nada.')) + '</p>', 'idle');
  }
  function open() {
    mounted && (panel.classList.add('open'), root.classList.add('open'), fab.setAttribute('aria-expanded', 'true'));
    tip.classList.remove('on'); try { localStorage.setItem('dh_sal_seen', '1'); } catch (e) {}
    greet(); setFace('idle');
    setTimeout(function () { input.focus(); }, 60);
  }
  function close() {
    panel.classList.remove('open'); root.classList.remove('open'); fab.setAttribute('aria-expanded', 'false'); fab.focus();
  }
  function toggle() { panel.classList.contains('open') ? close() : open(); }

  function mount() {
    if (mounted || !DH.token()) return;
    mounted = true;
    var st = document.createElement('style'); st.id = 'sal-css'; st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'sal-root'; root.setAttribute('data-no-i18n', '');
    root.innerHTML =
      '<button type="button" id="sal-fab" aria-haspopup="dialog" aria-expanded="false" aria-controls="sal-panel"><img alt="" src="' + ART + FACE.idle + '"></button>' +
      '<div id="sal-tip" aria-hidden="true"></div>' +
      '<section id="sal-panel" role="dialog" aria-labelledby="sal-title">' +
      '<header id="sal-hd"><img id="sal-face" alt="" src="' + ART + FACE.idle + '"><div class="tx"><h2 id="sal-title"></h2><p id="sal-sub"></p></div><button type="button" id="sal-x">&times;</button></header>' +
      '<div id="sal-log" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<div id="sal-chips"></div>' +
      '<form id="sal-form" autocomplete="off"><input id="sal-q" type="text" maxlength="200" enterkeyhint="search" autocapitalize="off" spellcheck="false"><button type="submit" id="sal-send"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5 21 12 3 3.5v6.7l12 1.8-12 1.8z" fill="currentColor"/></svg></button></form>' +
      '</section>';
    document.body.appendChild(root);
    fab = root.querySelector('#sal-fab'); tip = root.querySelector('#sal-tip'); panel = root.querySelector('#sal-panel'); logEl = root.querySelector('#sal-log');
    form = root.querySelector('#sal-form'); input = root.querySelector('#sal-q'); sendBtn = root.querySelector('#sal-send'); faceEl = root.querySelector('#sal-face');
    chipsEl = root.querySelector('#sal-chips'); subEl = root.querySelector('#sal-sub'); titleEl = root.querySelector('#sal-title'); xBtn = root.querySelector('#sal-x');
    texts();
    // messages page has its own send bar at the bottom right: sit above it
    if (/mensajes\.html/.test(location.pathname)) fab.style.bottom = 'max(84px,calc(env(safe-area-inset-bottom) + 84px))';
    fab.addEventListener('click', toggle);
    xBtn.addEventListener('click', close);
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    chipsEl.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) ask(b.textContent); });
    input.addEventListener('input', function () {
      if (busy) return; clearTimeout(typingTimer);
      if (input.value.trim()) { setFace('typing'); typingTimer = setTimeout(function () { if (!busy) setFace('idle'); }, 1600); } else setFace('idle');
    });
    window.addEventListener('dh-lang', function () { texts(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });
    // one friendly nudge the first time a person ever sees SAL
    var seen = false; try { seen = !!localStorage.getItem('dh_sal_seen'); } catch (e) {}
    fab.classList.add('hi');
    if (!seen) { tip.textContent = t('Ask SAL', 'Ask SAL') + ' · ' + t('find anything', 'encuentra lo que sea'); setTimeout(function () { tip.classList.add('on'); }, 1800); setTimeout(function () { tip.classList.remove('on'); }, 9000); }
  }
  function unmount() {
    if (!mounted) return; mounted = false; greeted = false; busy = false;
    var s = document.getElementById('sal-css'); if (s) s.remove(); if (root) root.remove();
  }

  // follow the session: appear after sign-in, disappear on sign-out
  var _save = DH.save, _clear = DH.clear;
  DH.save = function () { var r = _save.apply(this, arguments); setTimeout(mount, 0); return r; };
  DH.clear = function () { var r = _clear.apply(this, arguments); unmount(); return r; };
  window.__sal = true;
  DH.sal = { open: function () { mount(); open(); }, close: close, ask: function (q) { mount(); open(); return ask(q); } };
  mount();
})();
