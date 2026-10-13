/**
 * DADO STREAM — UI layer v4
 * Vanilla ports of Cinextma behaviours:
 *  - HeroUI Tabs sliding cursor (Sidebar)
 *  - Embla Carousel drag + ScrollShadow + prev/next (HomeList)
 *  - Detail Backdrop fade-on-scroll (useWindowScroll opacity)
 *  - Player header auto-hide on idle (useIdle) + Vaul source drawer
 *  - Section reveal + per-card stagger index
 * Presentation only; data loading stays in bioskop-app.js.
 */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Sidebar tab cursor ---------- */
  function syncCursor() {
    var menus = document.querySelectorAll('.sidebar .sidebar-menu');
    menus.forEach(function (menu) {
      var cur = menu.querySelector('.tab-cursor');
      if (!cur) { cur = document.createElement('span'); cur.className = 'tab-cursor'; menu.prepend(cur); }
      var act = menu.querySelector('.sidebar-item.active');
      if (!act) { cur.style.opacity = '0'; return; }
      cur.style.opacity = '1';
      cur.style.height = act.offsetHeight + 'px';
      cur.style.transform = 'translateY(' + act.offsetTop + 'px)';
    });
  }

  /* ---------- Carousel ---------- */
  function wireCarousel(scroller) {
    if (scroller.dataset.wired) return;
    scroller.dataset.wired = '1';
    var wrap = document.createElement('div');
    wrap.className = 'carousel';
    scroller.parentNode.insertBefore(wrap, scroller);
    wrap.appendChild(scroller);
    var prev = document.createElement('button');
    prev.className = 'carousel-btn prev';
    prev.setAttribute('aria-label', 'Geser kiri');
    prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
    var next = document.createElement('button');
    next.className = 'carousel-btn next';
    next.setAttribute('aria-label', 'Geser kanan');
    next.innerHTML = '<i class="fas fa-chevron-right"></i>';
    wrap.appendChild(prev);
    wrap.appendChild(next);

    function edges() {
      var max = scroller.scrollWidth - scroller.clientWidth - 2;
      wrap.dataset.l = scroller.scrollLeft > 2 ? '1' : '0';
      wrap.dataset.r = scroller.scrollLeft < max ? '1' : '0';
    }
    function page(dir) { scroller.scrollBy({ left: dir * scroller.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' }); }
    prev.addEventListener('click', function () { page(-1); });
    next.addEventListener('click', function () { page(1); });
    scroller.addEventListener('scroll', edges, { passive: true });
    new ResizeObserver(edges).observe(scroller);
    new MutationObserver(edges).observe(scroller, { childList: true });
    edges();

    // drag-free (mouse only; touch uses native scroll)
    var down = false, moved = false, sx = 0, sl = 0, vx = 0, lx = 0, lt = 0, raf = 0;
    scroller.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; sx = lx = e.clientX; sl = scroller.scrollLeft; lt = performance.now(); vx = 0;
      cancelAnimationFrame(raf);
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx;
      if (!moved && Math.abs(dx) > 5) { moved = true; scroller.classList.add('dragging'); }
      if (!moved) return;
      var now = performance.now();
      vx = (e.clientX - lx) / Math.max(1, now - lt); lx = e.clientX; lt = now;
      scroller.scrollLeft = sl - dx;
    });
    window.addEventListener('pointerup', function () {
      if (!down) return;
      down = false;
      if (!moved) return;
      // momentum, then release pointer-events on the next frame so the click is swallowed
      var v = -vx * 16;
      (function glide() {
        if (Math.abs(v) < 0.5 || reduce) { scroller.classList.remove('dragging'); return; }
        scroller.scrollLeft += v; v *= 0.94; raf = requestAnimationFrame(glide);
      })();
    });
  }

  /* ---------- Stagger index on freshly rendered cards ---------- */
  function indexCards(root) {
    var groups = root.querySelectorAll('.content-scroll, .content-grid');
    groups.forEach(function (g) {
      var fresh = g.querySelectorAll('.content-card:not([data-i])');
      fresh.forEach(function (c, i) { c.dataset.i = '1'; c.style.setProperty('--i', Math.min(i, 24)); });
    });
  }

  /* ---------- Section reveal ---------- */
  var io = ('IntersectionObserver' in window && !reduce)
    ? new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 })
    : null;
  function prepReveal() {
    if (!io) return;
    document.querySelectorAll('#page-home > .content-section').forEach(function (s, i) {
      if (i < 2 || s.classList.contains('reveal')) return;
      s.classList.add('reveal');
      io.observe(s);
    });
  }

  /* ---------- Scroll-linked: navbar + detail backdrop ---------- */
  function onScroll() {
    var y = window.scrollY;
    var page = document.body.dataset.page;
    var o = page === 'detail' ? Math.min((y / 1000) * 2, 1) : 1;
    document.documentElement.style.setProperty('--nav-o', o.toFixed(3));
    document.documentElement.style.setProperty('--bd-o', Math.min((y / 1000) * 2, 1).toFixed(3));
  }

  /* ---------- Player: idle header + source drawer ---------- */
  var idleT = 0;
  function poke() {
    var shell = document.getElementById('player-shell');
    if (!shell) return;
    shell.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(function () { shell.classList.add('idle'); }, 3000);
  }
  ['pointermove', 'touchstart', 'keydown'].forEach(function (ev) { document.addEventListener(ev, poke, { passive: true }); });

  window.openSourceDrawer = function () {
    var d = window._sourceDrawer;
    if (!d) return;
    closeSourceDrawer(true);
    var root = document.createElement('div');
    root.id = 'source-drawer';
    root.innerHTML =
      '<div class="drawer-backdrop" data-close></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-label="Pilih server">' +
      '<div class="drawer-head"><span>Pilih server</span><button class="nav-btn" data-close aria-label="Tutup"><i class="fas fa-times"></i></button></div>' +
      '<div class="drawer-body">' +
      '<div class="drawer-legend"><div><i class="fas fa-star"></i>Server 1 paling lancar. Klik pertama bisa membuka tab iklan, tutup saja lalu klik play lagi</div>' +
      '<div><i class="fas fa-info-circle"></i>Kalau tidak jalan, coba Server 2</div></div>' +
      '<div class="server-list">' + d.servers.map(function (s, i) {
        return '<button class="server-item' + (i === d.active ? ' is-active' : '') + '" style="--i:' + i + '" data-i="' + i + '">' +
          '<span class="si-name"><i class="fas fa-play-circle"></i>' + String(s.name).replace(/</g, '&lt;') + '</span>' +
          (i === d.active ? '<small>Diputar</small>' : '') + '</button>';
      }).join('') + '</div></div></aside>';
    document.body.appendChild(root);
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('drawer-open'); }); });
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeSourceDrawer(); return; }
      var b = e.target.closest('.server-item');
      if (b) {
        var i = +b.dataset.i;
        closeSourceDrawer();
        if (i !== d.active && window.playRebahanVideo) window.playRebahanVideo(d.postId, i);
      }
    });
    var first = root.querySelector('.server-item.is-active') || root.querySelector('.server-item');
    if (first) first.focus({ preventScroll: true });
  };
  function closeSourceDrawer(now) {
    var root = document.getElementById('source-drawer');
    if (!root) return;
    if (now) { root.remove(); return; }
    root.classList.remove('drawer-open');
    setTimeout(function () { root.remove(); }, 450);
  }
  window.closeSourceDrawer = closeSourceDrawer;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSourceDrawer(); });

  /* ---------- Search: Ctrl+K and value state ---------- */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      var inp = document.getElementById('search-input');
      if (inp && inp.offsetParent) { e.preventDefault(); inp.focus(); }
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'search-input') {
      var c = e.target.closest('.search-container');
      if (c) c.classList.toggle('has-value', !!e.target.value);
    }
  });

  /* ---------- Drive everything off DOM changes ---------- */
  var queued = false;
  function sync() {
    queued = false;
    document.querySelectorAll('.content-scroll').forEach(wireCarousel);
    indexCards(document);
    syncCursor();
    prepReveal();
    onScroll();
    if (document.body.dataset.page !== 'watch') closeSourceDrawer(true);
  }
  var mo = new MutationObserver(function () { if (!queued) { queued = true; requestAnimationFrame(sync); } });

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.body.dataset.page) document.body.dataset.page = 'home';
    sync();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', syncCursor);
    mo.observe(document.getElementById('app') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncCursor);
  });
})();
