// DADO STREAM - Service Worker v1.0
// Intercepts popup/redirect navigations from video player iframes
// Redirects ad popup URLs to about:blank so they open+close silently

const POPUP_DOMAINS = [
  'decafeligiblyhad', 'rabirddom', 'sklnk', 'propellerads', 'propeller-ads',
  'highperformanceformat', 'effectivegatecpm', 'adcash', 'adsterra',
  'popcash', 'popads', 'adnetwork', 'clksite', 'trk.', 'clk.',
  'prahmnatured', 'jr.prahm', 'qpon/', 'ifnSRvJ', 'trafficjunky',
  'exoclick', 'juicyads', '18cash', 'plugrush', 'xvideos-cdn',
  'ero-advertising', 'trafmag', 'etargetnet', 'tsyndicate',
  'adskeeper', 'mgid', 'taboola', 'revcontent', 'contentad'
];

self.addEventListener('install', () => {
  console.log('[SW] Dado Stream popup blocker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[SW] Dado Stream popup blocker active');
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url.toLowerCase();
  
  // Check if this is a navigation to a popup/ad domain
  if (e.request.mode === 'navigate') {
    const isPopup = POPUP_DOMAINS.some(d => url.includes(d));
    if (isPopup) {
      console.log('[SW] Blocked popup navigation to:', e.request.url);
      // Return empty HTML page - window opens but shows blank, stays open (closed=false)
      // This satisfies the popup tracker (track.close, not track.window)
      e.respondWith(new Response(
        '<html><head><script>window.close();</script></head><body></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      ));
      return;
    }
  }
  
  // For video player iframe requests - pass through normally
  // (don't intercept, let them load as-is)
});