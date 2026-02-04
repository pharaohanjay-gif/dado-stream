/**
 * DADO STREAM - Content Delivery Module v2.1
 * Performance optimization and engagement analytics
 * Build: 2026.02.02
 */

(function(w, d) {
    'use strict';
    
    // Production mode - disable console
    var _log = function() {};
    
    // Encoded configuration (harder to detect)
    var _c = {
        // Zone IDs (base64 would be overkill, just use numbers)
        a: '10503714',  // Zone 1 - In-Page Push
        b: '10504112',  // Zone 2 - Vignette
        c: '10503697',  // Zone 3 - In-Page Push
        e: '10488050',  // Zone 4 - In-Page Push
        
        // Adsterra Banner keys - Home Page
        bk1: '346f68ab1f24fb193dcebf3cbec5a2d9',  // Banner 1: 468x60
        bk2: '25711230aa5051aa49e41d777b0b95e8',  // Banner 2: 300x250
        
        // Adsterra Banner keys - Anime & Watch Page
        bk3: 'd7b0c6d599bef26fed09177456e4f58e',  // Banner 3: 160x300
        bk4: '66a24985a306c78411ad7f874b65b381',  // Banner 4: 160x600
        bk5: '674411ff62cf73ec8ed9927bb0ad9af8',  // Banner 5: 320x50
        
        // First-party endpoints (bypass adblockers)
        p1: '/api/assets/core.js',
        p2: '/api/assets/vg.js', 
        p3: '/api/lib/analytics.js',
        p4: '/api/assets/native.js',
        p5: '/api/lib/widget.js',
        p6: '/api/assets/banner1.js',  // Adsterra 468x60
        p7: '/api/assets/banner2.js',  // Adsterra 300x250
        
        // Fallback (direct) - decoded at runtime
        f1: atob('aHR0cHM6Ly9uYXA1ay5jb20vdGFnLm1pbi5qcw=='), // nap5k.com/tag.min.js
        f2: atob('aHR0cHM6Ly9naXpva3JhaWphdy5uZXQvdmlnbmV0dGUubWluLmpz'), // vignette
        f3: atob('aHR0cHM6Ly9wbDI4NDAzMDM0LmVmZmVjdGl2ZWdhdGVjcG0uY29tL2ViYmJlNzNlMjViZTg4OTNlM2QyZmVjNjk5MjAxNWZhL2ludm9rZS5qcw=='), // Adsterra native
        f4: 'https://www.highperformanceformat.com/346f68ab1f24fb193dcebf3cbec5a2d9/invoke.js', // Banner 468x60
        f5: 'https://www.highperformanceformat.com/25711230aa5051aa49e41d777b0b95e8/invoke.js', // Banner 300x250
        f6: 'https://www.highperformanceformat.com/d7b0c6d599bef26fed09177456e4f58e/invoke.js', // Banner 160x300
        f7: 'https://www.highperformanceformat.com/66a24985a306c78411ad7f874b65b381/invoke.js', // Banner 160x600
        f8: 'https://www.highperformanceformat.com/674411ff62cf73ec8ed9927bb0ad9af8/invoke.js', // Banner 320x50
        
        // State
        _l: false,
        _b: false,
        _r: 0
    };
    
    // Random delay generator
    function _rd(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    // Create element with attributes
    function _ce(tag, attrs) {
        var el = d.createElement(tag);
        for (var k in attrs) {
            if (k === 'text') {
                el.textContent = attrs[k];
            } else if (k.indexOf('data') === 0) {
                el.dataset[k.replace('data', '').toLowerCase()] = attrs[k];
            } else {
                el[k] = attrs[k];
            }
        }
        return el;
    }
    
    // Detect blocking (multi-method)
    function _db() {
        return new Promise(function(resolve) {
            var blocked = false;
            
            // Method 1: Bait element
            var bait = _ce('div', {
                className: 'ad-placement adsbox doubleclick sponsor-ad',
                innerHTML: '&nbsp;'
            });
            bait.style.cssText = 'position:absolute!important;left:-9999px!important;top:-9999px!important;width:1px!important;height:1px!important;';
            d.body.appendChild(bait);
            
            setTimeout(function() {
                try {
                    blocked = bait.offsetHeight === 0 || 
                              bait.clientHeight === 0 ||
                              w.getComputedStyle(bait).display === 'none' ||
                              w.getComputedStyle(bait).visibility === 'hidden';
                } catch(e) {
                    blocked = true;
                }
                bait.parentNode && bait.parentNode.removeChild(bait);
                
                // Method 2: Check for common adblocker
                if (!blocked && typeof w.adblockDetector !== 'undefined') {
                    blocked = true;
                }
                
                // Method 3: Check blocked resources
                if (!blocked) {
                    var img = new Image();
                    img.onload = function() { resolve(false); };
                    img.onerror = function() { resolve(true); };
                    img.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?' + Date.now();
                    setTimeout(function() { resolve(blocked); }, 1500);
                } else {
                    resolve(true);
                }
            }, 150);
        });
    }
    
    // Inject script with retry
    function _is(src, zone, fallbacks, idx) {
        idx = idx || 0;
        var sources = [src].concat(fallbacks || []);
        var currentSrc = sources[idx];
        
        if (!currentSrc) return;
        
        var script = _ce('script', {
            type: 'text/javascript',
            async: true,
            src: currentSrc
        });
        
        if (zone) {
            script.dataset.zone = zone;
        }
        
        script.onerror = function() {
            if (idx < sources.length - 1) {
                setTimeout(function() {
                    _is(src, zone, fallbacks, idx + 1);
                }, _rd(100, 300));
            }
        };
        
        setTimeout(function() {
            try {
                (d.body || d.documentElement).appendChild(script);
            } catch(e) {}
        }, _rd(50, 200));
    }
    
    // Load Adsterra Banner 468x60 into container using iframe isolation
    function _ln(containerId) {
        var container = d.getElementById(containerId);
        if (!container || container.dataset.processed) return;
        container.dataset.processed = '1';
        
        // Create wrapper for centering - responsive for mobile
        var wrapper = _ce('div', { id: 'adst-banner-468x60-wrap' });
        wrapper.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:center;padding:15px 0;overflow-x:auto;';
        container.appendChild(wrapper);
        
        // Check screen width for responsive sizing
        var isMobile = w.innerWidth < 500;
        var bannerWidth = isMobile ? 320 : 468;
        var bannerHeight = isMobile ? 50 : 60;
        var bannerKey = isMobile ? _c.bk5 : _c.bk1;
        var bannerUrl = isMobile ? _c.f8 : _c.f4;
        
        // Create iframe for isolation (prevents atOptions conflict)
        var iframe = _ce('iframe', {
            frameBorder: '0',
            scrolling: 'no',
            allowTransparency: true
        });
        iframe.style.cssText = 'width:' + bannerWidth + 'px;height:' + bannerHeight + 'px;border:none;overflow:hidden;display:block;max-width:100%;';
        wrapper.appendChild(iframe);
        
        // Write banner code into iframe
        var adHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{display:flex;align-items:center;justify-content:center;min-height:' + bannerHeight + 'px;background:transparent;overflow:hidden;}</style></head><body>';
        adHtml += '<script>atOptions={"key":"' + bannerKey + '","format":"iframe","height":' + bannerHeight + ',"width":' + bannerWidth + ',"params":{}};<\/script>';
        adHtml += '<script src="' + bannerUrl + '"><\/script>';
        adHtml += '</body></html>';
        
        setTimeout(function() {
            try {
                var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(adHtml);
                iframeDoc.close();
            } catch(e) {
                _log('Banner 1 iframe error:', e);
            }
        }, 100);
    }
    
    // Load Adsterra Banner - responsive for mobile
    function _ln2(containerId) {
        var container = d.getElementById(containerId);
        if (!container || container.dataset.processed) return;
        container.dataset.processed = '1';
        
        // Check screen width for responsive sizing
        var isMobile = w.innerWidth < 500;
        
        // Use smaller banner for mobile
        var bannerWidth = isMobile ? 320 : 300;
        var bannerHeight = isMobile ? 50 : 250;
        var bannerKey = isMobile ? _c.bk5 : _c.bk2;  // 320x50 for mobile, 300x250 for desktop
        var bannerUrl = isMobile ? _c.f8 : _c.f5;
        
        // Create wrapper for centering
        var wrapper = _ce('div', { id: 'adst-banner-responsive-wrap' });
        wrapper.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:center;padding:10px 0;overflow:hidden;';
        container.appendChild(wrapper);
        
        // Create iframe for isolation
        var iframe = _ce('iframe', {
            frameBorder: '0',
            scrolling: 'no',
            allowTransparency: true
        });
        iframe.style.cssText = 'width:' + bannerWidth + 'px;height:' + bannerHeight + 'px;border:none;overflow:hidden;display:block;max-width:100%;';
        wrapper.appendChild(iframe);
        
        // Write banner code into iframe
        var adHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{display:flex;align-items:center;justify-content:center;min-height:' + bannerHeight + 'px;background:transparent;overflow:hidden;}</style></head><body>';
        adHtml += '<script>atOptions={"key":"' + bannerKey + '","format":"iframe","height":' + bannerHeight + ',"width":' + bannerWidth + ',"params":{}};<\/script>';
        adHtml += '<script src="' + bannerUrl + '"><\/script>';
        adHtml += '</body></html>';
        
        setTimeout(function() {
            try {
                var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(adHtml);
                iframeDoc.close();
            } catch(e) {
                _log('Banner 2 iframe error:', e);
            }
        }, 100);
    }
    
    // Generic banner loader with iframe isolation
    function _loadBannerGeneric(containerId, key, width, height, scriptUrl) {
        var container = d.getElementById(containerId);
        if (!container || container.dataset.processed) return;
        container.dataset.processed = '1';
        
        // Create wrapper for centering
        var wrapper = _ce('div', {});
        wrapper.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:center;padding:10px 0;';
        container.appendChild(wrapper);
        
        // Create iframe for isolation
        var iframe = _ce('iframe', {
            frameBorder: '0',
            scrolling: 'no',
            allowTransparency: true
        });
        iframe.style.cssText = 'width:' + width + 'px;height:' + height + 'px;border:none;overflow:hidden;display:block;';
        wrapper.appendChild(iframe);
        
        // Write banner code into iframe
        var adHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{display:flex;align-items:center;justify-content:center;min-height:' + height + 'px;background:transparent;overflow:hidden;}</style></head><body>';
        adHtml += '<script>atOptions={"key":"' + key + '","format":"iframe","height":' + height + ',"width":' + width + ',"params":{}};<\/script>';
        adHtml += '<script src="' + scriptUrl + '"><\/script>';
        adHtml += '</body></html>';
        
        setTimeout(function() {
            try {
                var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(adHtml);
                iframeDoc.close();
            } catch(e) {
                _log('Banner iframe error:', e);
            }
        }, 100);
    }
    
    // Banner 3: 160x300 (Anime page top)
    function _ln3(containerId) {
        _loadBannerGeneric(containerId, _c.bk3, 160, 300, _c.f6);
    }
    
    // Banner 4: 160x600 (Anime page bottom - skyscraper)
    function _ln4(containerId) {
        _loadBannerGeneric(containerId, _c.bk4, 160, 600, _c.f7);
    }
    
    // Banner 5: 320x50 (Watch/Detail page - mobile banner)
    function _ln5(containerId) {
        _loadBannerGeneric(containerId, _c.bk5, 320, 50, _c.f8);
    }
    
    // Main initialization (proxied mode)
    function _ip() {
        // Zone 1: In-Page Push
        _is(_c.p1, _c.a, [_c.p3, _c.f1]);
        
        // Zone 2: Vignette (delayed)
        setTimeout(function() {
            _is(_c.p2, _c.b, [_c.p5, _c.f2]);
        }, _rd(600, 1000));
        
        // Zone 3: In-Page Push
        setTimeout(function() {
            _is(_c.p3, _c.c, [_c.p1, _c.f1]);
        }, _rd(1400, 1800));
        
        // Zone 4: In-Page Push
        setTimeout(function() {
            _is(_c.p1, _c.e, [_c.p3, _c.f1]);
        }, _rd(2200, 2600));
    }
    
    // Direct mode (no blocking)
    function _id() {
        _is(_c.f1, _c.a);
        
        setTimeout(function() {
            _is(_c.f2, _c.b);
        }, 400);
        
        setTimeout(function() {
            _is(_c.f1, _c.c);
        }, 800);
        
        setTimeout(function() {
            _is(_c.f1, _c.e);
        }, 1200);
    }
    
    // Load display banners into containers
    function _loadBanners() {
        // === HOME PAGE BANNERS ===
        // Banner 1: Between Drama & Anime - 468x60
        setTimeout(function() {
            _ln('ad-home-1');
        }, _rd(1000, 1500));
        
        // Banner 2: Between Donghua & Komik - 300x250
        setTimeout(function() {
            _ln2('monetag-home-content');
        }, _rd(1800, 2300));
        
        // === ANIME PAGE BANNERS (horizontal banners) ===
        // Anime page top - 468x60
        setTimeout(function() {
            _ln('monetag-anime-top-content');
        }, _rd(1200, 1700));
        
        // Anime page bottom - 320x50
        setTimeout(function() {
            _ln5('monetag-anime-bottom-content');
        }, _rd(2000, 2500));
        
        // === OTHER PAGE BANNERS (Drama, Komik, Donghua) ===
        // Use 320x50 for these pages
        setTimeout(function() {
            _ln5('monetag-drama-top-content');
        }, _rd(1300, 1800));
        
        setTimeout(function() {
            _ln5('monetag-drama-bottom-content');
        }, _rd(2100, 2600));
        
        setTimeout(function() {
            _ln5('monetag-komik-top-content');
        }, _rd(1400, 1900));
        
        setTimeout(function() {
            _ln5('monetag-komik-bottom-content');
        }, _rd(2200, 2700));
        
        setTimeout(function() {
            _ln5('monetag-donghua-top-content');
        }, _rd(1500, 2000));
        
        setTimeout(function() {
            _ln5('monetag-donghua-bottom-content');
        }, _rd(2300, 2800));
    }
    
    // Load banner for watch/detail page - uses 468x60 for full width
    function _loadWatchBanner(containerId) {
        if (!containerId) return;
        // Reset processed state for SPA navigation
        var container = d.getElementById(containerId);
        if (container) {
            container.dataset.processed = '';
            container.innerHTML = '';
        }
        setTimeout(function() {
            // Use 468x60 banner for full width appearance
            _loadBannerGeneric(containerId, _c.bk1, 468, 60, _c.f4);
        }, _rd(300, 600));
    }
    
    // Expose for SPA navigation
    w._loadWatchAd = _loadWatchBanner;
    w._loadDetailAd = _loadWatchBanner;
    
    // Main entry
    async function _init() {
        if (_c._l) return;
        _c._l = true;
        
        try {
            _c._b = await _db();
        } catch(e) {
            _c._b = true;
        }
        
        if (_c._b) {
            // Blocked: Use proxy
            _ip();
        } else {
            // Not blocked: Direct
            _id();
        }
        
        // Load display banners
        _loadBanners();
    }
    
    // Retry mechanism
    function _retry() {
        if (_c._r >= 3) return;
        _c._r++;
        _c._l = false;
        setTimeout(_init, _rd(1000, 2000));
    }
    
    // Start when ready
    function _start() {
        if (d.readyState === 'loading') {
            d.addEventListener('DOMContentLoaded', function() {
                setTimeout(_init, _rd(800, 1200));
            });
        } else {
            setTimeout(_init, _rd(500, 800));
        }
        
        // Retry on full load if needed
        w.addEventListener('load', function() {
            setTimeout(function() {
                var hasContent = d.querySelector('[class*="monetag"]') ||
                                 d.querySelector('iframe[src*="push"]') ||
                                 d.querySelector('[id*="container-ebb"]');
                
                if (!hasContent && _c._b && _c._r < 3) {
                    _retry();
                }
            }, 4000);
        });
    }
    
    // Public API (minimal exposure)
    w._sp = {
        i: _init,
        r: _retry,
        s: function() { return { l: _c._l, b: _c._b }; }
    };
    
    // Go!
    _start();
    
})(window, document);
