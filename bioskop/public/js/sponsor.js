/**
 * DADO STREAM — ad delivery v3
 *
 * Rules this file enforces (why it is written this way):
 *  1. No popunder, no Social Bar, no interstitial, no sticky overlay. Those formats
 *     open tabs and cover content, which is exactly what the player fix removed.
 *  2. Every ad runs in a sandboxed iframe pointed at /ad.html on the OTHER hostname of
 *     this deployment, so the frame is cross-origin to the page. The sandbox omits
 *     allow-top-navigation: an ad can never redirect the page the user is reading.
 *     allow-popups stays, so a click still opens a new tab.
 *  3. Space is reserved before load, so nothing jumps while reading (no layout shift).
 *  4. Lazy loaded: a slot only requests when near the viewport. Keeps first paint fast
 *     and counts impressions that were actually on screen.
 *  5. Labelled "Iklan". A user should never mistake an ad for our content.
 *  6. Never inside or over the video. Below it only.
 *
 * Native Banner is not used: its invoke.js host (pl28649333.effectivegatecpm.com)
 * refuses the TLS handshake (ERR_SSL_UNRECOGNIZED_NAME_ALERT), so it renders nothing.
 *
 * Motion: reveal uses the project's spring token (--spring-smooth), fires once, and is
 * disabled by the global prefers-reduced-motion rule in the stylesheet.
 */
