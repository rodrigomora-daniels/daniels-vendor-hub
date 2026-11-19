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
