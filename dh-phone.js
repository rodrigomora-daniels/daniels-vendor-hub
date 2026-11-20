/* Phones that open the site in "Desktop site" mode render a ~980px page shrunk onto a 6-inch screen (tiny text).
   Detect a real phone (small physical screen + touch) in that situation, rescale the page and apply the
   phone (narrow) layout rules. Tablets and computers are untouched. ?phone=1 forces it, ?phone=0 turns it off. */
(function () {
  'use strict';
  var VW = 400;   // layout width we want, in CSS px
  function flag() {
    try {
      var m = /[?&]phone=([01])/.exec(location.search);
      if (m) localStorage.setItem('dh_phone', m[1]);
      return localStorage.getItem('dh_phone');
    } catch (e) { return null; }
  }
  var f = flag();
  var small = Math.min(screen.width || 9999, screen.height || 9999) <= 600;
  var touch = (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
  var w = window.innerWidth || document.documentElement.clientWidth || 0;
  var forced = f === '1' || (f !== '0' && small && touch && w > 700);
  if (!forced || w <= VW + 40) return;
  var root = document.documentElement;
  root.classList.add('dh-phone');
  root.style.zoom = String(w / VW);
  root.style.setProperty('--dh-z', String(w / VW));   // viewport-height units must be divided by this on zoomed pages
  function rewrite() {
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      var rules; try { rules = ss.cssRules; } catch (e) { return; }
      Array.prototype.forEach.call(rules || [], function (r) {
        if (r.type !== 4) return;   // CSSMediaRule
        var t = r.media.mediaText;
        if (!/(min|max)-width/.test(t)) return;
        if (r.__dhOrig === undefined) r.__dhOrig = t;
        var ok = true;
        var re = /\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)/g, m, any = false;
        while ((m = re.exec(r.__dhOrig))) { any = true; var n = parseFloat(m[2]); if (m[1] === 'min' ? VW < n : VW > n) ok = false; }
        if (!any) return;
        if (/print|prefers-/.test(r.__dhOrig)) return;
        r.media.mediaText = ok ? 'all' : 'not all';
      });
    });
  }
  document.addEventListener('DOMContentLoaded', rewrite);
  window.addEventListener('load', function () { rewrite(); setTimeout(rewrite, 1500); setTimeout(rewrite, 4000); });
})();

/* Installed app (PWA window): there is no browser reload button, so add one at the top-left of every page.
   It asks the service worker to check for a new version first, then reloads. ?standalone=1 shows it in a normal tab (testing). */
(function () {
  'use strict';
  var forced = /[?&]standalone=1/.test(location.search);
  var app = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (!app && !forced) return;
  function reload() {
    var done = function () { location.reload(); };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (r) { return r && r.update(); }).then(done, done);
        setTimeout(done, 2500);   // never leave the button hanging
      } else done();
    } catch (e) { done(); }
  }
  function mount() {
    if (document.getElementById('dh-reload')) return;
    var st = document.createElement('style');
    st.textContent = '#dh-reload{flex:none;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;margin-right:10px;border-radius:8px;border:1px solid rgba(214,228,247,.65);background:transparent;color:#D6E4F7;font:700 20px/1 Arial,sans-serif;cursor:pointer;padding:0}' +
      '#dh-reload:hover{background:rgba(255,255,255,.12)}#dh-reload:focus-visible{outline:2px solid #C8922A;outline-offset:2px}#dh-reload.spin{animation:dhspin .8s linear infinite}@keyframes dhspin{to{transform:rotate(360deg)}}' +
      '#dh-reload.fl{position:absolute;top:8px;left:8px;z-index:20;width:34px;height:34px;margin:0;font-size:18px}@media print{#dh-reload{display:none!important}}';
    document.head.appendChild(st);
    var b = document.createElement('button');
    b.id = 'dh-reload'; b.type = 'button'; b.title = 'Reload / Recargar'; b.setAttribute('aria-label', 'Reload / Recargar'); b.textContent = '⟳';
    b.addEventListener('click', function () { b.classList.add('spin'); reload(); });
    var bar = document.querySelector('body > header, body > .top-bar, body > .site-header, .cockpit-header');
    var side = document.querySelector('.side');
    if (bar) bar.insertBefore(b, bar.firstChild);
    else if (side) { side.style.paddingTop = '58px'; b.className = 'fl'; side.insertBefore(b, side.firstChild); }
    else { b.className = 'fl'; b.style.position = 'fixed'; document.body.appendChild(b); }
  }
  window.addEventListener('load', function () { setTimeout(mount, 50); });
})();

/* Section switches always start at the top (window and the scrolling page containers). */
window.dhTop = function () {
  try {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
    var c = document.querySelectorAll('main, .mainc, .content, .wrap');
    for (var i = 0; i < c.length; i++) { if (c[i].scrollTop) c[i].scrollTop = 0; }
  } catch (e) {}
};
