/* My Workspace — one standard top bar on every page: logo + title + "← Home / Inicio".
   Adds the logo and a Home button to each page's existing bar and removes older, differently named back buttons. */
(function () {
  var CONFIRM = /Certification/i.test(location.pathname);
  var css = '.dh-logo{display:inline-flex;align-items:center;flex:none;margin-right:14px}.dh-logo img{height:34px;width:auto;display:block}' +
    '.dh-home{flex:none;display:inline-flex;align-items:center;min-height:40px;margin-left:12px;padding:0 14px;color:#D6E4F7;border:1px solid rgba(214,228,247,.65);border-radius:8px;font:700 13px Arial,sans-serif;text-decoration:none;background:transparent;cursor:pointer;white-space:nowrap}' +
    '.dh-home:hover{background:rgba(255,255,255,.1)}.dh-home:focus-visible,.dh-logo:focus-visible{outline:2px solid #C8922A;outline-offset:2px}' +
    '@media print{.dh-logo,.dh-home{display:none!important}}';
  function leave(e) {
    if (CONFIRM && !window.confirm('Leave this page? Your progress on this test will be lost. / ¿Salir de esta página? Se perderá tu progreso en esta evaluación.')) e.preventDefault();
  }
  function mount() {
    var bar = document.querySelector('body > header, body > .top-bar, body > .site-header, .cockpit-header');
    if (!bar || bar.querySelector('.dh-home')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    // remove older back/home buttons (different labels on different pages)
    Array.prototype.slice.call(bar.querySelectorAll('a,button')).forEach(function (el) {
      var t = (el.getAttribute('href') || '') + ' ' + (el.getAttribute('onclick') || '');
      if (/index\.html/.test(t)) el.parentNode.removeChild(el);
    });
    // the page already says "Daniel's Home Center" in text: the logo replaces it
    Array.prototype.slice.call(bar.querySelectorAll('.logo-text, .sub')).forEach(function (el) {
      var x = (el.textContent || '').trim();
      if (x.length < 40 && /daniel'?s home center/i.test(x)) el.style.display = 'none';
    });
    var logo = document.createElement('a'); logo.className = 'dh-logo'; logo.href = 'index.html'; logo.setAttribute('aria-label', 'Home / Inicio');
    logo.innerHTML = '<img src="icons/daniels-logo.png" alt="Daniel\'s Home Center">';
    logo.addEventListener('click', leave);
    bar.insertBefore(logo, bar.firstChild);
    var nx = logo.nextElementSibling; if (nx) nx.style.marginRight = 'auto';
    var home = document.createElement('a'); home.className = 'dh-home'; home.href = 'index.html'; home.textContent = '← Home / Inicio';
    home.addEventListener('click', leave);
    bar.appendChild(home);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
