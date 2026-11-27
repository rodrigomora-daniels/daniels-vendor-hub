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

  var css = document.createElement('style');
  css.textContent = '.dh-rec{background:#C0392B!important;color:#fff!important;border-color:#C0392B!important;animation:dhrec 1.3s ease-in-out infinite}' +
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
    btn.__dhv = true; btn.hidden = false; label(btn, false);
    var rec = null, base = '', fin = '', want = false;

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
      rec.lang = es() ? 'es-US' : 'en-US';
      rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
      var v = field.value; base = v && !/\s$/.test(v) ? v + ' ' : v; fin = ''; want = true;
      rec.onstart = function () { ui(true); cur = stop; };
      rec.onresult = function (ev) {
        var interim = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var r = ev.results[i], s = r[0].transcript;
          if (r.isFinal) fin += s.replace(/^\s+/, fin ? ' ' : ''); else interim += s;
        }
        put(fin + (interim ? (fin ? ' ' : '') + interim.replace(/^\s+/, '') : ''));
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
        if (want) { base = field.value && !/\s$/.test(field.value) ? field.value + ' ' : field.value; fin = ''; try { rec.start(); return; } catch (e) {} }
        ui(false); if (cur === stop) cur = null; field.focus && field.focus();
      };
      try { rec.start(); } catch (e) { ui(false); toast(T('Voice did not start. Try again.', 'La voz no inició. Intenta otra vez.')); }
    }

    btn.addEventListener('click', function (e) { e.preventDefault(); if (btn.classList.contains('dh-rec')) stop(); else start(); });
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
