/**
 * DADO STREAM BIOSKOP - Content Delivery Module v2.1
 * Performance optimization and engagement analytics
 * Build: 2026.02.05
 */

(function(w, d) {
    'use strict';
    
    // Production mode - disable console
    var _log = function() {};
    
    // Adsterra Configuration for dado-stream-bioskop
    var _c = {
        // Native Banner
        nativeBannerScript: 'https://pl28649333.effectivegatecpm.com/ae7a057c8bc9741797bcbc25cbca9e5c/invoke.js',
        nativeBannerContainerId: 'container-ae7a057c8bc9741797bcbc25cbca9e5c',
        
        // Banner keys
        bk_468x60: 'be802fb1767d034c07183e4843f0f86d',
        bk_300x250: '0f24f918d6c6a761113e77732ae40318',
        bk_160x300: '482212a202879cc5221cc00c0063e217',
        bk_160x600: 'b389b087b2bc7bc6f51dd7ff93586d3f',
        bk_320x50: '2c9ab05bf1cd04e22a49bbf1fce15e8f',
        bk_728x90: '7b50a6857930685d62bd2f2d317dc1c3',
        
        // Banner URLs
        url_468x60: 'https://www.highperformanceformat.com/be802fb1767d034c07183e4843f0f86d/invoke.js',
        url_300x250: 'https://www.highperformanceformat.com/0f24f918d6c6a761113e77732ae40318/invoke.js',
        url_160x300: 'https://www.highperformanceformat.com/482212a202879cc5221cc00c0063e217/invoke.js',
        url_160x600: 'https://www.highperformanceformat.com/b389b087b2bc7bc6f51dd7ff93586d3f/invoke.js',
        url_320x50: 'https://www.highperformanceformat.com/2c9ab05bf1cd04e22a49bbf1fce15e8f/invoke.js',
        url_728x90: 'https://www.highperformanceformat.com/7b50a6857930685d62bd2f2d317dc1c3/invoke.js',
        
        // State
        _loaded: false,
        _retry: 0
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
            } else {
                el[k] = attrs[k];
            }
        }
        return el;
    }
    
    // Load Native Banner
    function _loadNativeBanner(containerId) {
        var container = d.getElementById(containerId);
        if (!container || container.dataset.processed) return;
        container.dataset.processed = '1';
        
        // Create native banner container
        var nativeDiv = _ce('div', { id: _c.nativeBannerContainerId });
        container.appendChild(nativeDiv);
        
        // Load script
        var script = _ce('script', {
            async: true,
            src: _c.nativeBannerScript
        });
        script.setAttribute('data-cfasync', 'false');
        container.appendChild(script);
    }
    
    // Generic banner loader with iframe isolation
    function _loadBannerGeneric(containerId, key, width, height, scriptUrl) {
        var container = d.getElementById(containerId);
        if (!container || container.dataset.processed) return;
        container.dataset.processed = '1';
        
        // Create wrapper for centering
        var wrapper = _ce('div', {});
        wrapper.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:center;padding:10px 0;overflow:hidden;';
        container.appendChild(wrapper);
        
        // Create iframe for isolation
        var iframe = _ce('iframe', {
            frameBorder: '0',
            scrolling: 'no'
        });
        iframe.style.cssText = 'width:' + width + 'px;height:' + height + 'px;border:none;overflow:hidden;display:block;max-width:100%;';
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
    
    // Responsive banner loader - adapts to screen size
    function _loadResponsiveBanner(containerId, desktopKey, desktopW, desktopH, desktopUrl, mobileKey, mobileW, mobileH, mobileUrl) {
        var isMobile = w.innerWidth < 500;
        var key = isMobile ? mobileKey : desktopKey;
        var width = isMobile ? mobileW : desktopW;
        var height = isMobile ? mobileH : desktopH;
        var url = isMobile ? mobileUrl : desktopUrl;
        
        _loadBannerGeneric(containerId, key, width, height, url);
    }
    
    // Banner 468x60 (or 320x50 on mobile)
    function _loadBanner468(containerId) {
        _loadResponsiveBanner(
            containerId,
            _c.bk_468x60, 468, 60, _c.url_468x60,
            _c.bk_320x50, 320, 50, _c.url_320x50
        );
    }
    
    // Banner 300x250 (or 320x50 on mobile)
    function _loadBanner300(containerId) {
        _loadResponsiveBanner(
            containerId,
            _c.bk_300x250, 300, 250, _c.url_300x250,
            _c.bk_320x50, 320, 50, _c.url_320x50
        );
    }
    
    // Banner 728x90 (or 320x50 on mobile)
    function _loadBanner728(containerId) {
        _loadResponsiveBanner(
            containerId,
            _c.bk_728x90, 728, 90, _c.url_728x90,
            _c.bk_320x50, 320, 50, _c.url_320x50
        );
    }
    
    // Banner 160x600 (sidebar - hide on mobile)
    function _loadBanner160x600(containerId) {
        if (w.innerWidth < 768) return; // Hide on mobile/tablet
        _loadBannerGeneric(containerId, _c.bk_160x600, 160, 600, _c.url_160x600);
    }
    
    // Banner 160x300 (sidebar - hide on mobile)
    function _loadBanner160x300(containerId) {
        if (w.innerWidth < 768) return; // Hide on mobile/tablet
        _loadBannerGeneric(containerId, _c.bk_160x300, 160, 300, _c.url_160x300);
    }
    
    // Banner 320x50 (mobile only)
    function _loadBanner320(containerId) {
        _loadBannerGeneric(containerId, _c.bk_320x50, 320, 50, _c.url_320x50);
    }
    
    // Load all banners based on placement
    function _loadBanners() {
        // === HOME PAGE BANNERS ===
        // Native Banner - top of home after hero
        setTimeout(function() {
            _loadNativeBanner('ad-native-home');
        }, _rd(800, 1200));
        
        // Banner 1: After Viral & Trending section - 468x60
        setTimeout(function() {
            _loadBanner468('ad-home-1');
        }, _rd(1000, 1500));
        
        // Banner 2: Between sections - 300x250
        setTimeout(function() {
            _loadBanner300('ad-home-2');
        }, _rd(1500, 2000));
        
        // Banner 3: Before footer - 728x90
        setTimeout(function() {
            _loadBanner728('ad-home-3');
        }, _rd(2000, 2500));
        
        // === CATEGORY PAGE BANNERS ===
        // Film Indonesia page
        setTimeout(function() {
            _loadBanner468('ad-film-indonesia-top');
        }, _rd(1200, 1700));
        
        setTimeout(function() {
            _loadBanner320('ad-film-indonesia-bottom');
        }, _rd(2200, 2700));
        
        // Film Dewasa page
        setTimeout(function() {
            _loadBanner468('ad-adult-top');
        }, _rd(1300, 1800));
        
        setTimeout(function() {
            _loadBanner300('ad-adult-bottom');
        }, _rd(2300, 2800));
        
        // Western TV page
        setTimeout(function() {
            _loadBanner468('ad-western-top');
        }, _rd(1400, 1900));
        
        // Sub Indo page
        setTimeout(function() {
            _loadBanner468('ad-subindo-top');
        }, _rd(1500, 2000));
    }
    
    // Load banner for watch/detail page
    function _loadWatchBanner(containerId) {
        if (!containerId) return;
        // Reset processed state for SPA navigation
        var container = d.getElementById(containerId);
        if (container) {
            container.dataset.processed = '';
            container.innerHTML = '';
        }
        setTimeout(function() {
            _loadBanner468(containerId);
        }, _rd(300, 600));
    }
    
    // Load banner for detail page
    function _loadDetailBanner(containerId) {
        if (!containerId) return;
        var container = d.getElementById(containerId);
        if (container) {
            container.dataset.processed = '';
            container.innerHTML = '';
        }
        setTimeout(function() {
            _loadBanner300(containerId);
        }, _rd(400, 700));
    }
    
    // Expose for SPA navigation
    w._loadWatchAd = _loadWatchBanner;
    w._loadDetailAd = _loadDetailBanner;
    w._loadNativeBanner = _loadNativeBanner;
    w._loadBanner468 = _loadBanner468;
    w._loadBanner300 = _loadBanner300;
    w._loadBanner320 = _loadBanner320;
    w._loadBanner728 = _loadBanner728;
    
    // ========================================
    // SOCIAL BAR - Smart Loading
    // Tidak muncul saat menonton video
    // ========================================
    var _socialBarLoaded = false;
    var _socialBarScript = 'https://pl28656221.effectivegatecpm.com/2f/f0/f1/2ff0f18fa562e341abbcbb0f53081267.js';
    
    function _loadSocialBar() {
        if (_socialBarLoaded) return;
        _socialBarLoaded = true;
        
        var script = _ce('script', {
            async: true,
            src: _socialBarScript
        });
        script.setAttribute('data-cfasync', 'false');
        d.body.appendChild(script);
        _log('Social Bar loaded');
    }
    
    function _hideSocialBar() {
        // Social Bar biasanya punya class yang bisa diidentifikasi
        var socialBars = d.querySelectorAll('[class*="social"], [id*="social"], [class*="push"], [class*="notification-"]');
        socialBars.forEach(function(el) {
            if (el.style) el.style.display = 'none';
        });
        
        // Hide any fixed bottom elements from Adsterra
        var fixedElements = d.querySelectorAll('div[style*="position: fixed"][style*="bottom"]');
        fixedElements.forEach(function(el) {
            if (el.innerHTML && el.innerHTML.includes('effectivegatecpm')) {
                el.style.display = 'none';
            }
        });
    }
    
    function _showSocialBar() {
        var socialBars = d.querySelectorAll('[class*="social"], [id*="social"], [class*="push"], [class*="notification-"]');
        socialBars.forEach(function(el) {
            if (el.style) el.style.display = '';
        });
        
        var fixedElements = d.querySelectorAll('div[style*="position: fixed"][style*="bottom"]');
        fixedElements.forEach(function(el) {
            el.style.display = '';
        });
    }
    
    // Check if user is on watch/video page
    function _isWatchingVideo() {
        var hash = w.location.hash || '';
        var isWatchPage = hash.includes('/watch/') || hash.includes('/adult/');
        var hasVideoPlayer = d.querySelector('.video-player-container, .player-container, #video-player, video, iframe[src*="embed"]');
        return isWatchPage || !!hasVideoPlayer;
    }
    
    // Smart Social Bar control
    function _controlSocialBar() {
        if (_isWatchingVideo()) {
            _hideSocialBar();
        } else {
            if (!_socialBarLoaded) {
                _loadSocialBar();
            } else {
                _showSocialBar();
            }
        }
    }
    
    // Expose for external control
    w._hideSocialBar = _hideSocialBar;
    w._showSocialBar = _showSocialBar;
    w._controlSocialBar = _controlSocialBar;
    
    // Main initialization
    function _init() {
        if (_c._loaded) return;
        _c._loaded = true;
        
        // Load display banners
        _loadBanners();
        
        // Load Social Bar with delay (only if not watching video)
        setTimeout(function() {
            _controlSocialBar();
        }, 2000);
        
        // Monitor hash changes for video navigation
        w.addEventListener('hashchange', function() {
            setTimeout(_controlSocialBar, 500);
        });
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
    }
    
    // Public API
    w._sp = {
        init: _init,
        reload: function() {
            _c._loaded = false;
            _init();
        }
    };
    
    // Go!
    _start();
    
})(window, document);