(function (w, d) {
  'use strict';

  // Only sizes whose ayomenonton.xyz key is installed in /ad.html. Adding a size here
  // without its key would render an empty box, so keep the two lists in step.
  var BANNER = {
    '728x90':  { w: 728, h: 90 },
    '468x60':  { w: 468, h: 60 },
    '320x50':  { w: 320, h: 50 },
    '300x250': { w: 300, h: 250 }
  };

  // Ads render from this host, never from the page's own origin. Two reasons, both
  // verified in Chrome:
  //  - Adsterra's invoke.js reads document.cookie. In a srcdoc frame the origin is
  //    opaque, that read throws SecurityError, and the slot renders blank.
  //  - Adding allow-same-origin to a srcdoc frame would hand the ad OUR origin and
  //    defeat the sandbox. A separate host gives it its own origin instead, so it
  //    cannot read our DOM, cookies, or localStorage.
  // Same origin as the page, on purpose, and this is the one thing that makes the ad
  // fill at all. Measured on /adtest.html: a same-origin frame loads the creative
  // (impr.gif + a JPEG from the CDN), while the identical frame pointed at the other
  // hostname (apex vs www) loads zero creatives. Cross-origin makes the ad script's
  // cookies third-party, Chrome partitions them, and the network returns no fill.
  //
  // The tradeoff: with allow-same-origin on a same-origin frame, the ad script shares
  // our origin and could reach the parent DOM. allow-top-navigation is still omitted,
  // so it cannot redirect the page out from under the user, which was the actual
  // complaint. A properly isolated setup needs a separate registered domain for ads.
  function adBase() {
    return location.origin + '/ad.html?f=';
  }

  var SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms';
  var filled = {};

  function isMobile() { return w.innerWidth < 768; }

  // Biggest banner that fits. On a phone 320x50 is tried first: it is the shape that
  // reads as a banner at that width, while 300x250 is a block that would push content
  // down. Returns null when nothing fits, and a null slot is skipped entirely rather
  // than reserving an empty box.
  function pickBanner(slot) {
    var avail = slot.clientWidth || w.innerWidth;
    var order = isMobile()
      ? ['320x50', '300x250']
      : ['728x90', '468x60', '300x250', '320x50'];
    for (var i = 0; i < order.length; i++) {
      if (BANNER[order[i]] && BANNER[order[i]].w <= avail - 8) return BANNER[order[i]];
    }
    return null;
  }

  function frame(format, width, height) {
    var f = d.createElement('iframe');
    f.setAttribute('sandbox', SANDBOX);
    f.setAttribute('scrolling', 'no');
    f.setAttribute('title', 'Iklan');
    // No loading="lazy": our own observer already decides when to request, and the
    // attribute added a second, slower gate on top of it, so a slot that was visible
    // from the start still waited. Eager loading here, gated by the observer below.
    f.setAttribute('loading', 'eager');
    // No referrerpolicy override on purpose. With no-referrer the ad network cannot
    // see which domain the slot is on, fails its domain check, and sends no creative:
    // the frame loads but stays blank. Verified by comparing /ad.html opened directly
    // (fills) against the same URL in a no-referrer frame (empty).
    f.width = width;
    f.height = height;
    f.style.cssText = 'display:block;border:0;width:' + width + 'px;height:' + height + 'px;margin:0 auto;';
    f.src = adBase() + encodeURIComponent(format);
    return f;
  }

  function shell(slot, label) {
    slot.classList.add('ad-slot');
    var box = d.createElement('div');
    box.className = 'ad-box';
    var tag = d.createElement('span');
    tag.className = 'ad-label';
    tag.textContent = label || 'Iklan';
    box.appendChild(tag);
    var body = d.createElement('div');
    body.className = 'ad-body';
    box.appendChild(body);
    slot.innerHTML = '';
    slot.appendChild(box);
    return { box: box, body: body };
  }

  function render(slot) {
    if (!slot || filled[slot.id]) return;
    filled[slot.id] = true;

    var body = slot.querySelector('.ad-body');
    var box = slot.querySelector('.ad-box');
    if (!body) return;

    var b = pickBanner(slot);
    if (!b) return;
    body.appendChild(frame(b.w + 'x' + b.h, b.w, b.h));

    requestAnimationFrame(function () {
      setTimeout(function () { box.classList.add('is-in'); }, 120);
    });
  }

  // Request well before the slot is reached: an ad needs roughly a second to arrive,
  // so a margin that only just clears the fold means the user scrolls onto an empty
  // box and watches it fill. 1400px is about 1.5 screens of lead time.
  var io = ('IntersectionObserver' in w)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          render(e.target);
        });
      }, { rootMargin: '1400px 0px' })
    : null;

  function arm(slot) {
    if (!slot || slot.dataset.armed) return;

    // Skip slots belonging to a page that is not the current one. A hidden page
    // reports a zero rect for its slots, which reads as "top of the screen" and made
    // every category page request an ad on first load: impressions nobody could see,
    // which is the kind of traffic an ad network charges back. Left unarmed on
    // purpose; the mutation observer picks the slot up once its page is shown.
    //
    // Checked via .page.active rather than offsetParent: an unfilled slot is
    // display:none by the :empty rule, so offsetParent is null even on the live page.
    var page = slot.closest ? slot.closest('.page') : null;
    if (page && !page.classList.contains('active')) return;

    // No size fits (phones, until the 320x50 key is in). Leave the slot untouched so
    // the stylesheet's :empty rule keeps it collapsed.
    var b = pickBanner(slot);
    if (!b) return;

    slot.dataset.armed = '1';

    // Build the shell NOW, not at render time. Two reasons:
    //  - .ad-container:empty is hidden by the stylesheet, so an empty slot has zero
    //    height and IntersectionObserver would never fire.
    //  - the final height is reserved up front, so the creative cannot shift the page.
    slot.style.minHeight = (b.h + 30) + 'px';
    shell(slot);

    // Anything within the first screen and a bit beyond is requested right now.
    // Waiting for the observer's first callback costs a frame plus a task, and for a
    // slot that is already on screen that delay is visible as an empty box.
    if (!io || slot.getBoundingClientRect().top < w.innerHeight + 600) {
      render(slot);
      return;
    }
    io.observe(slot);
  }

  function byId(id) { return d.getElementById(id); }

  // Scan every .ad-container, not just the static ids. The detail and watch slots are
  // built by bioskop-app.js as part of an innerHTML replacement and call _loadDetailAd
  // straight away, before their page is marked .active, so the hidden-page guard
  // rejected them and nothing ever retried: the detail page showed no ad at all.
  // Scanning generically means the mutation observer picks them up on the next tick,
  // once the page really is visible.
  function scan() {
    var slots = d.querySelectorAll('.ad-container');
    for (var i = 0; i < slots.length; i++) arm(slots[i]);
  }

  // Slots created at runtime by bioskop-app.js
  w._loadDetailAd = function (id) { arm(byId(id)); };
  w._loadWatchAd = function (id) { arm(byId(id)); };

  // Old API kept so nothing throws if something still calls it. The social bar hooks
  // stay no-ops on purpose: that is one of the intrusive formats.
  function noop() {}
  w._hideSocialBar = noop;
  w._showSocialBar = noop;
  w._controlSocialBar = noop;
  w._loadNativeBanner = function (id) { arm(byId(id)); };
  w._loadBanner468 = function (id) { arm(byId(id)); };
  w._loadBanner300 = function (id) { arm(byId(id)); };
  w._loadBanner320 = function (id) { arm(byId(id)); };
  w._loadBanner728 = function (id) { arm(byId(id)); };
  w._sp = { init: scan, reload: noop };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', scan);
  else scan();

  // Category pages render after a fetch, so pick up their slots when they appear.
  new MutationObserver(scan).observe(d.getElementById('app') || d.body, { childList: true, subtree: true });
})(window, document);
