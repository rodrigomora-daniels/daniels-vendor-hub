/* SAL reads promotion flyers (images) in the publisher's own browser and stores the text, so people can find
   products / SKUs inside a flyer. Free (tesseract.js, English + Spanish). The text is invisible: only SAL searches it. */
(function () {
  'use strict';
  var worker = null, loading = null;
  function loadLib() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = ok; s.onerror = function () { no(new Error('OCR library could not load')); }; document.head.appendChild(s);
    });
  }
  async function getWorker() {
    if (worker) return worker;
    if (!loading) loading = loadLib().then(function () { return window.Tesseract.createWorker(['eng', 'spa']); }).then(function (w) { worker = w; return w; });
    return loading;
  }
  async function readOne(archivoId) {
    var urls = await DH.files.sign([archivoId]), u = urls[archivoId] && urls[archivoId].url;
    if (!u) throw new Error('file unavailable');
    var blob = await (await fetch(u)).blob();
    var w = await getWorker();
    var r = await w.recognize(blob);
    var text = String((r && r.data && r.data.text) || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    return DH.rpc('sal_guardar_ocr', { p_archivo_id: archivoId, p_texto: text });
  }
  window.SalOcr = {
    one: function (archivoId) { return readOne(archivoId); },
    // Reads every active promotion flyer that has no text yet. progress(done, total, title)
    run: async function (progress) {
      var list = await DH.rpc('sal_ocr_pendientes', {}); list = list || [];
      var done = 0, failed = 0;
      for (var i = 0; i < list.length; i++) {
        if (progress) progress(i, list.length, list[i].titulo);
        try { await readOne(list[i].archivo_id); done++; } catch (e) { failed++; }
      }
      if (progress) progress(list.length, list.length, '');
      return { total: list.length, done: done, failed: failed };
    }
  };
})();
