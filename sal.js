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
  var ARTS = ART + 'static/';
  var FACE = { idle: 'sal-idle.svg', thinking: 'sal-thinking.svg', search: 'sal-search.svg', typing: 'sal-typing.svg', success: 'sal-success.svg', error: 'sal-error.svg' };
  var teachBtn, tv, canTeach = null, TD = null;
  var root, fab, tip, panel, logEl, form, input, sendBtn, faceEl, chipsEl, subEl, titleEl, xBtn, camBtn, camFile;
  var scanNote = null, scanning = false, ocrW = null, ocrLoading = null;
  var busy = false, faceTimer = 0, typingTimer = 0, slowTimer = 0, lastQ = '', mounted = false, greeted = false;

  var forced = null;   // language of the question being answered (overrides the app language for that reply)
  function L() { return forced || ((DH.i18n && DH.i18n.lang) === 'es' ? 'es' : 'en'); }
  /* Guess the language a person typed in (misspellings and missing accents included). null = not sure: keep the app language. */
  function detectLang(q) {
    var s = ' ' + String(q || '').toLowerCase().replace(/[¿?¡!.,;:()]/g, ' ') + ' ';
    var es = 0, en = 0;
    if (/[ñáéíóúü]/.test(s)) es += 2;
    var ES = ' que como cual cuales cuanto cuantos cuanta cuantas donde cuando quien por para con sin una un unos el la los las del al es esta este esto estos tiene tienen tenemos hay hago hacer puedo puede pueden necesito quiero busco dame dime ayuda venta ventas cliente clientes credito tienda precio precios existencia inventario colores color tamano medidas politica cancelar cancelacion devolucion reembolso entrega sobre mi mis su sus de en y o no si se me te lo le muy mas pero cuando '.split(' ');
    var EN = ' what how which where when who why the a an is are do does can could would should i we you my our your this that these those have has there for with without need want find show tell help sale sales customer customers credit store price prices stock inventory colors color size sizes policy cancel cancellation return refund delivery about of in on and or not if it me to at by from '.split(' ');
    s.trim().split(/\s+/).forEach(function (w) { if (ES.indexOf(' ' + w + ' ') >= 0 || ES.indexOf(w) >= 0) es++; if (EN.indexOf(w) >= 0) en++; });
    // fuzzy hints for common misspellings
    if (/cancel+a?c|cuant|tenem|dispon|precio|devolu|reembols|venta/.test(s)) es++;
    if (/\b(avail|inventor|refun|policy|price)/.test(s)) en++;
    if (es === en) return null;
    return es > en ? 'es' : 'en';
  }
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
    '#sal-panel{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(90px,calc(env(safe-area-inset-bottom) + 90px));width:min(400px,calc(100vw - 24px));height:min(640px,calc(100dvh - 112px));background:var(--o);border-radius:18px;box-shadow:0 18px 50px rgba(11,45,92,.35);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:scale(.08);transform-origin:calc(100% - 31px) calc(100% + 43px);visibility:hidden;transition:transform .24s cubic-bezier(.5,0,1,1),opacity .18s ease,visibility 0s linear .24s}' +
    '#sal-panel.open{opacity:1;transform:none;visibility:visible;transition:transform .45s cubic-bezier(.34,1.5,.5,1),opacity .2s ease}' +
    '#sal-panel.open #sal-hd,#sal-panel.open #sal-log,#sal-panel.open #sal-chips,#sal-panel.open #sal-form,#sal-panel.open #sal-tv{animation:salfade .35s ease .14s both}@keyframes salfade{from{opacity:0}to{opacity:1}}' +
    '#sal-root.open #sal-fab{transform:scale(.86)}' +
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
    '#sal-root.asked #sal-chips{flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;max-height:none;-webkit-overflow-scrolling:touch}#sal-chips{display:flex;flex-wrap:wrap;gap:6px;max-height:112px;overflow:auto;padding:0 12px 8px;flex:none}#sal-chips button.big{font-weight:700;border-color:#0B2D5C;min-height:44px}#sal-chips button{min-height:36px;border-radius:18px;border:1.5px solid #B7C6DA;background:#fff;color:var(--n);font:600 12.5px "Segoe UI",Arial,sans-serif;padding:0 12px;cursor:pointer;white-space:nowrap}#sal-chips button:hover{border-color:var(--t);background:#F0FFFF}' +
    '#sal-form{display:flex;gap:8px;padding:8px 12px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #D9E3EF;flex:none}' +
    '#sal-q{flex:1;min-width:0;height:44px;border:1.5px solid #B7C6DA;border-radius:22px;padding:0 16px;font:15px "Segoe UI",Arial,sans-serif;background:var(--o);color:var(--tx)}#sal-q:focus{border-color:var(--t);background:#fff;outline:none;box-shadow:0 0 0 3px rgba(0,217,217,.25)}' +
    '#sal-cam{flex:none;width:44px;height:44px;border-radius:50%;border:1.5px solid #B7C6DA;background:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}#sal-cam:disabled{opacity:.45}#sal-cam:not(:disabled):hover{border-color:var(--t)}' +
    '#sal-send{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:var(--n);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}#sal-send:disabled{opacity:.45;cursor:default}#sal-send:not(:disabled):hover{background:#12407f}' +
    '@media (max-width:520px){#sal-hd{padding-top:max(12px,calc(env(safe-area-inset-top) + 8px))}#sal-x{width:auto;min-width:44px;padding:0 14px;border-radius:22px;background:rgba(255,255,255,.2);font:700 15px Arial,sans-serif;white-space:nowrap}#sal-x::after{content:" Close / Cerrar"}#sal-panel{left:0;right:0;top:0;bottom:0;width:100%;max-width:100%;height:100%;border-radius:0;transform-origin:calc(100% - 47px) calc(100% - 47px)}#sal-root.open #sal-fab,#sal-root.open #sal-tip{display:none}#sal-log,#sal-tv{overflow-x:hidden}#sal-form{padding-bottom:calc(10px + env(safe-area-inset-bottom))}.sal-b,.sal-card{max-width:100%;overflow:hidden}.sal-b table{display:block;max-width:100%;overflow-x:auto}.sal-b img{max-width:100%}.sal-b ul,.sal-b li{overflow-wrap:anywhere}}' +
    '@media (prefers-reduced-motion:reduce){#sal-root *{animation:none!important;transition:none!important}}' +
    '#sal-teach{flex:none;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:#fff;font-size:20px;cursor:pointer}#sal-teach:hover,#sal-teach.on{background:rgba(255,255,255,.18)}' +
    '#sal-tv{flex:1;overflow:auto;padding:12px;display:none;flex-direction:column;gap:10px}#sal-root.teach #sal-tv{display:flex}#sal-root.teach #sal-log,#sal-root.teach #sal-chips,#sal-root.teach #sal-form{display:none}' +
    '#sal-tv h3{margin:2px 0 0;font:700 15px Georgia,serif;color:var(--n)}#sal-tv label{display:block;font:700 12px "Segoe UI",Arial,sans-serif;color:#33465f;margin:8px 0 3px}' +
    '#sal-tv input[type=text],#sal-tv input[type=number],#sal-tv textarea,#sal-tv select{width:100%;border:1.5px solid #B7C6DA;border-radius:10px;padding:9px 11px;font:14px "Segoe UI",Arial,sans-serif;background:#fff;color:var(--tx)}#sal-tv textarea{min-height:110px;resize:vertical}' +
    '#sal-tv input:focus,#sal-tv textarea:focus,#sal-tv select:focus{border-color:var(--t);outline:none;box-shadow:0 0 0 3px rgba(0,217,217,.25)}' +
    '.sal-ask{display:flex;gap:6px;align-items:center;justify-content:space-between;background:#fff;border:1px dashed #9FB4CF;border-radius:10px;padding:6px 8px;font-size:13px}.sal-ask b{font-weight:600;overflow-wrap:anywhere}' +
    '.sal-row{display:flex;gap:8px;align-items:center;justify-content:space-between;background:#fff;border:1px solid #D9E3EF;border-radius:10px;padding:8px 10px;font-size:13px}.sal-row .t{min-width:0;overflow-wrap:anywhere}.sal-row small{display:block;color:#5B6B82}' +
    '.sal-err{color:#b3261e;font-size:12.5px;font-weight:600;margin-top:6px}' +
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
    d.innerHTML = '<img class="av" alt="" src="' + ARTS + (FACE[face || 'idle']) + '"><div class="sal-b">' + html + '</div>';
    logEl.appendChild(d); scrollEnd(); return d;
  }
  function setBubble(node, html, face) {
    node.querySelector('.sal-b').innerHTML = html;
    node.querySelector('img.av').setAttribute('src', ARTS + FACE[face || 'idle']); scrollEnd();
  }

  /* ---------- opening files / pages ---------- */
  var viewerP = null;
  function loadViewer() {
    if (window.DH && DH.view) return Promise.resolve();
    if (!viewerP) viewerP = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'dh-viewer.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return viewerP;
  }
  async function openFile(archivoId, page, url, btn) {
    if (!archivoId) { if (url) { location.href = /^https?:/i.test(url) && url.indexOf(location.origin) !== 0 ? 'abrir.html?u=' + encodeURIComponent(url) + '&t=' + encodeURIComponent(document.title || '') : url; } return; }
    var old = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = t('Opening…', 'Abriendo…'); }
    try {
      await loadViewer();
      DH.view(archivoId, { page: page || 1 });
    } catch (e) {
      addSal(esc(t('I could not open that file. It may have been removed, or you may not have access any more.', 'No pude abrir ese archivo. Puede que lo hayan quitado o que ya no tengas acceso.')), 'error');
      setFace('error', 2500);
    } finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  /* ---------- render a search result ---------- */
  function renderResult(r, q) {
    if (r.saleMode && r.promos && r.promos.length) { r.paginas = []; r.documentos = []; }   // promo question: promotions only, no policy pages
    (r.paginas || []).forEach(function (p) { if (p.fragmento) p.fragmento = String(p.fragmento).replace(/[\uFFFD\uE000-\uF8FF\u25A1\u25AF]/g, ''); });
    var h = '', navs = navMatches(q);
    if (r.corregido) h += '<div class="sal-note">' + esc(t('Showing results for “', 'Mostrando resultados para “') + r.corregido + '” ' + t('(I fixed the spelling).', '(corregí la ortografía).')) + '</div>';
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
    if (r.personas && r.personas.length) {
      h += '<div class="sal-sec">' + esc(t('People', 'Personas')) + '</div>' + r.personas.map(function (p) {
        return '<div class="sal-card"><h4>' + esc(p.nombre) + '</h4><div class="meta">' + esc([p.puesto, p.ubicacion].filter(Boolean).join(' · ')) + '</div></div>';
      }).join('');
    }
    if (false) h += '<div class="sal-note">' + esc(t('I cannot see inside the flyers for that product yet. These are the promotions running now; open one to see the models and prices.', 'Todavía no veo ese producto dentro de los flyers. Estas son las promociones vigentes ahora; abre una para ver modelos y precios.')) + '</div>';
    if (r.promos && r.promos.length) {
      var card = function (p, i) {
        var badge = p.estado === 'vigente' ? '<span class="sal-badge">' + esc(t('Active', 'Vigente')) + '</span>' : p.estado === 'programada' ? '<span class="sal-badge soon">' + esc(t('Starts ', 'Empieza ') + fmtDate(p.vigente_desde)) + '</span>' : '<span class="sal-badge old">' + esc(t('Ended', 'Terminada')) + '</span>';
        return '<div class="sal-card"><h4>' + esc(p.titulo) + badge + '</h4><div class="meta">' + esc(fmtDate(p.vigente_desde) + (p.vigente_hasta ? ' – ' + fmtDate(p.vigente_hasta) : ' – ' + t('no end date', 'sin fecha final'))) + (p.seccion ? ' · ' + esc(p.seccion) : '') + '</div>' +
          (p.lineas ? '<p class="meta" style="margin:6px 0 2px">' + esc(t('Text read from the flyer (may have errors):', 'Texto leído del flyer (puede tener errores):')) + '</p><p style="white-space:pre-line;font-size:13px;margin:0">' + esc(String(p.lineas).replace(/^[\s\-–•|]+/gm, '').replace(/[“”"°¢¥]+/g, ' ').replace(/ {2,}/g, ' ')) + '</p>' : '') + (p.descripcion ? '<p>' + esc(p.descripcion) + '</p>' : '') + '<div class="sal-act"><button class="sal-btn pri" data-open="r' + i + '">' + esc(t('Open promo', 'Abrir promo')) + '</button></div></div>';
      };
      // "running now" only lists active promotions; the ones that have not started go under their own heading
      var now = [], soon = [];
      r.promos.forEach(function (p, i) { (p.estado === 'programada' ? soon : now).push(card(p, i)); });
      if (now.length) h += '<div class="sal-sec">' + esc(r.browse ? t('Running now', 'Vigentes ahora') : t('Promotions', 'Promociones')) + '</div>' + now.join('');
      if (soon.length) h += '<div class="sal-sec">' + esc(t('Coming soon (not active yet)', 'Próximas (todavía no vigentes)')) + '</div>' + soon.join('');
      h += '<div class="sal-act"><a class="sal-btn" href="promociones.html">' + esc(t('All promotions', 'Todas las promociones')) + '</a></div>';
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
    if (r.inv && r.inv.items && r.inv.items.length) {
      var pill = function (ok) { return '<span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:700;color:#fff;background:' + (ok ? '#1E8E5A' : '#B3402F') + '">' + esc(ok ? t('Available', 'Disponible') : t('Not available', 'No disponible')) + '</span>'; };
      h += '<div class="sal-sec">' + esc(t('Our inventory', 'Nuestro inventario')) + '</div>' + r.inv.items.map(function (it) {
        var line = '';
        if (r.inv.unidades) {
          line = '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;margin:8px 0 0;font-size:13px">' +
            (it.por_tienda === false ? [[t('Available units', 'Unidades disponibles'), it.unidades], [t('On hand · all stores', 'En existencia · todas las tiendas'), it.total == null ? '—' : it.total], [t('On order', 'En orden'), it.en_orden]] : [[t('Available units', 'Unidades disponibles'), it.unidades], [t('On hand · Euclid', 'En existencia · Euclid'), it.euclid], [t('On hand · Chino', 'En existencia · Chino'), it.chino], [t('On hand · Cerritos', 'En existencia · Cerritos'), it.cerritos], [t('On hand · Warehouse', 'En existencia · Bodega'), it.bodega], [t('On order', 'En orden'), it.en_orden]]).map(function (x, i) {
              return '<span' + (i === 0 ? ' style="font-weight:700;color:#1B3A6B"' : '') + '>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b>'; }).join('') + '</div>';
        }
        var where = '';
        if (!r.inv.unidades) {   // sellers: only warehouse and their own store, never other stores
          var w = [];
          if (it.en_tu_tienda) w.push(t('at your store', 'en tu tienda'));
          if (it.en_bodega) w.push(t('in the warehouse', 'en bodega'));
          if (w.length) where = '<div style="margin-top:6px;font-size:13px;color:#1E8E5A;font-weight:600">' + esc(t('Available ', 'Disponible ') + w.join(t(' and ', ' y '))) + '</div>';
          else if (it.solo_piso) where = '<div style="margin-top:6px;font-size:13px;color:#8A6D1D;font-weight:600">' + esc(t('Only the floor sample at your store', 'Solo la muestra de piso en tu tienda')) + '</div>';
        }
        var sell = '';
        if (it.precio != null && Number(it.precio) > 0) sell += '<span style="font-weight:700;color:#1B3A6B">$' + esc(Number(it.precio).toFixed(2)) + '</span>';
        if (!it.disponible && it.en_camino) sell += (sell ? ' · ' : '') + '<span style="color:#8A6D1D;font-weight:600">' + esc(t('On order, it is on the way', 'En orden, viene en camino')) + '</span>';
        if (sell) sell = '<div style="margin-top:6px;font-size:13px">' + sell + '</div>';
        return '<div class="sal-card"><h4>' + esc(it.modelo || it.sku) + '</h4><div class="meta">' + pill(it.disponible) + ' ' + (it.kit === 'K' ? '<b>KIT</b> · ' : '') + esc([it.descripcion, it.color].filter(Boolean).join(' · ')) + ' · SKU ' + esc(it.sku) + '</div>' + sell + where + line + '</div>';
      }).join('') + '<div class="sal-note">' + esc(t('Inventory report of ', 'Reporte de inventario del ') + (r.inv.reporte || '').replace(/\s+\d+:\d+:\d+.*$/, '')) + '</div>';
    }
    var hasInv = !!(r.inv && r.inv.items && r.inv.items.length);   // our inventory report is the only source of availability when it has the item
    if (r.web && r.web.length) {
      h += '<div class="sal-sec">' + esc(hasInv ? t('Product details', 'Detalles del producto') : t('Product', 'Producto')) + '</div>' + r.web.map(function (w) {
        var img = w.image ? '<img src="' + esc(w.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" style="float:right;width:84px;height:84px;object-fit:contain;margin:0 0 6px 10px;border-radius:8px;background:#fff">' : '';
        var badge = hasInv ? '' : '<span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:700;color:#fff;background:' + (w.available ? '#1E8E5A' : '#B3402F') + '">' + esc(w.available ? t('Available', 'Disponible') : t('Not available', 'No disponible')) + '</span>';
        var det = (w.details || []).length ? '<div style="clear:both;display:grid;grid-template-columns:minmax(84px,38%) minmax(0,1fr);gap:4px 12px;margin:8px 0 0;font-size:13px;overflow-wrap:break-word;word-break:normal">' + w.details.map(function (d) { return '<b style="color:#1B3A6B;min-width:0;overflow-wrap:break-word;word-break:normal">' + esc(d.k) + '</b><span style="min-width:0;overflow-wrap:break-word;word-break:normal">' + esc(d.v) + '</span>'; }).join('') + '</div>' : '';
        var promo = w.promo ? '<div style="clear:both;margin:8px 0 0;padding:8px 10px;border-radius:8px;background:#FDF1C9;color:#5c4400;font-size:13px"><b>🏷 ' + esc(t('Promotion on the website', 'Promoción en el sitio web')) + ':</b> ' + esc((w.promo.multi ? t('from ', 'desde ') : '') + '$' + w.promo.price.toLocaleString('en-US') + ' · ' + t('was ', 'antes ') + '$' + w.promo.was.toLocaleString('en-US') + ' · ' + t('save ', 'ahorra ') + '$' + w.promo.save.toLocaleString('en-US')) + '</div>' : '';
        var sm = w.summary ? '<p style="margin:8px 0 0">' + esc(w.summary) + '</p>' : '';
        var all = w.specs || [], first = all.slice(0, 6), more = all.slice(6);
        var sp = all.length ? '<ul style="clear:both;margin:8px 0 0 18px;padding:0;overflow-wrap:break-word;word-break:normal">' + first.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
          (more.length ? '<details style="margin:4px 0 0 18px"><summary style="cursor:pointer;font-weight:700;color:#1B3A6B;min-height:32px">' + esc(t('Show all specs (', 'Ver todas las especificaciones (') + all.length + ')') + '</summary><ul style="margin:4px 0 0 0;padding-left:18px">' + more.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></details>' : '') : '';
        var sub = [w.vendor, w.ptype].filter(Boolean).join(' · ');
        var opts = (w.options || []).filter(function (o) { return o.values && o.values.length; }).map(function (o) {
          return '<p><b>' + esc(o.name) + ' (' + o.values.length + '):</b> ' + esc(o.values.join(', ')) + '</p>';
        }).join('');
        var vav = !hasInv && (w.variants || []).length > 1 ? '<p>' + esc(t('By option: ', 'Por opción: ')) + esc(w.variants.map(function (v) { return v.title + (v.available ? ' ✓' : ' ✗'); }).join(' · ')) + '</p>' : '';
        return '<div class="sal-card" style="overflow:hidden">' + img + '<h4>' + esc(w.title) + '</h4><div class="meta">' + badge + (sub ? ' ' + esc(sub) : '') + '</div>' + promo + sm + det + opts + vav + sp + '</div>';
      }).join('');
    }
    if (!h) return '';
    if (r.saleMode) {   // promotions (flyers) first, then the website's sale items, then the rest
      var parts = h.split('<div class="sal-sec">'), pre = parts.shift(), rank = function (p) { return /^(Promotions|Promociones|Running now|Vigentes ahora)/.test(p) ? 0 : /^(Product|Producto)/.test(p) ? 1 : 2; };
      parts.sort(function (x, y) { return rank(x) - rank(y); });
      h = pre + parts.map(function (p) { return '<div class="sal-sec">' + p; }).join('');
    }
    return h + '<div class="sal-note">' + esc(hasInv ? t('SAL can make mistakes. Availability comes from our inventory report; check Infinity to be sure.', 'SAL puede cometer errores. La disponibilidad viene de nuestro reporte de inventario; consulta Infinity para estar seguro.') : (r.web && r.web.length) ? t('SAL can make mistakes. Availability comes from the website; check Infinity to be sure. Prices and promotions: use the store tag and the published flyers.', 'SAL puede cometer errores. La disponibilidad viene del sitio web; consulta Infinity para estar seguro. Precios y promociones: usa la etiqueta de tienda y los flyers publicados.') : t('SAL can make mistakes.', 'SAL puede cometer errores.')) + '</div>';
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


  /* ---------- scan a price tag: photo -> OCR in the browser (free) -> SKU -> the normal inventory answer ---------- */
  function loadTess() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (ok, no) {
      var sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      sc.onload = ok; sc.onerror = function () { no(new Error('ocr')); }; document.head.appendChild(sc);
    });
  }
  function getOcr() {
    if (ocrW) return Promise.resolve(ocrW);
    if (!ocrLoading) ocrLoading = loadTess().then(function () { return window.Tesseract.createWorker('eng'); }).then(function (w) { ocrW = w; return w; }).catch(function (e) { ocrLoading = null; throw e; });
    return ocrLoading;
  }
  async function prepImage(file) {
    var bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    var cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); if (bmp.close) bmp.close(); return cv;
  }
  /* Daniels tag: "301-635211" is the SKU without the dash, "Model: T737-9", price in big type. */
  function parseTag(text) {
    var T = String(text || '').replace(/[ \t]+/g, ' '), o = { sku: '', model: '', prices: [] }, m;
    m = T.match(/\b(\d{3})\s*[-–—]\s*(\d{6})\b/); if (m) o.sku = m[1] + m[2];
    if (!o.sku) { m = T.match(/\b(\d{9})\b/); if (m) o.sku = m[1]; }
    m = T.match(/Model:?\s*([A-Za-z0-9][A-Za-z0-9\-\/.]{2,})/i); if (m) o.model = m[1];
    (T.match(/\d[\d,]*\.\d{2}\b/g) || []).forEach(function (x) { o.prices.push(x.replace(/,/g, '')); });
    return o;
  }
  async function scanTag(file) {
    if (!file || busy || scanning) return;
    scanning = true; camBtn.disabled = true; sendBtn.disabled = true; forced = null; logEl.innerHTML = ''; root.classList.add('asked'); setFace('search');
    var w = addSal(esc(t('Reading the tag', 'Leyendo la etiqueta')) + '<span class="sal-dots" aria-hidden="true"><i></i><i></i><i></i></span>', 'search');
    var q = '';
    try {
      var r = await withTimeout((async function () { var W = await getOcr(); return W.recognize(await prepImage(file)); })(), 60000);
      var tag = parseTag(r && r.data && r.data.text);
      w.remove();
      q = tag.sku || tag.model;
      if (!q) { setFace('error', 2500); addSal(esc(t('I could not read the tag. Take the photo closer, without glare, with the whole tag in the frame, or type the SKU.', 'No pude leer la etiqueta. Toma la foto más cerca, sin reflejos y con toda la etiqueta en el cuadro, o escribe el SKU.')), 'error'); }
      else if (tag.prices.length) {
        try {
          var inv = await withTimeout(DH.rpc('inventario_consulta', { p_q: q }), 8000);
          var it = ((inv && inv.items) || []).filter(function (x) { return x.sku === tag.sku; })[0] || null;
          if (it && it.precio != null) {
            var sp = Number(it.precio).toFixed(2), ok = tag.prices.some(function (x) { return x === sp || x.slice(-sp.length) === sp; });   // a "$" read as a digit still matches
            scanNote = ok ? '<b>' + esc(t('Price check: the tag matches the system', 'Precio: la etiqueta coincide con el sistema')) + '</b> ($' + esc(sp) + ')'
              : '<b style="color:#B3402F">' + esc(t('Price check: the system says', 'Precio: el sistema dice')) + ' $' + esc(sp) + '.</b> ' + esc(t('The tag may be wrong, tell your manager.', 'La etiqueta puede estar mal, avisa a tu gerente.'));
          }
        } catch (e) {}
      }
    } catch (e) {
      w.remove(); setFace('error', 2500);
      addSal(esc(t('I could not read the photo right now. Type the SKU instead.', 'No pude leer la foto ahora. Escribe el SKU.')), 'error');
    }
    scanning = false; camBtn.disabled = false; sendBtn.disabled = false;
    if (q) ask(q);
  }

  /* ---------- ask ---------- */
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error('timeout')); }, ms); })]); }
  /* Product lookups on the website only when the question looks like a product / SKU / stock question. */
  function webQuery(q) {
    var stock = /\b(price|prices|stock|available|availability|inventory|have|sku|in stock|precio|precios|existencia|inventario|hay|tienen|tienes|disponible|cuesta|cuanto|how much)\b/i;
    var hasNum = /[a-z]*\d[a-z0-9*\-]*/i.test(q) && /\d{3,}|\d+[a-z]+\d*|[a-z]+\d+/i.test(q);
    var words = q.trim().split(/\s+/).length;
    if (!(stock.test(q) || hasNum || words <= 3)) return '';
    var c = q.replace(/\b(do we have|do you have|is there|how much is|how much|what is the price of|price of|in stock|available|stock|inventory|sku|price|cuanto cuesta|cuesta|tienen|tenemos|hay|existencia de|existencia|precio de|precio|inventario|disponible|de|del|the|a|an|el|la|los|las|un|una)\b/gi, ' ').replace(/[?¿!¡,]/g, ' ').replace(/\s+/g, ' ').trim();
    c = c.replace(/\b(este|esta|esto|ese|esa|producto|productos|articulo|item|product|this|that|disponib\w*|availab\w*|tenemos|tienen|have|we|you|it|is|are|en|in|for|por|para|con|with|stock|existenc\w*)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    var sku = (q.match(/[A-Za-z0-9][A-Za-z0-9*\-_.\/]{4,}/g) || []).filter(function (x) { return /\d/.test(x); });
    if (sku.length) return sku[0];              // a SKU / model alone matches best
    return c.length >= 3 ? c : '';
  }
  /* "What are the promotions?" with no product named: show what is running right now. */
  function isPromoBrowse(q) {
    var left = String(q || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\b(cuales|cual|que|hay|son|mas|most|more|promotion|promotions|tiene|tenemos|todas|all|las|los|la|el|de|del|en|para|por|hoy|ahora|actuales|actual|vigentes|vigente|importantes|importante|principales|mejores|mejor|nuevas|nuevos|tenemos|tienen|dame|dime|muestrame|quiero|ver|promo|promos|promocion|promociones|oferta|ofertas|descuento|descuentos|deal|deals|sale|black|friday|blackfriday|bf|cyber|monday|what|which|are|is|the|any|current|today|right|now|main|top|best|important|new|show|me|we|have|running|our|of|for|on|in|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return left === '';
  }
  var PROMO_RE = /promo|oferta|descuent|discount|\bdeals?\b|black\s*fr|blackfr|\bbf\b|\bsale\b|rebaj|cyber/i;
  async function ask(q) {
    q = String(q || '').trim(); if (q.length < 2 || busy) return;
    busy = true; lastQ = q; sendBtn.disabled = true; input.value = ''; root.classList.add('asked');
    forced = detectLang(q); logEl.innerHTML = ''; addMe(q); setFace('search');
    if (scanNote) { addSal(scanNote, 'search'); scanNote = null; }   // each question starts clean: the newest answer is at the top
    var chat = smallTalk(q);
    if (chat) { setFace('success', 1800); addSal(chat, 'success'); busy = false; sendBtn.disabled = false; root.classList.add('asked'); return; }
    var pi = personalIntent(q);
    if (pi) {
      var w0 = addSal(esc(t('Checking your information', 'Revisando tu información')) + '<span class="sal-dots" aria-hidden="true"><i></i><i></i><i></i></span>', 'search');
      try { var ph = await pi(); if (ph) { setBubble(w0, ph, 'success'); setFace('success', 2500); logEl.scrollTop = 0; forced = null; busy = false; sendBtn.disabled = false; return; } } catch (e) {}
      w0.remove();   // could not answer from the person's data: fall through to the normal search
    }
    var wait = addSal(esc(t('Searching the library, channels, promotions and the website', 'Buscando en la biblioteca, canales, promociones y el sitio web')) + '<span class="sal-dots" aria-hidden="true"><i></i><i></i><i></i></span>', 'search');
    clearTimeout(slowTimer);
    slowTimer = setTimeout(function () { setFace('thinking'); setBubble(wait, esc(t('Still looking, one moment', 'Sigo buscando, un momento')) + '<span class="sal-dots" aria-hidden="true"><i></i><i></i><i></i></span>', 'thinking'); }, 1800);
    try {
      var wq = webQuery(q), saleMode = PROMO_RE.test(q);
      if (saleMode && !(q.match(/[A-Za-z0-9*\-\/]{5,}/g) || []).some(function (x) { return /\d/.test(x); })) wq = '';   // promo question: flyers only (the website is not the source for promotions)
      var webP = (wq && DH.salWeb) ? withTimeout(DH.salWeb(wq), 10000).then(function (w) { return w && w.items || []; }).catch(function () { return []; }) : Promise.resolve([]);
      var invP = wq ? withTimeout(DH.rpc('inventario_consulta', { p_q: wq }), 8000).catch(function () { return null; }) : Promise.resolve(null);
      var r = await withTimeout(DH.rpc('sal_buscar', { p_q: q }), 20000);
      r.inv = await invP; r.saleMode = saleMode;
      try { DH.rpc('sal_marcar', { p_q: q, p_inv: !!(r.inv && r.inv.items && r.inv.items.length) }).catch(function () {}); } catch (e) {}   // so SKU lookups stop showing as "found nothing"
      var early = false;   // our inventory answers first; the website's photo, specs and promotion fill in below when they arrive
      if (r.inv && r.inv.items && r.inv.items.length) {
        var h0 = renderResult(Object.assign({}, r, { web: [] }), q);
        if (h0) { clearTimeout(slowTimer); setBubble(wait, h0 + '<div class="sal-note">' + esc(t('Loading specs…', 'Cargando especificaciones…')) + '</div>', 'success'); bindResult(wait, r); setFace('success', 2500); logEl.scrollTop = 0; early = true; }
      }
      r.web = await webP;
      if (saleMode && isPromoBrowse(q) && !(r.promos && r.promos.length)) { try { r.promos = await withTimeout(DH.rpc('sal_promos_vigentes', {}), 8000); r.browse = true; } catch (e) {} }
      clearTimeout(slowTimer);
      var html = renderResult(r, q);
      if (early && !(r.web && r.web.length)) { setBubble(wait, html, 'success'); bindResult(wait, r); }   // nothing more from the website: drop the "loading" line
      else if (!html) {
        setBubble(wait, '<b>' + esc(r.saleMode ? t('I could not find that promotion', 'No encontré esa promoción') : t('I found nothing about “', 'No encontré nada sobre “') + q + '”') + '</b><p>' + esc(r.saleMode ? t('It is not in the text of the published flyers and wraps, the promotions channel, or the product lists. Flyers that are only pictures may not be readable yet. Open Promotions to look at the flyers, or ask Marketing.', 'No aparece en el texto de los flyers y wraps publicados, en el canal de promociones ni en las listas de productos. Los flyers que son solo imagen pueden no ser legibles todavía. Abre Promociones para ver los flyers, o pregunta a Marketing.') : t('Nothing in the library, channels, promotions or news that you can access. That does not prove it does not exist: try other words (for example the product name, a policy name or the SKU), or ask your manager.', 'Nada en la biblioteca, canales, promociones ni novedades a los que tienes acceso. Eso no prueba que no exista: prueba con otras palabras (por ejemplo el nombre del producto, de la política o el SKU), o pregunta a tu gerente.')) + '</p>' + (r.saleMode ? '<div class="sal-act"><a class="sal-btn pri" href="promociones.html">' + esc(t('Open Promotions', 'Abrir Promociones')) + '</a></div>' : ''), 'thinking');
        setFace('thinking', 2500); chipsEl.style.display = '';   // offer the quick topics again
      } else {
        setBubble(wait, html, 'success'); bindResult(wait, r); setFace('success', 2500);
        logEl.scrollTop = 0;
      }
    } catch (e) {
      clearTimeout(slowTimer);
      var expired = /expired/i.test(e && e.message);
      setBubble(wait, '<b>' + esc(expired ? t('Your session ended.', 'Tu sesión terminó.') : t('I could not search right now.', 'No pude buscar en este momento.')) + '</b><p>' + esc(expired ? t('Please sign in again.', 'Inicia sesión de nuevo.') : t('Check your connection and try again.', 'Revisa tu conexión e intenta de nuevo.')) + '</p>' +
        (expired ? '' : '<div class="sal-act"><button class="sal-btn pri" data-retry="1">' + esc(t('Try again', 'Intentar de nuevo')) + '</button></div>'), 'error');
      var rb = wait.querySelector('[data-retry]'); if (rb) rb.addEventListener('click', function () { wait.remove(); ask(lastQ); });
      setFace('error', 3000);
    } finally { forced = null; busy = false; sendBtn.disabled = false; if (panel.classList.contains('open') && window.matchMedia('(pointer:fine)').matches) input.focus(); }
  }

  /* ---------- chrome ---------- */
  function texts() {
    titleEl.textContent = 'Ask SAL';
    subEl.textContent = t('Your Daniels assistant', 'Tu asistente de Daniels');
    xBtn.setAttribute('aria-label', t('Close Ask SAL', 'Cerrar Ask SAL'));
    teachBtn.setAttribute('aria-label', t('Teach SAL a quick answer', 'Enseñarle una respuesta rápida a SAL')); teachBtn.setAttribute('title', teachBtn.getAttribute('aria-label'));
    fab.setAttribute('aria-label', t('Ask SAL', 'Ask SAL'));
    input.setAttribute('placeholder', t('Ask SAL… e.g. price match, refund, SKU', 'Pregúntale a SAL… ej. price match, reembolso, SKU'));
    input.setAttribute('aria-label', t('Type your question', 'Escribe tu pregunta'));
    sendBtn.setAttribute('aria-label', t('Send', 'Enviar'));
    camBtn.setAttribute('aria-label', t('Scan a price tag', 'Escanear una etiqueta')); camBtn.setAttribute('title', camBtn.getAttribute('aria-label'));
    var q = L() === 'es'
      ? [['📣 Promociones de hoy', '¿Hay promociones vigentes?'], ['🔎 Buscar un producto o SKU', '@product'], ['Política de price match', 'Política de price match'], ['¿Cómo proceso una devolución?', '¿Cómo proceso una devolución?'], ['Cancelar y reembolsar en Infinity', 'Cancelar y reembolsar en Infinity'], ['¿Dónde está mi horario?', '¿Dónde está mi horario?']]
      : [['📣 Promotions today', 'Any promotions right now?'], ['🔎 Look up a product or SKU', '@product'], ['Price match policy', 'Price match policy'], ['How do I process a return?', 'How do I process a return?'], ['Cancel and refund in Infinity', 'Cancel and refund in Infinity'], ['Where is my schedule?', 'Where is my schedule?']];
    chipsEl.innerHTML = q.map(function (x, i) { return '<button type="button" data-q="' + esc(x[1]) + '"' + (i < 2 ? ' class="big"' : '') + '>' + esc(x[0]) + '</button>'; }).join('');
  }

  /* ---------- Personality: greetings, small talk and the odd motivating line (no AI; plain scripted replies) ---------- */
  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
  function firstName() { var e = DH.emp && DH.emp(); return e && String(e.nombre_completo || e.nombre || '').trim().split(/\s+/)[0] || ''; }
  function dayPart() { var h = new Date().getHours(); return h < 5 ? 'night' : h < 12 ? 'morning' : h < 19 ? 'afternoon' : 'night'; }
  var MOTIV = [
    ['Every “no” gets you closer to the next “yes”.', 'Cada “no” te acerca al siguiente “sí”.'],
    ['People remember how you made them feel, not the discount.', 'La gente recuerda cómo la hiciste sentir, no el descuento.'],
    ['Small things done well, all day long, make a great day.', 'Las cosas pequeñas bien hechas todo el día hacen un gran día.'],
    ['Smile first, talk about sofas second.', 'Primero sonríe, luego hablas de sofás.'],
    ['A customer who feels listened to is already halfway sold.', 'Un cliente que se siente escuchado ya está a medio camino de comprar.'],
    ['Ask one more good question before you quote the price.', 'Haz una pregunta buena más antes de dar el precio.'],
    ['You are the reason someone’s home feels like home.', 'Tú eres la razón por la que la casa de alguien se siente hogar.'],
    ['Good energy is contagious. Share it.', 'La buena energía se contagia. Compártela.'],
    ['Progress, not perfection. One customer at a time.', 'Progreso, no perfección. Un cliente a la vez.'],
    ['A tough morning does not decide the afternoon.', 'Una mañana difícil no decide la tarde.'],
    ['Your best sale today could be the next person who walks in.', 'Tu mejor venta de hoy puede ser la próxima persona que entre.'],
    ['Be the salesperson you would want to buy from.', 'Sé el vendedor al que tú le comprarías.']
  ];
  function motiv() { var m = pickOne(MOTIV); return '<p style="margin:8px 0 0;font-style:italic;color:#33465f">“' + esc(t(m[0], m[1])) + '”</p>'; }
  function hello(nm) {
    var p = dayPart(), n = nm ? ', ' + nm : '';
    var en = { morning: ['Good morning' + n + '!', 'Morning' + n + '! Coffee first, then customers.'], afternoon: ['Good afternoon' + n + '!', 'Hey' + n + '! Hope the day is treating you well.'], night: ['Good evening' + n + '!', 'Hey' + n + '! Still going strong.'] };
    var es = { morning: ['¡Buenos días' + n + '!', '¡Buen día' + n + '! Primero el café, luego los clientes.'], afternoon: ['¡Buenas tardes' + n + '!', '¡Hola' + n + '! Ojalá el día te esté tratando bien.'], night: ['¡Buenas noches' + n + '!', '¡Hola' + n + '! Todavía con todo.'] };
    var i = Math.floor(Math.random() * 2);
    return t(en[p][i], es[p][i]);
  }

  /* ---------- Personal answers: schedule, holiday schedule, certifications (each uses the same permission-checked RPC as its own page) ---------- */
  function norm(q) { return String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  var LAZ = 'America/Los_Angeles';
  function todayLA() { return new Date().toLocaleDateString('en-CA', { timeZone: LAZ }); }
  function addDays(d, n) { var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function fmtDay(d, o) { return new Date(d + 'T12:00:00Z').toLocaleDateString(L() === 'es' ? 'es-US' : 'en-US', Object.assign({ timeZone: 'UTC' }, o || { weekday: 'short', month: 'short', day: 'numeric' })); }
  function fmtT(x) { var p = String(x).split(':'), h = +p[0], m = +p[1], ap = h >= 12 ? 'p' : 'a', h12 = h % 12 === 0 ? 12 : h % 12; return m ? h12 + ':' + (m < 10 ? '0' : '') + m + ap : h12 + ap; }
  function shiftTxt(c) {
    if (!c) return t('no shift listed', 'sin turno asignado');
    if (c.libre) return t('OFF', 'LIBRE');
    var a = c.t || []; return a.length === 4 ? fmtT(a[0]) + '–' + fmtT(a[1]) + ' & ' + fmtT(a[2]) + '–' + fmtT(a[3]) : a.length >= 2 ? fmtT(a[0]) + '–' + fmtT(a[1]) : t('no shift listed', 'sin turno asignado');
  }
  function openBtn(href, en, es) { return '<div class="sal-act"><a class="sal-btn pri" href="' + href + '">' + esc(t(en, es)) + '</a></div>'; }
  function personalIntent(q) {
    var s = norm(q);
    var hol = /(feriado|holiday|thanksgiving|accion de gracias|black friday|christmas|navidad|nochebuena|new year|ano nuevo)/.test(s);
    var sch = /(horario|schedule|turno|shift|\bwork\b|trabaj|me toca|toca entrar|a que hora|cuando entro|cuando salgo|what time do i|do i work|on call|libre|\boff\b)/.test(s);
    if (hol && sch) return function () { return holidayAnswer(s); };
    if (!hol && /(horario|schedule|turno|\bshift\b|a que hora (entro|salgo|trabajo|me toca)|cuando (entro|salgo|trabajo|me toca)|when do i (work|start|get off)|what time do i|do i work|me toca|mis horas|my hours|trabajo (hoy|manana))/.test(s) && !/(promo|policy|politica|refund|reembolso)/.test(s)) return function () { return scheduleAnswer(s); };
    if (/(certificacion|certification|\btier ?[12]\b|mis intentos|my attempts|attempts left|intentos|\bexamen\b|\bexam\b|aprobe|did i pass)/.test(s)) return function () { return certAnswer(); };
    return null;
  }
  async function scheduleAnswer(s) {
    var off = /\b(manana|tomorrow)\b/.test(s) ? 1 : /\b(hoy|today)\b/.test(s) ? 0 : null;
    var nextW = /(next week|proxima semana|semana que viene|siguiente semana|semana proxima)/.test(s);
    var S = await withTimeout(DH.rpc('horarios_ver', { p_tienda: null, p_semana: null }), 10000);
    if (!S || !(S.tiendas || []).length) return '<b>' + esc(t('No schedule yet', 'Aún no hay horario')) + '</b><p>' + esc(t('There is no schedule published for your location yet.', 'Todavía no hay un horario publicado para tu ubicación.')) + '</p>';
    var target = off != null ? addDays(todayLA(), off) : null;
    if (nextW) S = await withTimeout(DH.rpc('horarios_ver', { p_tienda: S.tienda, p_semana: addDays(S.semana, 7) }), 10000);
    else if (target && !(S.dias || []).some(function (d) { return d.d === target; })) S = await withTimeout(DH.rpc('horarios_ver', { p_tienda: S.tienda, p_semana: target }), 10000);
    var mine = (S.filas || []).filter(function (r) { return S.mi_roster_id && r.roster_id === S.mi_roster_id; })[0];
    var link = openBtn('horarios.html', 'Open the full schedule', 'Abrir el horario completo');
    if (!mine) return '<b>' + esc(t('I cannot find you in this schedule', 'No te encuentro en este horario')) + '</b><p>' + esc(t('You are not listed in the ' + S.tienda + ' schedule for that week. Ask your manager if this looks wrong.', 'No apareces en el horario de ' + S.tienda + ' de esa semana. Pregunta a tu gerente si esto parece un error.')) + '</p>' + link;
    var nm = firstName(), days = S.dias || [];
    if (target) {
      var c = (mine.celdas || {})[target], lab = off === 0 ? t('Today', 'Hoy') : t('Tomorrow', 'Mañana');
      var d = days.filter(function (x) { return x.d === target; })[0], fe = d && (d.fiestas || []).length ? '<p>🎉 ' + esc(d.fiestas.join(', ')) + '</p>' : '';
      return '<b>' + esc(lab + ' (' + fmtDay(target) + '): ' + shiftTxt(c)) + '</b>' + (c && !c.libre && c.t ? '<p>' + esc(S.tienda) + '</p>' : '') + fe + link;
    }
    var T = todayLA();
    var rows = days.map(function (d) { var c = (mine.celdas || {})[d.d]; return '<div' + (d.d === T ? ' style="font-weight:700"' : '') + '>' + esc(fmtDay(d.d) + ': ' + shiftTxt(c)) + (d.fiestas && d.fiestas.length ? ' 🎉' : '') + '</div>'; }).join('');
    return '<b>' + esc(nextW ? t('Your schedule next week', 'Tu horario la próxima semana') : t('Your schedule this week', 'Tu horario esta semana')) + (nm ? ', ' + esc(nm) : '') + '</b><p>' + esc(S.tienda) + (S.publicado ? '' : ' · ' + esc(t('draft, not published yet', 'borrador, aún sin publicar'))) + '</p>' + rows + link;
  }
  async function holidayAnswer(s) {
    var H = await withTimeout(DH.rpc('feriados_ver', {}), 10000);
    if (!H || H.acceso === false) return '<b>' + esc(t('That schedule is not available for your role', 'Ese horario no está disponible para tu puesto')) + '</b><p>' + esc(t('The department holiday schedule is only shown to managers, supervisors and directors. Your store schedule has your own holiday shifts.', 'El horario de feriados por departamento solo lo ven gerentes, supervisores y directores. Tu horario de tienda trae tus turnos de feriados.')) + '</p>' + openBtn('horarios.html', 'Open my schedule', 'Abrir mi horario');
    var dates = (H.fechas || []).filter(function (f) { return f.fecha >= todayLA(); }), key = null;
    var kw = [['thanksgiving', /thanksgiving|accion de gracias/], ['black friday', /black friday/], ['christmas eve', /christmas eve|nochebuena/], ['christmas day', /christmas day|navidad|christmas(?! eve)/], ['new year', /new year|ano nuevo/]];
    kw.forEach(function (k) { if (!key && k[1].test(s)) key = k[0]; });
    var pick = key ? (H.fechas || []).filter(function (f) { return norm((f.en || '') + ' ' + (f.es || '')).indexOf(key) >= 0 || (key === 'christmas day' && /christmas|navidad/.test(norm(f.en + ' ' + f.es))) || (key === 'new year' && /new year|ano nuevo/.test(norm(f.en + ' ' + f.es))); }) : dates;
    if (!pick.length) pick = dates;
    var fila = (H.filas || []).filter(function (f) { var d = norm(f.depto); return d.length > 2 && s.indexOf(d) >= 0; })[0] || (H.filas || []).filter(function (f) { return f.id === H.mia; })[0];
    var link = openBtn('horarios.html#feriados', 'Open the holiday schedule', 'Abrir el horario de feriados');
    if (!fila) return '<b>' + esc(t('Holiday schedule', 'Horario de feriados')) + '</b><p>' + esc(t('I could not tell which department you mean. Say the department name (for example “Delivery holiday schedule”), or open it.', 'No supe a qué departamento te refieres. Escribe el nombre del departamento (por ejemplo “horario de feriados de Delivery”), o ábrelo.')) + '</p>' + link;
    var idx = {}; (H.fechas || []).forEach(function (f, i) { idx[f.orden] = i; });
    var lines = pick.map(function (f) { var st = (fila.estados || [])[(f.orden || 1) - 1], nt = (fila.notas || [])[(f.orden || 1) - 1]; return '<div>' + esc((L() === 'es' ? f.es : f.en) + ' · ' + fmtDay(f.fecha) + ': ' + (st || '—') + (nt ? ' (' + nt + ')' : '')) + '</div>'; }).join('');
    return '<b>' + esc(fila.depto + ' — ' + t('holiday schedule', 'horario de feriados')) + '</b>' + lines + (fila.nota ? '<p>' + esc(fila.nota) + '</p>' : '') + link;
  }
  async function certAnswer() {
    var est = await withTimeout(DH.rpc('certificacion_estado', {}), 10000);
    if (!est || !est.length) return null;
    var nm = firstName();
    var lines = est.map(function (x) {
      var name = x.certificacion === 'tier1' ? 'Tier 1' : x.certificacion === 'tier2' ? 'Tier 2' : x.certificacion;
      var st = x.aprobado ? t('passed ✓', 'aprobado ✓') : x.restantes > 0 ? t('not passed yet — ' + x.restantes + ' attempt' + (x.restantes === 1 ? '' : 's') + ' left', 'aún sin aprobar — te quedan ' + x.restantes + ' intento' + (x.restantes === 1 ? '' : 's')) : t('not passed — no attempts left, ask your manager', 'sin aprobar — ya no tienes intentos, pregunta a tu gerente');
      return '<div>' + esc(name + ': ' + st + ' (' + x.intentos + '/' + x.limite + ' ' + t('attempts used', 'intentos usados') + ')') + '</div>';
    }).join('');
    return '<b>' + esc(t('Your certifications', 'Tus certificaciones') + (nm ? ', ' + nm : '')) + '</b>' + lines + openBtn('index.html', 'Open my certifications', 'Abrir mis certificaciones');
  }

  function smallTalk(q) {
    var s = String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/\b(sal|porfa|por favor|please|amigo|bro|wey|compa)\b/g, '').replace(/\s+/g, ' ').trim();
    var nm = firstName(), chip = '<div class="sal-note" style="border:0;margin-top:8px;padding:0">' + esc(t('Tell me what you need. I can look up policies, Infinity steps, promotions, products and what was posted in the channels.', 'Dime qué necesitas. Puedo buscar políticas, pasos de Infinity, promociones, productos y lo que se publicó en los canales.')) + '</div>';
    var asks = [
      [/^(hola|holi|holis|hello|hi|hey|hey there|buenas|buenos dias|buen dia|buenas tardes|buenas noches|good morning|good afternoon|good evening|morning|que onda|quiubo|quihubo|saludos|ola)$/, function () {
        var lines = [t('How is your day going?', '¿Cómo va tu día?'), t('Ready to sell some furniture?', '¿Listo para vender muebles?'), t('What are we getting done today?', '¿Qué vamos a hacer hoy?'), t('I am ready when you are.', 'Estoy listo cuando tú lo estés.')];
        return '<b>' + esc(hello(nm)) + '</b><p>' + esc(pickOne(lines)) + '</p>' + (Math.random() < 0.4 ? motiv() : '') + chip;
      }],
      [/^(como estas|como andas|como va|como te va|que tal|como amaneciste|how are you|how are you doing|how is it going|how is your day|whats up|what s up|sup|que hay de nuevo|todo bien)$/, function () {
        return '<b>' + esc(pickOne([t('Doing great, thanks for asking!', '¡Muy bien, gracias por preguntar!'), t('All good here, ready to help!', '¡Todo bien por acá, listo para ayudar!')])) + '</b><p>' + esc(t('And you' + (nm ? ', ' + nm : '') + '? How is the day going?', '¿Y tú' + (nm ? ', ' + nm : '') + '? ¿Cómo va el día?')) + '</p>' + chip;
      }],
      [/^(gracias|muchas gracias|mil gracias|thanks|thank you|thx|ty|te lo agradezco|genial gracias|perfecto gracias|ok gracias)$/, function () {
        return '<b>' + esc(pickOne([t('You got it!', '¡Con gusto!'), t('Anytime!', '¡Cuando quieras!'), t('My pleasure!', '¡Para eso estoy!')])) + '</b><p>' + esc(t('Anything else I can look up?', '¿Algo más que pueda buscar?')) + '</p>';
      }],
      [/^(adios|bye|chao|chau|hasta luego|nos vemos|good bye|goodbye|see you|see ya|me voy)$/, function () {
        return '<b>' + esc(pickOne([t('See you soon' + (nm ? ', ' + nm : '') + '!', '¡Hasta pronto' + (nm ? ', ' + nm : '') + '!'), t('Take care and go make some sales!', '¡Cuídate y a vender!')])) + '</b>' + motiv();
      }],
      [/^(quien eres|que eres|quien es sal|who are you|what are you|que haces|que puedes hacer|what can you do|ayuda|help|ayudame|help me|como funcionas)$/, function () {
        return '<b>' + esc(t('I am SAL, the workspace assistant.', 'Soy SAL, el asistente del workspace.')) + '</b><p>' + esc(t('I am not a chatbot that invents answers: I search what the company already published (library, Infinity steps, promotions, products on the website and the channels) and show you the source. If I cannot find it, I will say so.', 'No soy un chatbot que inventa respuestas: busco lo que la empresa ya publicó (biblioteca, pasos de Infinity, promociones, productos del sitio y los canales) y te muestro la fuente. Si no lo encuentro, te lo digo.')) + '</p>' + chip;
      }],
      [/^(motivame|motivate|motivate me|animo|dame animo|dame una frase|una frase|frase del dia|dame una frase motivadora|motivation|inspire me|inspirame|cheer me up|necesito animo)$/, function () {
        return '<b>' + esc(t('Here you go' + (nm ? ', ' + nm : '') + ':', 'Va' + (nm ? ', ' + nm : '') + ':')) + '</b>' + motiv();
      }]
    ];
    var langOf = function (x) {   // answer in the language the person used
      if (/\b(hola|holi|holis|ola|buenas|buenos|buen dia|que onda|quiubo|quihubo|saludos|como|que tal|que hay|todo bien|gracias|adios|chao|chau|hasta|nos vemos|me voy|quien|eres|ayuda|ayudame|motivame|animo|frase|dia|estas|andas)\b/.test(x)) forced = 'es';
      else if (/\b(hello|hi|hey|good|morning|afternoon|evening|how|whats|what|sup|thanks|thank|thx|ty|bye|goodbye|see|who|help|motivate|motivation|inspire|cheer|day)\b/.test(x)) forced = 'en';
    };
    var run = function (x) {
      for (var i = 0; i < asks.length; i++) if (asks[i][0].test(x)) return i;
      return -1;
    };
    // "hoy", "today", "tu dia" do not change what the person is asking
    var core = s.replace(/\b(hoy|today|tu dia|your day|el dia|esta manana|this morning)\b/g, '').replace(/\s+/g, ' ').trim();
    var k = run(s); if (k < 0) k = run(core);
    if (k >= 0) { langOf(s); return asks[k][1](); }
    // greeting + something else: "hola como estas", "hello how are you", "buenas gracias"
    var g = core.match(/^(hola|holi|holis|hello|hi|hey|buenas|buenos dias|buen dia|buenas tardes|buenas noches|good morning|good afternoon|good evening|morning|que onda|quiubo|saludos)\s+(.+)$/);
    if (g) {
      var k2 = run(g[2]);
      if (k2 > 0) { langOf(s); return '<b>' + esc(hello(nm)) + '</b><p>' + asks[k2][1]() + '</p>'; }
    }
    return null;
  }

  function greet() {
    if (greeted) return; greeted = true;
    addSal('<b>' + esc(hello(firstName())) + '</b><p>' + esc(t('I am SAL. Ask me about policies, Infinity steps, promotions, products or what was posted in the channels, or about your schedule and certifications.', 'Soy SAL. Pregúntame por políticas, pasos de Infinity, promociones, productos o lo que se publicó en los canales, o por tu horario y tus certificaciones.')) + '</p>' + (Math.random() < 0.35 ? motiv() : ''));
  }

  /* ---------- Teach SAL: people with the "sal" permission write quick answers (shown first in results) ---------- */
  async function checkTeach() {
    /* SAL answers only from the library and database; nobody writes answers for it. */
    canTeach = false; teachBtn.hidden = true;
  }
  function teachClose() { root.classList.remove('teach'); teachBtn.classList.remove('on'); teachBtn.setAttribute('aria-pressed', 'false'); }
  async function teachOpen(prefill) {
    root.classList.add('teach'); teachBtn.classList.add('on'); teachBtn.setAttribute('aria-pressed', 'true'); setFace('thinking');
    tv.innerHTML = '<p>' + esc(t('Loading…', 'Cargando…')) + '</p>';
    try { TD = await DH.rpc('sal_respuestas_listar', {}); } catch (e) { tv.innerHTML = '<p class="sal-err">' + esc(t('Could not load. Try again.', 'No se pudo cargar. Intenta de nuevo.')) + '</p>'; setFace('error', 2500); return; }
    setFace('idle'); teachList(prefill);
  }
  function teachList(prefill) {
    var h = '<h3>' + esc(t('Teach SAL', 'Enseñar a SAL')) + '</h3><p style="margin:0;font-size:12.5px;color:#5B6B82">' + esc(t('Quick answers appear first when someone asks. Write them in plain words and point to the source document.', 'Las respuestas rápidas salen primero cuando alguien pregunta. Escríbelas con palabras sencillas y señala el documento fuente.')) + '</p>' +
      '<div class="sal-act"><button type="button" class="sal-btn pri" data-t="new">+ ' + esc(t('New quick answer', 'Nueva respuesta rápida')) + '</button><button type="button" class="sal-btn" data-t="back">' + esc(t('Back to chat', 'Volver al chat')) + '</button></div>';
    if (TD.sin_resultado && TD.sin_resultado.length) {
      h += '<div class="sal-sec">' + esc(t('People asked and SAL found nothing (30 days)', 'Preguntaron y SAL no encontró nada (30 días)')) + '</div>' + TD.sin_resultado.map(function (x, i) {
        return '<div class="sal-ask"><b>' + esc(x.q) + ' <span style="color:#5B6B82;font-weight:400">×' + x.n + '</span></b><button type="button" class="sal-btn" data-t="ans" data-i="' + i + '">' + esc(t('Answer', 'Responder')) + '</button></div>'; }).join('');
    }
    if (TD.skus && TD.skus.length) {
      h += '<div class="sal-sec">' + esc(t('SKUs people looked up that are not in the inventory (30 days)', 'SKUs que buscaron y no están en el inventario (30 días)')) + '</div><div style="font-size:13px;line-height:1.7">' + TD.skus.map(function (x) {
        return '<b>' + esc(x.q) + '</b> <span style="color:#5B6B82">×' + x.n + '</span>'; }).join(' &nbsp; ') + '</div>';
    }
    h += '<div class="sal-sec">' + esc(t('Your quick answers', 'Tus respuestas rápidas')) + ' (' + (TD.items || []).length + ')</div>';
    h += (TD.items || []).map(function (a, i) {
      return '<div class="sal-row"><div class="t"><b>' + esc(a.titulo) + '</b>' + (a.activo ? '' : ' <span class="sal-badge old">' + esc(t('Hidden', 'Oculta')) + '</span>') + '<small>' + esc(a.recurso ? a.recurso + (a.pagina ? ' · ' + t('page ', 'pág. ') + a.pagina : '') : t('No source linked', 'Sin fuente')) + '</small></div>' +
        '<button type="button" class="sal-btn" data-t="edit" data-i="' + i + '">' + esc(t('Edit', 'Editar')) + '</button></div>'; }).join('') || '<p style="font-size:13px;color:#5B6B82">' + esc(t('None yet.', 'Todavía no hay.')) + '</p>';
    tv.innerHTML = h; tv.scrollTop = 0;
    if (prefill) teachForm(null, prefill);
  }
  function teachForm(a, prefillTitle) {
    a = a || { titulo: prefillTitle || '', palabras: '', respuesta: '', recurso_id: null, pagina: '', activo: true };
    var opts = '<option value="">' + esc(t('No source (answer only)', 'Sin fuente (solo la respuesta)')) + '</option>' + (TD.recursos || []).map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === a.recurso_id ? ' selected' : '') + '>' + esc(r.titulo) + '</option>'; }).join('');
    tv.innerHTML = '<h3>' + esc(a.id ? t('Edit quick answer', 'Editar respuesta rápida') : t('New quick answer', 'Nueva respuesta rápida')) + '</h3>' +
      '<form id="sal-tf" autocomplete="off"><label for="tf-t">' + esc(t('What do people ask? (the question or task)', '¿Qué preguntan? (la pregunta o tarea)')) + '</label><input type="text" id="tf-t" maxlength="200" value="' + esc(a.titulo) + '">' +
      '<label for="tf-k">' + esc(t('Other words people use (optional, English and Spanish)', 'Otras palabras que usan (opcional, inglés y español)')) + '</label><input type="text" id="tf-k" maxlength="400" value="' + esc(a.palabras || '') + '">' +
      '<label for="tf-a">' + esc(t('Answer', 'Respuesta')) + '</label><textarea id="tf-a" maxlength="3000">' + esc(a.respuesta) + '</textarea>' +
      '<label for="tf-r">' + esc(t('Source document', 'Documento fuente')) + '</label><select id="tf-r">' + opts + '</select>' +
      '<label for="tf-p">' + esc(t('Page in the document (optional)', 'Página del documento (opcional)')) + '</label><input type="number" id="tf-p" min="1" max="999" inputmode="numeric" value="' + esc(a.pagina || '') + '">' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="tf-v"' + (a.activo ? ' checked' : '') + ' style="width:auto"> ' + esc(t('Visible to everyone who can see the source', 'Visible para todos los que ven la fuente')) + '</label>' +
      '<div class="sal-err" id="tf-e" role="alert" hidden></div>' +
      '<div class="sal-act"><button type="submit" class="sal-btn pri">' + esc(t('Save', 'Guardar')) + '</button><button type="button" class="sal-btn" data-t="cancel">' + esc(t('Cancel', 'Cancelar')) + '</button>' +
      (a.id ? '<button type="button" class="sal-btn" data-t="del" style="margin-left:auto;color:#b3261e;border-color:#b3261e">' + esc(t('Delete', 'Borrar')) + '</button>' : '') + '</div></form>';
    var f = tv.querySelector('#sal-tf'); tv.scrollTop = 0; setTimeout(function () { var x = tv.querySelector('#tf-t'); if (x) x.focus(); }, 30);
    f.addEventListener('submit', async function (e) {
      e.preventDefault(); var er = tv.querySelector('#tf-e'); er.hidden = true; var b = f.querySelector('button[type=submit]'); b.disabled = true;
      try {
        var r = await DH.rpc('sal_respuesta_guardar', { p_id: a.id || null, p_titulo: tv.querySelector('#tf-t').value, p_palabras: tv.querySelector('#tf-k').value, p_respuesta: tv.querySelector('#tf-a').value,
          p_recurso_id: tv.querySelector('#tf-r').value || null, p_pagina: parseInt(tv.querySelector('#tf-p').value, 10) || null, p_activo: tv.querySelector('#tf-v').checked });
        if (r && r.error) { er.textContent = r.error === 'title' ? t('Write what people ask (at least 3 letters).', 'Escribe qué preguntan (al menos 3 letras).') : r.error === 'answer' ? t('Write the answer.', 'Escribe la respuesta.') : t('Could not save.', 'No se pudo guardar.'); er.hidden = false; b.disabled = false; return; }
        setFace('success', 2000); await teachOpen();
      } catch (x) { er.textContent = t('Could not save. Try again.', 'No se pudo guardar. Intenta de nuevo.'); er.hidden = false; b.disabled = false; setFace('error', 2000); }
    });
    tv.querySelector('[data-t=del]') && tv.querySelector('[data-t=del]').addEventListener('click', function () {
      var d = this; if (d.getAttribute('data-sure') !== '1') { d.setAttribute('data-sure', '1'); d.textContent = t('Tap again to delete', 'Toca otra vez para borrar'); return; }
      DH.rpc('sal_respuesta_borrar', { p_id: a.id }).then(function () { setFace('success', 1500); teachOpen(); }).catch(function () { var er = tv.querySelector('#tf-e'); er.textContent = t('Could not delete.', 'No se pudo borrar.'); er.hidden = false; });
    });
  }
  function teachClick(e) {
    var b = e.target.closest && e.target.closest('button[data-t]'); if (!b) return; var k = b.getAttribute('data-t'), i = +b.getAttribute('data-i');
    if (k === 'new') teachForm(null); else if (k === 'edit') teachForm(TD.items[i]); else if (k === 'ans') teachForm(null, TD.sin_resultado[i].q);
    else if (k === 'cancel') teachList(); else if (k === 'back') { teachClose(); input.focus(); }
  }
  function open() {
    mounted && (panel.classList.add('open'), root.classList.add('open'), fab.setAttribute('aria-expanded', 'true'));
    tip.classList.remove('on'); try { localStorage.setItem('dh_sal_seen', '1'); } catch (e) {}
    if (!salPushed) { try { history.pushState({ sal: 1 }, ''); salPushed = true; } catch (e) {} }
    greet(); setFace('idle'); checkTeach();
    if (!(window.matchMedia && matchMedia('(pointer:coarse)').matches)) setTimeout(function () { input.focus(); }, 60);   // phones/tablets: the keyboard only opens when you tap the box
  }
  var salPushed = false;
  function closeCore() {
    panel.classList.remove('open'); root.classList.remove('open'); teachClose(); fab.setAttribute('aria-expanded', 'false'); fab.focus();
  }
  function close() {
    closeCore();
    if (salPushed) { salPushed = false; try { if (history.state && history.state.sal) history.back(); } catch (e) {} }
  }
  window.addEventListener('popstate', function () { if (salPushed && panel && panel.classList.contains('open')) { salPushed = false; closeCore(); } });
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
      '<header id="sal-hd"><img id="sal-face" alt="" src="' + ART + FACE.idle + '"><div class="tx"><h2 id="sal-title"></h2><p id="sal-sub"></p></div><button type="button" id="sal-teach" hidden>&#9998;</button><button type="button" id="sal-x">&times;</button></header>' +
      '<div id="sal-log" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<div id="sal-tv" role="region"></div>' +
      '<div id="sal-chips"></div>' +
      '<form id="sal-form" autocomplete="off"><button type="button" id="sal-cam">&#128247;</button><input type="file" id="sal-file" accept="image/*" capture="environment" hidden><input id="sal-q" type="text" maxlength="200" enterkeyhint="search" autocapitalize="off" spellcheck="false"><button type="submit" id="sal-send"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5 21 12 3 3.5v6.7l12 1.8-12 1.8z" fill="currentColor"/></svg></button></form>' +
      '</section>';
    document.body.appendChild(root);
    fab = root.querySelector('#sal-fab'); tip = root.querySelector('#sal-tip'); panel = root.querySelector('#sal-panel'); logEl = root.querySelector('#sal-log');
    form = root.querySelector('#sal-form'); input = root.querySelector('#sal-q'); sendBtn = root.querySelector('#sal-send'); camBtn = root.querySelector('#sal-cam'); camFile = root.querySelector('#sal-file'); faceEl = root.querySelector('#sal-face');
    chipsEl = root.querySelector('#sal-chips'); teachBtn = root.querySelector('#sal-teach'); tv = root.querySelector('#sal-tv'); subEl = root.querySelector('#sal-sub'); titleEl = root.querySelector('#sal-title'); xBtn = root.querySelector('#sal-x');
    texts();
    // messages page has its own send bar at the bottom right: sit above it
    if (/mensajes\.html/.test(location.pathname)) fab.style.bottom = 'max(84px,calc(env(safe-area-inset-bottom) + 84px))';
    fab.addEventListener('click', toggle);
    teachBtn.addEventListener('click', function () { root.classList.contains('teach') ? teachClose() : teachOpen(); });
    tv.addEventListener('click', teachClick);
    xBtn.addEventListener('click', close);
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    camBtn.addEventListener('click', function () { camFile.click(); });
    camFile.addEventListener('change', function () { var f = camFile.files && camFile.files[0]; camFile.value = ''; scanTag(f); });
    chipsEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; var q = b.getAttribute('data-q') || b.textContent;
      if (q === '@product') { input.setAttribute('placeholder', t('Type the product name or SKU…', 'Escribe el nombre del producto o el SKU…')); input.focus(); return; }
      ask(q);
    });
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
  // Leaving the page from a SAL answer (e.g. opening a policy page) and coming back: SAL reopens and repeats the last question
  function saveState() {
    try { if (mounted && panel && panel.classList.contains('open') && lastQ) sessionStorage.setItem('dh_sal_state', JSON.stringify({ t: Date.now(), q: lastQ, p: location.pathname })); } catch (e) {}
  }
  window.addEventListener('pagehide', saveState);
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveState(); });
  window.__sal = true;
  DH.sal = { open: function () { mount(); open(); }, close: close, ask: function (q) { mount(); open(); return ask(q); } };
  mount();
  try {
    var st = JSON.parse(sessionStorage.getItem('dh_sal_state') || 'null'), nav = (performance.getEntriesByType('navigation')[0] || {}).type;
    if (st && st.p === location.pathname && nav === 'back_forward' && Date.now() - st.t < 30 * 60 * 1000 && mounted) {
      sessionStorage.removeItem('dh_sal_state'); greeted = true; open(); ask(st.q);
    }
  } catch (e) {}
})();
