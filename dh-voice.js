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
  function startLang() { var v = ''; try { v = localStorage.getItem('dh_voice_lang') || ''; } catch (e) {} if (v === 'es-US' || v === 'en-US') return v; var nl = ''; try { nl = ((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase(); } catch (e) {} return (es() || nl.indexOf('es') === 0) ? 'es-US' : 'en-US'; }
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
    /* Some engines never report confidence (0): decide by the words only. */
    if (conf === 0 && nw >= 3 && theirs > mine) return other(lang);
    if (conf === 0 && nw >= 4 && mine === 0 && theirs === 0 && lang === 'en-US' && /[ñáéíóúü¿¡]/.test(text)) return other(lang);
    return '';
  }

  /* Spoken numbers become digits: "one oh four dash six six six five five five" / "uno cero cuatro guion seis seis seis cinco cinco cinco"
     -> 104-666555 (SKUs, quantities, phone numbers). A run needs at least two number words or a dash word, so "one chair" stays as typed. */
  var DW = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };
  var DASH = { dash: 1, hyphen: 1, guion: 1, gion: 1, raya: 1, minus: 1, menos: 1 };
  var MULT = { double: 2, doble: 2, triple: 3 };
  function plain(w) { return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,;:!?]+$/, ''); }
  function spoken(text) {
    var tk = String(text || '').split(/(\s+)/), out = [], i = 0;
    function kind(w) { var x = plain(w); if (/^\d+$/.test(x)) return 'n'; if (x === 'oh' || DW.hasOwnProperty(x)) return 'w'; if (DASH[x]) return 'd'; if (MULT[x]) return 'm'; if (/^-$/.test(x)) return 'd'; return ''; }
    while (i < tk.length) {
      if (/^\s+$/.test(tk[i]) || !kind(tk[i])) { out.push(tk[i]); i++; continue; }
      var j = i, run = [], words = 0, dashes = 0;   // collect a run of number-ish tokens separated by single spaces
      while (j < tk.length) {
        var w = tk[j]; if (/^\s+$/.test(w)) { if (j + 1 < tk.length && kind(tk[j + 1])) { j++; continue; } break; }
        var k = kind(w); if (!k) break;
        if (k === 'm') { var nx = tk[j + 2]; if (nx && (kind(nx) === 'w' || kind(nx) === 'n')) { var nxp = plain(nx), dg = /^\d+$/.test(nxp) ? nxp : String(DW[nxp]); run.push({ t: 'n', v: new Array(MULT[plain(w)] + 1).join(dg) }); words++; j += 3; continue; } break; }
        if (k === 'w') { run.push({ t: 'n', v: String(DW[plain(w)]) }); words++; }
        else if (k === 'd') { run.push({ t: 'd', v: '-' }); dashes++; }
        else run.push({ t: 'n', v: plain(w) });
        j++;
      }
      var last = tk[j - 1], trail = /^\s+$/.test(last) ? '' : (String(last).match(/[.,;:!?]+$/) || [''])[0];
      while (run.length && run[0].t === 'd') run.shift();
      while (run.length && run[run.length - 1].t === 'd') run.pop();
      var nn = run.filter(function (r) { return r.t === 'n'; }).length;
      if (run.length && ((words >= 2 && nn >= 2) || (dashes >= 1 && nn >= 2 && words + dashes >= 1))) { out.push(run.map(function (r) { return r.v; }).join('') + trail); }
      else { for (var q = i; q < j; q++) out.push(tk[q]); }
      i = j;
    }
    return out.join('');
  }

  var css = document.createElement('style');
  css.textContent = 'button[data-lang]{position:relative}button[data-lang]::after{display:none}.dh-lang{margin-left:4px;min-width:36px;height:28px;padding:0 8px;border-radius:14px;border:1px solid #1B3A6B;background:#E8EEF8;color:#1B3A6B;font:700 12px/1 "Segoe UI",Arial,sans-serif;cursor:pointer;vertical-align:middle}' +
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
    btn.__dhv = true; btn.hidden = false; label(btn, false); 
    var pill = document.createElement('button'); pill.type = 'button'; pill.className = 'dh-lang'; btn.insertAdjacentElement('afterend', pill);
    function paint() { var e = lang === 'es-US'; pill.textContent = e ? 'ES' : 'EN'; var t = e ? 'Español — toca para cambiar a English' : 'English — tap to switch to Español'; pill.title = t; pill.setAttribute('aria-label', t); btn.setAttribute('data-lang', e ? 'ES' : 'EN'); }
    var rec = null, base = '', fin = '', want = false, lang = startLang(), lastSw = 0, swTo = '';
    paint();
    pill.addEventListener('click', function (e) { e.preventDefault(); lang = other(lang); saveLang(lang); paint(); toast(lang === 'es-US' ? 'Español 🎤' : 'English 🎤'); if (btn.classList.contains('dh-rec')) { try { rec.stop(); } catch (x) {} } });

    function put(txt) {
      var max = field.maxLength > 0 ? field.maxLength : 100000;
      field.value = (base + spoken(txt)).slice(0, max);
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
      rec.lang = lang; paint();
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
        if (want) { base = field.value && !/\s$/.test(field.value) ? field.value + ' ' : field.value; fin = ''; try { rec.lang = lang; paint(); rec.start(); return; } catch (e) {} }
        ui(false); if (cur === stop) cur = null; field.focus && field.focus();
      };
      try { rec.start(); } catch (e) { ui(false); toast(T('Voice did not start. Try again.', 'La voz no inició. Intenta otra vez.')); }
    }

    var lp = 0, lpFired = false;
    btn.addEventListener('pointerdown', function () { lpFired = false; clearTimeout(lp); lp = setTimeout(function () { lpFired = true; lang = other(lang); saveLang(lang); paint(); toast(lang === 'es-US' ? 'Español 🎤' : 'English 🎤'); if (btn.classList.contains('dh-rec')) { try { rec.stop(); } catch (e) {} } }, 650); });
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
  window.DHVoice = { supported: !!SR, attach: attach, spoken: spoken };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
