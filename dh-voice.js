/* Voice dictation for My Workspace (chat composer, Ask SAL).
   Uses the browser's built-in speech recognition (Web Speech API). Nothing is stored by the workspace; the audio goes to the
   browser's own speech service (Google in Chrome/Android, Apple in Safari), like the keyboard microphone does.
   Buttons opt in with data-voice="#selector" (the field to fill), or call DHVoice.attach(field, button). The button stays hidden
   when the browser has no speech recognition. Language follows the app language (EN / ES). */
(function () {
  'use strict';
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var es = function () { try { return localStorage.getItem('dh_lang') === 'es'; } catch (e) { return false; } };
  var T = function (a, b) { return es() ? b : a; };
  var cur = null;   // the session that is listening right now (only one at a time)

  /* The browser cannot guess the language before it hears it, so: start in the language used last time (or the app language),
     listen, and if a finished phrase clearly reads as the other language (or the engine is unsure and the words fit the other one),
     switch for the next phrase. Spanglish: the Spanish engine copes best, so ties keep the current language. */
  var ESW = ' que como cual cuales donde cuando para con una el la los las del es esta este tiene tienen hay pero muy quiero necesito puedo cuanto cuanta gracias hola buenos dias favor cliente entrega ya mas porque tambien ahora hoy mañana manana precio disponible tienda sillon sofa cama colchon ';
  var ENW = ' the is are do does can could you your i we have has for with this that what how where when need want will would customer delivery please thanks hello good morning today tomorrow price available store sofa couch bed mattress also because they them there ';
  function startLang() { var v = ''; try { v = localStorage.getItem('dh_voice_lang') || ''; } catch (e) {} return v === 'es-US' || v === 'en-US' ? v : (es() ? 'es-US' : 'en-US'); }
  function saveLang(l) { try { localStorage.setItem('dh_voice_lang', l); } catch (e) {} }
  function other(l) { return l === 'es-US' ? 'en-US' : 'es-US'; }
  function score(text) {
    var t = ' ' + String(text || '').toLowerCase().replace(/[¿?¡!.,;:()"]/g, ' ') + ' ', e = /[ñáéíóúü]/.test(t) ? 2 : 0, n = 0;
    t.trim().split(/\s+/).forEach(function (w) { if (ESW.indexOf(' ' + w + ' ') >= 0) e++; if (ENW.indexOf(' ' + w + ' ') >= 0) n++; });
    return { es: e, en: n };
  }
  /* returns the language to switch to, or '' to stay */
  function wantSwitch(text, conf, lang) {
    var sc = score(text), mine = lang === 'es-US' ? sc.es : sc.en, theirs = lang === 'es-US' ? sc.en : sc.es;
    if (theirs >= mine + 2) return other(lang);
    if (theirs > mine && conf > 0 && conf < 0.6) return other(lang);
    var nw = String(text).trim().split(/\s+/).length;
    if (mine === 0 && theirs === 0 && conf > 0 && conf < 0.4 && nw >= 2) return other(lang);
    /* The engine heard speech it does not understand: Spanish read by the English engine (or the reverse) comes back as odd words
       with low confidence and few real matches. Try the other engine for the next phrase. */
    if (conf > 0 && conf < 0.75 && nw >= 3 && mine <= 1 && theirs <= mine) return other(lang);
    if (conf > 0 && conf < 0.6 && nw >= 4 && theirs === 0) return other(lang);
    return '';
  }

  var css = document.createElement('style');
  css.textContent = 'button[data-lang]{position:relative}button[data-lang]::after{content:attr(data-lang);position:absolute;right:2px;bottom:1px;font:700 9px/1 "Segoe UI",Arial,sans-serif;color:#1B3A6B;background:#E8EEF8;border-radius:4px;padding:1px 3px}.dh-rec::after{background:#fff!important;color:#C0392B!important}' +
    '.dh-rec{background:#C0392B!important;color:#fff!important;border-color:#C0392B!important;animation:dhrec 1.3s ease-in-out infinite}' +
    '@keyframes dhrec{0%,100%{box-shadow:0 0 0 0 rgba(192,57,43,.55)}50%{box-shadow:0 0 0 8px rgba(192,57,43,0)}}' +
    '@media (prefers-reduced-motion:reduce){.dh-rec{animation:none}}' +
    '#dh-vtoast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);max-width:min(92vw,420px);background:#12284A;color:#fff;border-radius:10px;padding:10px 14px;font:600 14px/1.35 "Segoe UI",Arial,sans-serif;z-index:2147483000;box-shadow:0 8px 24px rgba(0,0,0,.3)}';
  document.head.appendChild(css);

  var tt = 0;
  function toast(msg) {
    var e = document.getElementById('dh-vtoast');
    if (!e) { e = document.createElement('div'); e.id = 'dh-vtoast'; e.setAttribute('role', 'status'); document.body.appendChild(e); }
    e.textContent = msg; e.style.display = 'block';
    clearTimeout(tt); tt = setTimeout(function () { e.style.display = 'none'; }, 5000);
  }

  function label(btn, on) {
    btn.setAttribute('aria-label', on ? T('Stop dictation', 'Detener dictado') : T('Dictate by voice', 'Dictar por voz'));
    btn.title = btn.getAttribute('aria-label');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function attach(field, btn) {
    if (!SR || !field || !btn || btn.__dhv) return;
    btn.__dhv = true; btn.hidden = false; label(btn, false); btn.setAttribute('data-lang', startLang() === 'es-US' ? 'ES' : 'EN');
    var rec = null, base = '', fin = '', want = false, lang = startLang(), lastSw = 0, swTo = '';

    function put(txt) {
      var max = field.maxLength > 0 ? field.maxLength : 100000;
      field.value = (base + txt).slice(0, max);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function stop() {
      want = false;
      if (rec) { try { rec.stop(); } catch (e) {} }
    }
    function ui(on) { btn.classList.toggle('dh-rec', on); label(btn, on); }

    function start() {
      if (cur && cur !== stop) cur();           // stop any other microphone first
      rec = new SR();
      rec.lang = lang; btn.setAttribute('data-lang', lang === 'es-US' ? 'ES' : 'EN');
      rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
      var v = field.value; base = v && !/\s$/.test(v) ? v + ' ' : v; fin = ''; want = true;
      rec.onstart = function () { ui(true); cur = stop; };
      rec.onresult = function (ev) {
        var interim = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var r = ev.results[i], s = r[0].transcript;
          if (r.isFinal) {
            fin += s.replace(/^\s+/, fin ? ' ' : '');
            var to = Date.now() - lastSw > 3000 ? wantSwitch(s, r[0].confidence || 0, lang) : '';
            if (to) { swTo = to; }
          } else interim += s;
        }
        put(fin + (interim ? (fin ? ' ' : '') + interim.replace(/^\s+/, '') : ''));
        if (swTo) { var go = swTo; swTo = ''; lang = go; lastSw = Date.now(); saveLang(go); toast(go === 'es-US' ? 'Español 🎤' : 'English 🎤'); try { rec.stop(); } catch (e) {} }
      };
      rec.onerror = function (ev) {
        var c = ev && ev.error;
        if (c === 'no-speech' || c === 'aborted') return;
        want = false;
        if (c === 'not-allowed' || c === 'service-not-allowed') toast(T('Microphone is blocked. Allow it in your browser settings, or use the microphone key on your keyboard.', 'El micrófono está bloqueado. Permítelo en la configuración del navegador, o usa la tecla de micrófono del teclado.'));
        else if (c === 'network') toast(T('No connection for voice. Try again, or use the microphone key on your keyboard.', 'Sin conexión para la voz. Intenta otra vez, o usa la tecla de micrófono del teclado.'));
        else toast(T('Voice did not work. Use the microphone key on your keyboard.', 'La voz no funcionó. Usa la tecla de micrófono del teclado.'));
      };
      rec.onend = function () {
        // Some browsers end the session after a pause: keep listening until the person taps stop.
        if (want) { base = field.value && !/\s$/.test(field.value) ? field.value + ' ' : field.value; fin = ''; try { rec.lang = lang; btn.setAttribute('data-lang', lang === 'es-US' ? 'ES' : 'EN'); rec.start(); return; } catch (e) {} }
        ui(false); if (cur === stop) cur = null; field.focus && field.focus();
      };
      try { rec.start(); } catch (e) { ui(false); toast(T('Voice did not start. Try again.', 'La voz no inició. Intenta otra vez.')); }
    }

    var lp = 0, lpFired = false;
    btn.addEventListener('pointerdown', function () { lpFired = false; clearTimeout(lp); lp = setTimeout(function () { lpFired = true; lang = other(lang); saveLang(lang); btn.setAttribute('data-lang', lang === 'es-US' ? 'ES' : 'EN'); toast(lang === 'es-US' ? 'Español 🎤' : 'English 🎤'); if (btn.classList.contains('dh-rec')) { try { rec.stop(); } catch (e) {} } }, 650); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, function () { clearTimeout(lp); }); });
    btn.addEventListener('click', function (e) { e.preventDefault(); if (lpFired) { lpFired = false; return; } if (btn.classList.contains('dh-rec')) stop(); else start(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && btn.classList.contains('dh-rec')) stop(); });
    var f = field.form; if (f) f.addEventListener('submit', function () { if (btn.classList.contains('dh-rec')) stop(); });
  }

  function auto() {
    document.querySelectorAll('button[data-voice]').forEach(function (b) {
      var f = document.querySelector(b.getAttribute('data-voice')); if (f) attach(f, b);
    });
  }
  window.DHVoice = { supported: !!SR, attach: attach };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
