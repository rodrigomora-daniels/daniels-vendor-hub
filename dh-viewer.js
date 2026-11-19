/* In-app file viewer. Everybody can VIEW library / promotion files; only people with the download permission see a
   Download button. View-only people get pictures, PDFs (drawn page by page, no browser toolbar), videos, or the
   readable text of Word/Excel files, with their name watermarked on top and every opening logged.
   (Honest limit: anything you can see on a screen can be photographed; this stops casual saving and makes sharing traceable.) */
(function () {
  'use strict';
  var lang = function () { try { return (localStorage.getItem('dh_lang') || 'en') === 'es' ? 'es' : 'en'; } catch (e) { return 'en'; } };
  var T = function (en, es) { return lang() === 'es' ? es : en; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var root = null, pdfLib = null;

  function css() {
    if (document.getElementById('dhv-css')) return;
    var s = document.createElement('style'); s.id = 'dhv-css';
    s.textContent = '#dhv{position:fixed;inset:0;z-index:100000;background:#0E1A2E;display:flex;flex-direction:column;font:15px/1.45 "Segoe UI",Arial,sans-serif;color:#fff}' +
      '#dhv .bar{flex:none;display:flex;align-items:center;gap:10px;padding:10px 14px;background:#12284A;border-bottom:2px solid #C8922A}' +
      '#dhv .bar b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:16px}' +
      '#dhv .bar button,#dhv .bar a{min-height:44px;min-width:44px;padding:0 16px;border-radius:10px;border:1px solid rgba(255,255,255,.4);background:transparent;color:#fff;font:700 14px Arial,sans-serif;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer}' +
      '#dhv .bar a.dl{background:#C8922A;border-color:#C8922A;color:#12284A}' +
      '#dhv .body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:12px;text-align:center;position:relative}' +
      '#dhv .body img.pg,#dhv .body canvas{max-width:100%;height:auto;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.45);margin:0 auto 12px;display:block}' +
      '#dhv .body video{max-width:100%;max-height:100%}' +
      '#dhv .txt{max-width:820px;margin:0 auto;text-align:left;background:#fff;color:#1F2937;border-radius:10px;padding:16px 18px}' +
      '#dhv .txt h4{margin:14px 0 6px;color:#12284A}#dhv .txt pre{white-space:pre-wrap;word-break:break-word;font:14px/1.5 "Segoe UI",Arial,sans-serif;margin:0}' +
      '#dhv .note{max-width:820px;margin:0 auto 10px;font-size:13px;color:#C9D6EA;text-align:left}' +
      '#dhv .wm{position:fixed;inset:0;pointer-events:none;z-index:2;opacity:.3;mix-blend-mode:multiply}' +
      '#dhv .shade{position:absolute;inset:0;z-index:5;background:#0E1A2E;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;font-weight:700}#dhv.hide .shade{display:flex}#dhv.hide .body{visibility:hidden}' +
      '#dhv.vo .body,#dhv.vo .body *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
      '@media print{body > *:not(#dhv){display:none!important}#dhv.vo{display:none!important}}';
    document.head.appendChild(s);
  }

  function watermark(text) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="20" y="110" transform="rotate(-24 180 100)" font-family="Arial" font-size="17" font-weight="700" fill="#5a6678">' + esc(text) + ' · ' + new Date().toISOString().slice(0, 10) + '</text></svg>';
    var d = document.createElement('div'); d.className = 'wm'; d.style.backgroundImage = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")'; return d;
  }

  async function loadPdfLib() {
    if (pdfLib) return pdfLib;
    var base = new URL('vendor/pdfjs/', document.baseURI).href;
    pdfLib = await import(base + 'pdf.min.mjs');
    pdfLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
    return pdfLib;
  }

  async function renderPdf(url, body, page) {
    var lib = await loadPdfLib();
    var doc = await lib.getDocument({ url: url, withCredentials: false }).promise;
    var width = Math.min(body.clientWidth - 24, 1000), dpr = Math.min(window.devicePixelRatio || 1, 2), target = null;
    for (var i = 1; i <= doc.numPages; i++) {
      var pg = await doc.getPage(i), v0 = pg.getViewport({ scale: 1 }), sc = width / v0.width, vp = pg.getViewport({ scale: sc * dpr });
      var c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height); c.style.width = Math.floor(vp.width / dpr) + 'px';
      body.appendChild(c); if (i === page) target = c;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      if (i === 1 || i === page) { if (target) target.scrollIntoView(); }
    }
    if (target) target.scrollIntoView();
  }

  function close() { if (root) { if (root.__off) root.__off(); var v = root.querySelector('video'); try { if (v) v.pause(); } catch (e) {} root.remove(); root = null; document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); } }
  function onKey(e) { if (e.key === 'Escape') close(); }

  // DH.view(archivoId, { title, page })
  window.DH = window.DH || {};
  DH.view = async function (archivoId, opts) {
    opts = opts || {}; css(); close();
    root = document.createElement('div'); root.id = 'dhv'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.innerHTML = '<div class="bar"><b>' + esc(opts.title || '') + '</b><span id="dhv-act"></span><button type="button" id="dhv-x" aria-label="Close">✕ ' + esc(T('Close', 'Cerrar')) + '</button></div><div class="body" id="dhv-b"><p>' + esc(T('Opening…', 'Abriendo…')) + '</p></div>';
    document.body.appendChild(root); document.body.style.overflow = 'hidden'; document.addEventListener('keydown', onKey);
    root.querySelector('#dhv-x').onclick = close;
    var body = root.querySelector('#dhv-b');
    try {
      var f = await DH.files.open(archivoId);
      if (!f || f.error) throw new Error((f && f.error) || 'none');
      var vo = !f.descargar;
      if (vo) {
        root.classList.add('vo');
        root.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        root.addEventListener('dragstart', function (e) { e.preventDefault(); });
        root.addEventListener('copy', function (e) { e.preventDefault(); });
        root.appendChild(watermark(f.quien || ''));
        // Deterrents (a web page cannot truly block screenshots): hide the content when the app loses focus or a
        // screenshot key is pressed, and say plainly that capturing is not allowed and is traceable.
        var shade = document.createElement('div'); shade.className = 'shade';
        shade.textContent = T('Content hidden. Capturing or sharing these files is not permitted.', 'Contenido oculto. No se permite capturar ni compartir estos archivos.'); root.appendChild(shade);
        var hideNow = function (ms) { root.classList.add('hide'); if (ms) setTimeout(function () { if (!document.hidden) root.classList.remove('hide'); }, ms); };
        var onVis = function () { if (document.hidden) hideNow(0); else root.classList.remove('hide'); };
        document.addEventListener('visibilitychange', onVis);
        var onKeyCap = function (e) {
          var k = (e.key || '').toLowerCase();
          if (k === 'printscreen' || ((e.metaKey || e.ctrlKey) && e.shiftKey && (k === 's' || k === '3' || k === '4' || k === '5'))) {
            hideNow(1800); try { navigator.clipboard.writeText(T('Capturing is not permitted.', 'No se permite capturar.')); } catch (x) {}
          }
        };
        window.addEventListener('keyup', onKeyCap, true); window.addEventListener('keydown', onKeyCap, true);
        root.__off = function () { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('keyup', onKeyCap, true); window.removeEventListener('keydown', onKeyCap, true); };
        var nb = document.createElement('div'); nb.className = 'note'; nb.style.cssText = 'text-align:center;margin:0 auto 10px'; nb.textContent = T('View only. Screenshots and sharing are not permitted; your name is printed on every page and each opening is logged.', 'Solo lectura. No se permiten capturas ni compartir; tu nombre aparece en cada página y cada apertura queda registrada.'); body.parentNode.insertBefore(nb, body);
      } else if (f.url_descarga) {
        root.querySelector('#dhv-act').innerHTML = '<a class="dl" href="' + esc(f.url_descarga) + '" rel="noopener">⬇ ' + esc(T('Download', 'Descargar')) + '</a>';
      }
      if (!opts.title) root.querySelector('.bar b').textContent = f.nombre || '';
      body.innerHTML = '';
      var m = f.mime || '';
      if (/^image\//.test(m) && f.url) {
        var im = new Image(); im.className = 'pg'; im.draggable = false; im.alt = ''; im.src = f.url; body.appendChild(im);
      } else if (/^video\//.test(m) && f.url) {
        var vd = document.createElement('video'); vd.controls = true; vd.playsInline = true; vd.src = f.url;
        if (vo) { vd.setAttribute('controlsList', 'nodownload noremoteplayback'); vd.disablePictureInPicture = true; }
        body.appendChild(vd);
      } else if (m === 'application/pdf' && f.url) {
        if (!vo) { /* people who can download get the same viewer; the Download button is above */ }
        await renderPdf(f.url, body, opts.page || 1);
      } else {
        // Word / Excel / other: readable text only (no file is handed over)
        var pages = f.texto || [];
        var h = '<div class="note">' + esc(vo ? T('View-only preview of the text in this file. Ask Marketing or Management if you need the original.', 'Vista previa del texto de este archivo. Pide el original a Marketing o a Gerencia si lo necesitas.') : T('Text preview. Use Download for the original file.', 'Vista previa del texto. Usa Descargar para el archivo original.')) + '</div><div class="txt">';
        if (!pages.length) h += '<p>' + esc(T('This file has no readable preview yet.', 'Este archivo todavía no tiene vista previa.')) + '</p>';
        pages.forEach(function (p) { h += (pages.length > 1 ? '<h4>' + esc(T('Page / Sheet ', 'Página / Hoja ')) + p.pagina + '</h4>' : '') + '<pre>' + esc(p.texto) + '</pre>'; });
        body.innerHTML = h + '</div>';
      }
    } catch (e) {
      body.innerHTML = '<p>' + esc(T('Could not open the file. It may have been removed, or you may not have access any more.', 'No se pudo abrir el archivo. Puede que lo hayan quitado o que ya no tengas acceso.')) + '</p>';
    }
  };
})();
