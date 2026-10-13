// ==========================================================================
// AyoNonton - Film Dewasa Application
// ==========================================================================

(function() {
    const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
    if (isProduction) {
        const noop = function() {};
        console.log = noop;
        console.debug = noop;
        console.info = noop;
        console.warn = noop;
    }
})();

// ==========================================================================
// POPUP / POPUNDER BLOCKER
// Blocks onclick-popunder ads injected by 3rd party scripts (decafeligiblyhad.com etc)
// while keeping Adsterra banner ads intact.
// ==========================================================================
// Register Service Worker to intercept popup navigations from ALL iframes
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(function(reg) {
            console.log('[SW] AyoNonton popup blocker registered, scope:', reg.scope);
        })
        .catch(function(err) {
            console.warn('[SW] Registration failed:', err.message);
        });
}

(function() {
    // Override window.open to block popunder/popup tabs (belt-and-suspenders)
    var _origOpen = window.open.bind(window);
    window.open = function(url, target, features) {
        // Allow null/undefined (programmatic opens that may be legitimate)
        if (!url) return _origOpen(url, target, features);
        var u = String(url).toLowerCase();
        // Blocklist: known popunder ad domains & patterns
        var blocked = [
            'decafeligiblyhad', 'sklnk', 'effectivegatecpm',
            'highperformanceformat', 'adsterra', 'popunder',
            'pop.', '/pop', 'trk.', 'clk.', 'click.',
            'track.', 'redirect.', 'redir.', 'go.php', 'click.php',
            'landing.', 'lnk.', 'aff.', 'adclick'
        ];
        for (var i = 0; i < blocked.length; i++) {
            if (u.indexOf(blocked[i]) !== -1) {
                console.warn('[POPUP BLOCKED]', url);
                return null;
            }
        }
        return _origOpen(url, target, features);
    };

    // Block onclick popunder injection on entire document
    // Popunders inject onclick on document/body to open new tab on any click
    var _origAddEvt = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, opts) {
        if (type === 'click' && (this === document || this === document.body)) {
            // Wrap listener: cancel if it tries to open a new tab/window
            var wrapped = function(e) {
                var _origWinOpen = window.open;
                var blocked = false;
                window.open = function(url) {
                    blocked = true;
                    console.warn('[POPUNDER BLOCKED via body click]', url);
                    return null;
                };
                try { listener.call(this, e); } catch(err) {}
                window.open = _origWinOpen;
            };
            return _origAddEvt.call(this, type, wrapped, opts);
        }
        return _origAddEvt.call(this, type, listener, opts);
    };
})();

// API Configuration
const REBAHAN_API = '/api';
const REBAHAN_SITE = 'https://timetostand.com';

// ==========================================================================
// Utility Functions
// ==========================================================================

function convertToEmbedUrl(url) {
    if (url.includes('kagefiles.com')) {
        const watchMatch = url.match(/kagefiles\.com\/([a-zA-Z0-9]+)\/watch/);
        if (watchMatch) return 'https://kagefiles.com/embed/' + watchMatch[1];
        const directMatch = url.match(/kagefiles\.com\/([a-zA-Z0-9]+)$/);
        if (directMatch) return 'https://kagefiles.com/embed/' + directMatch[1];
        if (url.includes('/embed/')) return url;
    }
    if (url.includes('imaxstreams.com')) {
        const match = url.match(/imaxstreams\.com\/download\/([a-zA-Z0-9]+)/);
        if (match) return 'https://imaxstreams.com/embed/' + match[1];
        if (url.includes('/embed/')) return url;
    }
    return url;
}

// Posters live on timetostand.com, which Indonesian ISPs block at the IP level: the
// request does not fail, it hangs, so cards keep an empty poster and the page looks
// like it never finishes loading. Route those through our own API, which runs on
// Vercel and is not blocked. Anything else is returned untouched.
function posterUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.indexOf('data:') === 0) return url;
    if (url.indexOf('timetostand.com') === -1) return url;
    return REBAHAN_API + '?action=img-proxy&url=' + encodeURIComponent(url);
}

// Default poster placeholder
const ADULT_POSTER_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450">' +
'<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">' +
'<stop offset="0%" style="stop-color:#1a1a2e"/><stop offset="50%" style="stop-color:#16213e"/>' +
'<stop offset="100%" style="stop-color:#0f0f23"/></linearGradient>' +
'<linearGradient id="badge" x1="0%" y1="0%" x2="100%" y2="0%">' +
'<stop offset="0%" style="stop-color:#ff4444"/><stop offset="100%" style="stop-color:#cc0000"/>' +
'</linearGradient></defs>' +
'<rect fill="url(#bg)" width="300" height="450"/>' +
'<circle cx="150" cy="180" r="50" fill="none" stroke="#ff4444" stroke-width="3" opacity="0.5"/>' +
'<polygon points="140,160 140,200 175,180" fill="#ff4444" opacity="0.8"/>' +
'<rect x="100" y="260" width="100" height="35" rx="5" fill="url(#badge)"/>' +
'<text x="150" y="284" fill="white" text-anchor="middle" font-size="18" font-weight="bold" font-family="Arial">18+</text>' +
'<text x="150" y="330" fill="#666" text-anchor="middle" font-size="14" font-family="Arial">Film Dewasa</text>' +
'</svg>');

// ==========================================================================
// State Management
// ==========================================================================

const state = {
    currentPage: 'home',
    currentContent: null,
    theme: localStorage.getItem('bioskop_theme') || 'dark',
    cache: {},
    history: JSON.parse(localStorage.getItem('bioskop_history') || '[]'),
    favorites: JSON.parse(localStorage.getItem('bioskop_favorites') || '[]'),
    bannerIndex: 0,
    bannerInterval: null,
    navigationStack: ['home']
};

// Category page state
const categoryState = {};
const CATEGORIES = {
    'trending': { api: 'trending', label: 'Trending' },
    'semi-indonesia': { api: 'semi-indonesia', label: 'Semi Indonesia' },
    'jav': { api: 'film-bokep-jepang', label: 'JAV / Jepang' },
    'semi-korea': { api: 'semi-korea', label: 'Semi Korea' },
    'filipina': { api: 'semi-filipina', label: 'Filipina' },
    'genre-indonesia': { api: 'semi-indonesia', label: 'Genre Indonesia' }
};

Object.keys(CATEGORIES).forEach(function(key) {
    categoryState[key] = { page: 1, hasMore: true, loaded: false };
});

let filipinaCategory = 'semi-filipina';

// ==========================================================================
// Initialization
// ==========================================================================

document.addEventListener('DOMContentLoaded', function() { initApp(); });

async function initApp() {
    initTheme();
    setupEventListeners();
    addAdultPlayerStyles();
    addCategoryTabStyles();
    handleUrlRouting();
    try { await loadHomeData(); } catch (e) { console.error('Error loading home:', e); }
    const app = document.getElementById('app');
    if (app) app.classList.remove('hidden');
}

// ==========================================================================
// Theme
// ==========================================================================

function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
}
function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('bioskop_theme', state.theme);
    updateThemeIcon();
}
function updateThemeIcon() {
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = state.theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

// ==========================================================================
// Event Listeners
// ==========================================================================

function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            const clearBtn = document.getElementById('search-clear');
            if (clearBtn) clearBtn.classList.toggle('hidden', !query);
            if (query.length >= 2) {
                searchTimeout = setTimeout(function() { performSearch(query); }, 500);
            } else { hideSearchResults(); }
        });
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const query = e.target.value.trim();
                if (query.length >= 2) performSearch(query, true);
            }
        });
    }
    const searchClear = document.getElementById('search-clear');
    if (searchClear) {
        searchClear.addEventListener('click', function() {
            const input = document.getElementById('search-input');
            if (input) input.value = '';
            searchClear.classList.add('hidden');
            hideSearchResults();
        });
    }
    const mobileSearchInput = document.getElementById('mobile-search-input');
    if (mobileSearchInput) {
        let mobileSearchTimeout;
        mobileSearchInput.addEventListener('input', function(e) {
            clearTimeout(mobileSearchTimeout);
            const query = e.target.value.trim();
            if (query.length >= 2) {
                mobileSearchTimeout = setTimeout(function() { performMobileSearch(query); }, 500);
            } else {
                const r = document.getElementById('mobile-search-results');
                if (r) r.innerHTML = '';
            }
        });
    }
    window.addEventListener('scroll', function() {
        const btn = document.getElementById('back-to-top');
        if (btn) btn.classList.toggle('hidden', window.scrollY < 300);
    });
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.nav-search')) hideSearchResults();
    });
}

// ==========================================================================
// API
// ==========================================================================

async function fetchAPI(action, params) {
    params = params || {};
    try {
        let url = REBAHAN_API + '?action=' + action;
        Object.entries(params).forEach(function(entry) {
            url += '&' + entry[0] + '=' + encodeURIComponent(entry[1]);
        });
        const controller = new AbortController();
        const timeoutId = setTimeout(function() { controller.abort(); }, 15000);
        const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) return null;
        const data = await response.json();
        return data.success ? data : null;
    } catch (e) {
        console.error('Fetch error:', e);
        return null;
    }
}

// ==========================================================================
// Home Page Loading
// ==========================================================================

async function loadHomeData() {
    try {
        await Promise.all([
            loadMultiFeatured().catch(function(e) { console.error('Featured error:', e); }),
            loadHomeSection('trending', 'home-trending').catch(function(e) { console.error('Trending error:', e); }),
            loadHomeSection('semi-indonesia', 'home-semi-indonesia').catch(function(e) { console.error('Semi Indo error:', e); }),
            loadHomeSection('film-bokep-jepang', 'home-jav').catch(function(e) { console.error('JAV error:', e); }),
            loadHomeSection('semi-korea', 'home-semi-korea').catch(function(e) { console.error('Korea error:', e); }),
            loadHomeSection('semi-filipina', 'home-filipina').catch(function(e) { console.error('Filipina error:', e); }),
            loadHomeSection('semi-indonesia', 'home-genre-indonesia').catch(function(e) { console.error('Genre Indo error:', e); }),
            loadBanners().catch(function(e) { console.error('Banners error:', e); })
        ]);
        loadContinueWatching();
    } catch (e) { console.error('Failed to load home:', e); }
}

async function loadHomeSection(apiCategory, containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var res = await Promise.all([1, 2].map(function(p) {
        return fetchAPI('rebahan-list', { category: apiCategory, page: p }).catch(function() { return null; });
    }));
    var seen = {}, items = [];
    res.forEach(function(d) { (d && d.items || []).forEach(function(it) { if (!seen[it.postId]) { seen[it.postId] = 1; items.push(it); } }); });
    if (items.length) {
        container.innerHTML = items.map(createRebahanCard).join('');
    } else {
        container.innerHTML = '<div class="empty-state"><p>Daftar ini belum bisa dimuat. Coba muat ulang halaman.</p></div>';
    }
}

// (Bokep Indo removed - API broken)

// ==========================================================================
// Banner
// ==========================================================================

async function loadBanners() {
    const data = await fetchAPI('rebahan-list', { category: 'trending', page: 1 });
    if (data && data.items && data.items.length > 0) {
        renderBanners(data.items.slice(0, 5));
        startBannerAutoplay();
    }
}

function renderBanners(items) {
    var slider = document.getElementById('hero-slider');
    var indicators = document.getElementById('hero-indicators');
    if (!slider || !indicators) return;
    slider.innerHTML = items.map(function(item, i) {
        var poster = item.poster || ADULT_POSTER_PLACEHOLDER;
        var call = "showRebahanDetail('" + item.postId + "', '" + encodeURIComponent(item.title || '') + "', '" + encodeURIComponent(item.poster || '') + "')";
        return '<div class="hero-slide' + (i === 0 ? ' is-current' : '') + '" onclick="' + call + '">' +
            '<div class="hero-bg" style="background-image:url(\'' + escHtml(posterUrl(poster)) + '\')"></div>' +
            '<div class="hero-content">' +
            '<div class="hero-chips"><span class="chip chip-faded chip-primary">' + escHtml(catLabel(item)) + '</span><span class="chip chip-faded chip-danger">18+</span></div>' +
            '<h1 class="hero-title">' + escHtml(item.title) + '</h1>' +
            '<div class="hero-meta"><span><i class="fas fa-fire"></i>Trending #' + (i + 1) + '</span>' +
            (item.year ? '<span class="dot">&#8226;</span><span><i class="fas fa-calendar"></i>' + escHtml(item.year) + '</span>' : '') +
            '<span class="dot">&#8226;</span><span><i class="fas fa-server"></i>5 server</span></div>' +
            '<div class="hero-buttons">' +
            '<button class="btn btn-primary btn-shadow btn-lg" onclick="event.stopPropagation(); playRebahanVideo(\'' + item.postId + '\', 0, \'' + encodeURIComponent(item.title || '') + '\', \'' + encodeURIComponent(item.poster || '') + '\')"><i class="fas fa-play-circle"></i> Putar</button>' +
            '<button class="btn btn-flat btn-lg" onclick="event.stopPropagation(); ' + call + '"><i class="fas fa-info-circle"></i> Detail</button>' +
            '</div></div>' +
            '<img class="hero-poster" src="' + escHtml(posterUrl(poster)) + '" alt="">' +
            '</div>';
    }).join('');
    indicators.innerHTML = items.map(function(_, i) {
        return '<button class="hero-indicator' + (i === 0 ? ' active' : '') + '" aria-label="Slide ' + (i + 1) + '" onclick="goToBanner(' + i + ')"></button>';
    }).join('');
}

function startBannerAutoplay() {
    if (state.bannerInterval) clearInterval(state.bannerInterval);
    state.bannerInterval = setInterval(function() { nextBanner(); }, 6000);
}
function nextBanner() {
    const indicators = document.querySelectorAll('.hero-indicator');
    if (indicators.length === 0) return;
    state.bannerIndex = (state.bannerIndex + 1) % indicators.length;
    updateBanner();
}
function prevBanner() {
    const indicators = document.querySelectorAll('.hero-indicator');
    if (indicators.length === 0) return;
    state.bannerIndex = (state.bannerIndex - 1 + indicators.length) % indicators.length;
    updateBanner();
}
function goToBanner(index) {
    state.bannerIndex = index;
    updateBanner();
    startBannerAutoplay();
}
function updateBanner() {
    var slides = document.querySelectorAll('#hero-slider .hero-slide');
    var indicators = document.querySelectorAll('.hero-indicator');
    slides.forEach(function(s, i) { s.classList.toggle('is-current', i === state.bannerIndex); });
    indicators.forEach(function(ind, i) {
        ind.classList.remove('active');
        if (i === state.bannerIndex) { void ind.offsetWidth; ind.classList.add('active'); }
    });
}

// ==========================================================================
// Featured Section
// ==========================================================================

async function loadMultiFeatured() {
    const container = document.getElementById('featured-film');
    if (!container) return;
    try {
        const rebahanData = await fetchAPI('rebahan-list', { category: 'semi-indonesia', page: 1 });
        if (rebahanData && rebahanData.items && rebahanData.items.length > 0) {
            var featured = rebahanData.items.slice(0, 4);
            var html = '<div class="multi-featured-grid">';
            featured.forEach(function(item, i) {
                var call = "showRebahanDetail('" + item.postId + "', '" + encodeURIComponent(item.title || '') + "', '" + encodeURIComponent(item.poster || '') + "')";
                html += '<div class="featured-card" style="--i:' + i + '" role="link" tabindex="0" onclick="' + call + '" onkeydown="if(event.key===\'Enter\'){this.click()}">' +
                    '<span class="featured-rank" aria-hidden="true">' + (i + 1) + '</span>' +
                    '<img src="' + escHtml(posterUrl(item.poster) || ADULT_POSTER_PLACEHOLDER) + '" alt="" class="featured-poster" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
                    '<div class="featured-info"><span class="featured-category">' + escHtml(catLabel(item)) + '</span>' +
                    '<h3 class="featured-title">' + escHtml(item.title) + '</h3></div></div>';
            });
            html += '</div>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">Gagal memuat data</p>';
        }
    } catch (e) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">Gagal memuat data</p>';
    }
}

// ==========================================================================
// Card Creation
// ==========================================================================


var PLAY_SVG = '<svg class="cc-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6l10 6l-10 6Z"/></svg>';
function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function posterCard(opts) {
    // MoviePosterCard (Cinextma). Grid pages restyle it as the "bordered" variant via CSS.
    var title = escHtml(opts.title || '');
    return '<div class="content-card" role="link" tabindex="0" onclick="' + opts.onclick + '" ' +
        'onkeydown="if(event.key===\'Enter\'){this.click()}" aria-label="' + title + '">' +
        '<div class="cc-media">' +
        '<img src="' + escHtml(posterUrl(opts.poster) || ADULT_POSTER_PLACEHOLDER) + '" alt="" class="card-poster" loading="lazy" decoding="async" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
        '<span class="chip chip-sm chip-danger cc-chip">18+</span>' +
        PLAY_SVG +
        '<div class="cc-shade"></div></div>' +
        '<div class="card-info"><h4 class="card-title">' + title + '</h4>' +
        '<div class="card-meta">' + (opts.left ? '<span>' + escHtml(opts.left) + '</span>' : '') + (opts.right ? '<span>' + escHtml(opts.right) + '</span>' : '') + '</div>' +
        '</div></div>';
}
function catLabel(item) {
    var c = (item.categories || []).join(' ');
    if (/jepang/.test(c)) return 'Jepang';
    if (/korea/.test(c)) return 'Korea';
    if (/filipina|vivamax/.test(c)) return 'Filipina';
    if (/indonesia/.test(c)) return 'Indonesia';
    return 'Semi';
}

function createRebahanCard(item) {
    var safePoster = encodeURIComponent(item.poster || '');
    var safeTitle = encodeURIComponent(item.title || '');
    return posterCard({
        title: item.title,
        poster: item.poster,
        onclick: "showRebahanDetail('" + item.postId + "', '" + safeTitle + "', '" + safePoster + "')",
        left: item.year || catLabel(item),
        right: ''
    });
}

function createAdultContentCard(item) {
    var isDefaultPoster = !item.poster || item.poster.includes('layarkaca21') || item.poster.includes('L-K-2-1');
    var cleanTitle = (item.title || 'Video').replace('Bokep Indo \u2013 ', '').replace('Bokep Indo - ', '');
    return posterCard({ title: cleanTitle, poster: isDefaultPoster ? '' : item.poster, onclick: "showAdultDetail('" + item.slug + "')" });
}

// ==========================================================================
// Navigation
// ==========================================================================

function stopVideoPlayback() {
    // Destroy iframe so audio/video stops immediately when leaving watch page
    var watchContainer = document.getElementById('watch-container');
    if (watchContainer) {
        // Find and blank-out all iframes to kill audio
        var iframes = watchContainer.querySelectorAll('iframe');
        iframes.forEach(function(iframe) {
            try { iframe.src = 'about:blank'; } catch(e) {}
            iframe.remove();
        });
        // Also stop any <video> elements
        var videos = watchContainer.querySelectorAll('video');
        videos.forEach(function(v) {
            try { v.pause(); v.src = ''; v.load(); } catch(e) {}
        });
    }
}

function navigateTo(page, addToStack) {
    if (addToStack === undefined) addToStack = true;

    // STOP VIDEO: destroy iframe when leaving watch page
    if (state.currentPage === 'watch' && page !== 'watch') {
        stopVideoPlayback();
    }

    if (addToStack && page !== state.currentPage) {
        state.navigationStack.push(page);
    }
    if (addToStack && window.updateUrlForPage) {
        window.updateUrlForPage(page);
    }
    document.querySelectorAll('.sidebar-item').forEach(function(item) {
        item.classList.toggle('active', item.dataset.page === page);
    });
    document.querySelectorAll('.mobile-nav-item').forEach(function(item) {
        item.classList.toggle('active', item.dataset.page === page);
    });
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    var targetPage = document.getElementById('page-' + page);
    if (targetPage) {
        targetPage.classList.add('active');
        state.currentPage = page;
        document.body.dataset.page = page;
        if (page !== 'detail') document.title = 'AyoNonton';
        loadPageData(page);
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
    closeMobileMenu();
}

function goBack() {
    // Stop video FIRST before navigating away (prevents ghost audio)
    if (state.currentPage === 'watch') {
        stopVideoPlayback();
    }
    if (window._showSocialBar) window._showSocialBar();
    if (state.navigationStack.length > 1) {
        state.navigationStack.pop();
        var previousPage = state.navigationStack[state.navigationStack.length - 1];
        navigateTo(previousPage, false);
    } else {
        navigateTo('home', false);
    }
}

async function loadPageData(page) {
    if (page === 'history') { loadHistory(); return; }
    if (page === 'favorites') { loadFavorites(); return; }
    if (page === 'home') return;
    if (page === 'filipina') { await loadCategoryPage('filipina', filipinaCategory); return; }
    var cat = CATEGORIES[page];
    if (cat) { await loadCategoryPage(page, cat.api); return; }
}

// ==========================================================================
// Category Page Loading
// ==========================================================================

async function loadCategoryPage(pageKey, apiCategory) {
    var grid = document.getElementById(pageKey + '-grid');
    if (!grid) return;
    if (categoryState[pageKey] && categoryState[pageKey].loaded) return;
    var token = {};
    categoryState[pageKey] = { page: 0, hasMore: true, loaded: false, loading: true, apiCategory: apiCategory, token: token };
    grid.innerHTML = '<div class="skeleton-container grid">' + new Array(18).join('<div class="skeleton-card"></div>') + '</div>';

    var pages = [];
    var initialPages = apiCategory === 'trending' ? 1 : 4;
    for (var p = 1; p <= initialPages; p++) pages.push(p);
    var results = await Promise.all(pages.map(function(p) {
        return fetchAPI('rebahan-list', { category: apiCategory, page: p }).catch(function() { return null; });
    }));
    var cs = categoryState[pageKey];
    if (!cs || cs.token !== token) return; // tab switched while loading

    var seen = {};
    var items = [];
    var lastOk = 0;
    var hasMore = false;
    results.forEach(function(data, idx) {
        if (!data || !data.items || !data.items.length) return;
        lastOk = idx + 1;
        hasMore = data.hasMore !== false;
        data.items.forEach(function(it) {
            if (seen[it.postId]) return;
            seen[it.postId] = 1;
            items.push(it);
        });
    });

    cs.loading = false;
    cs.loaded = true;
    cs.page = lastOk || 1;
    cs.hasMore = items.length > 0 && hasMore;
    cs.seen = seen;

    if (items.length) {
        grid.innerHTML = items.map(createRebahanCard).join('');
    } else {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-film"></i><p>Belum ada video di kategori ini.</p></div>';
    }
    setupInfiniteScroll(pageKey);
    updateCount(pageKey);
}

async function loadMoreCategory(pageKey) {
    var cs = categoryState[pageKey];
    if (!cs || !cs.hasMore || cs.loading) return;
    cs.loading = true;
    var token = cs.token;
    var btn = document.getElementById('load-more-' + pageKey);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...'; }
    var apiCat = cs.apiCategory || (CATEGORIES[pageKey] ? CATEGORIES[pageKey].api : pageKey);

    // two pages per round, so each scroll adds ~30
    var next = apiCat === 'trending' ? [cs.page + 1] : [cs.page + 1, cs.page + 2];
    var results = await Promise.all(next.map(function(p) {
        return fetchAPI('rebahan-list', { category: apiCat, page: p }).catch(function() { return null; });
    }));
    if (categoryState[pageKey] !== cs || cs.token !== token) return;

    var grid = document.getElementById(pageKey + '-grid');
    var html = '';
    var more = false;
    results.forEach(function(data) {
        if (!data || !data.items || !data.items.length) return;
        cs.page++;
        more = data.hasMore !== false;
        data.items.forEach(function(it) {
            if (cs.seen && cs.seen[it.postId]) return;
            if (cs.seen) cs.seen[it.postId] = 1;
            html += createRebahanCard(it);
        });
    });
    if (grid && html) grid.insertAdjacentHTML('beforeend', html);
    cs.hasMore = more;
    cs.loading = false;
    if (btn) { btn.disabled = false; btn.innerHTML = 'Muat lebih banyak'; }
    updateLoadMoreUI(pageKey);
    updateCount(pageKey);
}

function updateCount(pageKey) {
    var el = document.getElementById('count-' + pageKey);
    var g = document.getElementById(pageKey + '-grid');
    if (el && g) { var n = g.querySelectorAll('.content-card').length; el.textContent = n ? n + ' video' : ''; }
}

var _scrollObservers = {};
function updateLoadMoreUI(pageKey) {
    var cs = categoryState[pageKey];
    var btn = document.getElementById('load-more-' + pageKey);
    if (!btn) return;
    var wrap = btn.parentElement;
    if (cs && !cs.hasMore) {
        btn.style.display = 'none';
        if (wrap && !wrap.querySelector('.list-end')) wrap.insertAdjacentHTML('beforeend', '<p class="list-end">Sudah sampai ujung daftar.</p>');
    } else {
        btn.style.display = '';
        var end = wrap && wrap.querySelector('.list-end');
        if (end) end.remove();
    }
}

function setupInfiniteScroll(pageKey) {
    updateLoadMoreUI(pageKey);
    var btn = document.getElementById('load-more-' + pageKey);
    if (!btn || !('IntersectionObserver' in window)) return;
    var target = btn.parentElement || btn;
    if (_scrollObservers[pageKey]) _scrollObservers[pageKey].disconnect();
    var io = new IntersectionObserver(function(entries) {
        if (!entries[0].isIntersecting) return;
        var page = document.getElementById('page-' + pageKey);
        if (page && !page.classList.contains('active')) return;
        loadMoreCategory(pageKey);
    }, { rootMargin: '0px 0px 900px 0px' });
    io.observe(target);
    _scrollObservers[pageKey] = io;
}

function switchFilipina(cat, btnEl) {
    document.querySelectorAll('#filipina-tabs .rebahan-cat-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btnEl) btnEl.classList.add('active');
    filipinaCategory = cat;
    categoryState['filipina'] = { page: 0, hasMore: true, loaded: false, token: {} };
    loadCategoryPage('filipina', cat);
}

// ==========================================================================
// Bokep Indo Page
// ==========================================================================

// (Bokep Indo page functions removed)

// ==========================================================================
// Detail Pages - Rebahan
// ==========================================================================

async function showRebahanDetail(postId, encodedTitle, encodedPoster) {
    showPageTransition();
    var title = decodeURIComponent(encodedTitle);
    var poster = decodeURIComponent(encodedPoster);
    try {
        var data = await fetchAPI('rebahan-player', { post_id: postId });
        if (data && data.success && data.servers && data.servers.length > 0) {
            window.currentRebahanData = { postId: postId, title: title, poster: poster, servers: data.servers };
            renderRebahanDetail(title, poster, data.servers, postId);
            navigateTo('detail');
        } else {
            showToast('Gagal memuat server video', 'error');
        }
    } catch (e) {
        showToast('Gagal memuat konten', 'error');
    }
    hidePageTransition();
}

function renderRebahanDetail(title, poster, servers, postId) {
    var container = document.getElementById('detail-container');
    if (!container) return;
    var img = poster || ADULT_POSTER_PLACEHOLDER;
    var isFav = state.favorites.some(function(f) { return f.detailPath === 'rebahan:' + postId; });
    var favArgs = "'rebahan-" + postId + "', '" + String(title).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;') + "', '" + escHtml(poster || '') + "'";
    var n = (servers || []).length;
    document.title = title + ' | AyoNonton';
    container.innerHTML =
        '<div class="detail-backdrop"><div class="bd-img" style="background-image:url(\'' + escHtml(img) + '\')"></div></div>' +
        '<div class="detail-header">' +
        '<img src="' + escHtml(img) + '" alt="" class="detail-poster" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
        '<div class="detail-info">' +
        '<div class="dt-title-block">' +
        '<div class="hero-chips"><span class="chip chip-faded chip-primary">Film</span><span class="chip chip-faded chip-danger">18+</span></div>' +
        '<h1 class="detail-title">' + escHtml(title) + '</h1>' +
        '<div class="detail-meta"><span><i class="fas fa-server"></i>' + n + ' server</span><span class="dot">&#8226;</span><span><i class="fas fa-film"></i>Server Dado</span></div>' +
        '</div>' +
        '<div class="detail-actions"><div>' +
        '<button class="btn btn-primary btn-shadow" onclick="playRebahanVideo(\'' + postId + '\', 0)"><i class="fas fa-play-circle"></i> Putar sekarang</button>' +
        '</div><div>' +
        '<button class="btn btn-flat btn-icon' + (isFav ? ' is-on' : '') + '" id="fav-btn" aria-pressed="' + isFav + '" aria-label="Simpan ke favorit" onclick="toggleAdultFavorite(' + favArgs + '); this.classList.toggle(\'is-on\'); this.setAttribute(\'aria-pressed\', this.classList.contains(\'is-on\'))"><i class="fas fa-bookmark"></i></button>' +
        '</div></div>' +
        '<div class="dt-story"><div class="section-title"><h2>Pilih server</h2></div>' +
        '<div class="server-list">' + (servers || []).map(function(s, i) {
            return '<button class="server-item" style="--i:' + i + '" onclick="playRebahanVideo(\'' + postId + '\', ' + i + ')">' +
                '<span class="si-name"><i class="fas fa-play-circle"></i>' + escHtml(s.name) + '</span>' + (i === 0 ? '<small>Utama</small>' : '') + '</button>';
        }).join('') + '</div></div>' +
        '</div></div>' +
        '<div id="ad-rebahan-detail" class="ad-container"></div>';
    if (window._loadDetailAd) window._loadDetailAd('ad-rebahan-detail');
}

// Anti-popup interceptor for video embeds
// Injects fake window.open into iframe and auto-drains the popup queue
function setupIframeAntiPopup(iframeEl) {
    var maxAttempts = 30; // 3 seconds
    var attempt = 0;
    var done = false;

    function tryInject() {
        if (done) return;
        attempt++;
        try {
            var iwin = iframeEl.contentWindow;
            var idoc = iframeEl.contentDocument;
            if (!iwin || !idoc || !idoc.body) {
                if (attempt < maxAttempts) setTimeout(tryInject, 100);
                return;
            }

            // Inject fake window.open that returns a fake window object
            // Since iframe is same-origin (via proxy), this works!
            // fake window: open.closed = false initially (satisfies track check)
            // then closes after 60ms (triggers track.close++, not track.window++)
            if (!iwin._dadoOpenPatched) {
                iwin._dadoOpenPatched = true;
                iwin.open = function(url) {
                    var fakeWin = {
                        closed: false,
                        focus: function() {},
                        blur: function() {},
                        close: function() { fakeWin.closed = true; },
                        location: { href: url || 'about:blank', replace: function(){} }
                    };
                    setTimeout(function() { fakeWin.closed = true; }, 80);
                    return fakeWin;
                };
            }

            // Also patch document.onclick and body.onclick setters
            // to prevent ad scripts from injecting onclick on document
            try {
                Object.defineProperty(idoc, 'onclick', {
                    set: function(fn) { /* block */ },
                    get: function() { return null; },
                    configurable: true
                });
                if (idoc.body) {
                    Object.defineProperty(idoc.body, 'onclick', {
                        set: function(fn) { /* block */ },
                        get: function() { return null; },
                        configurable: true
                    });
                }
            } catch(ep) {}

            // Remove any fullscreen overlay divs already in the page
            var allDivs = idoc.querySelectorAll('div');
            for(var di = 0; di < allDivs.length; di++) {
                var ds = allDivs[di].style;
                if(ds && ds.position === 'fixed' && parseInt(ds.zIndex) > 999999) {
                    allDivs[di].onclick = null;
                    try { allDivs[di].remove(); } catch(e) {}
                }
            }

            done = true;

            // Auto-trigger the UL function twice to drain popup queue
            // This skips popups automatically without user needing to click
            function triggerUL() {
                try {
                    var ol = idoc.getElementById('overlay');
                    if (ol) {
                        // Trigger onclick directly
                        if (ol.onclick) {
                            ol.onclick();
                        } else if (typeof iwin.UL === 'function') {
                            iwin.UL();
                        } else {
                            // Dispatch click event
                            ol.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                        }
                    }
                } catch(e) {}
            }

            // First fake click immediately
            setTimeout(triggerUL, 200);
            // Second fake click after first popup would have "opened"  
            setTimeout(triggerUL, 500);
            // Third attempt to ensure video starts
            setTimeout(function() {
                try {
                    var iwin2 = iframeEl.contentWindow;
                    if (iwin2 && typeof iwin2.jwplayer === 'function') {
                        try { iwin2.jwplayer().play(); } catch(e) {}
                    }
                    // Remove any remaining overlay
                    var ol2 = iframeEl.contentDocument && iframeEl.contentDocument.getElementById('overlay');
                    if (ol2) { ol2.onclick = null; ol2.style.display = 'none'; try { ol2.remove(); } catch(e) {} }
                } catch(e) {}
            }, 800);

        } catch(e) {
            // Cross-origin restriction - iframe is from different domain
            // Cannot access contentWindow in this case (normal for external embeds)
            // console.warn('Anti-popup inject failed:', e.message);
        }
    }

    // Start trying after short delay to let iframe begin loading
    setTimeout(tryInject, 300);

    // Also try on load event
    iframeEl.addEventListener('load', function() {
        attempt = 0;
        done = false;
        setTimeout(tryInject, 200);
    });
}

async function playRebahanVideo(postId, serverIndex, encTitle, encPoster) {
    if (encTitle && (!window.currentRebahanData || window.currentRebahanData.postId !== postId)) {
        window._pendingMeta = { title: decodeURIComponent(encTitle), poster: decodeURIComponent(encPoster || '') };
    }
    if (window._hideSocialBar) window._hideSocialBar();
    showPageTransition();
    var rbData = window.currentRebahanData;
    if (!rbData || rbData.postId !== postId) {
        try {
            var data = await fetchAPI('rebahan-player', { post_id: postId });
            if (data && data.success && data.servers) {
                var pm = window._pendingMeta || {}; window._pendingMeta = null;
                rbData = { postId: postId, title: pm.title || 'Video', poster: pm.poster || '', servers: data.servers };
                window.currentRebahanData = rbData;
            } else { hidePageTransition(); showToast('Server tidak tersedia', 'error'); return; }
        } catch (e) { hidePageTransition(); showToast('Gagal memuat video', 'error'); return; }
    }
    if (!rbData.servers || !rbData.servers[serverIndex]) { hidePageTransition(); showToast('Server tidak tersedia', 'error'); return; }

    var server = rbData.servers[serverIndex];
    var title = rbData.title;
    addToHistory({ title: title, poster: rbData.poster, detailPath: 'rebahan:' + postId, postId: postId, type: 'rebahan', isAdult: true });

    var container = document.getElementById('watch-container');
    if (!container) { hidePageTransition(); return; }

    // Build server selector tabs if multiple servers
    var serverTabs = '';
    if (rbData.servers && rbData.servers.length > 1) {
        serverTabs = '<div class="server-tabs" style="display:flex;flex-wrap:wrap;gap:8px;padding:12px 0;">' +
            rbData.servers.map(function(srv, i) {
                return '<button onclick="playRebahanVideo(\'' + postId + '\',' + i + ')" ' +
                    'style="padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:.85rem;transition:.2s;' +
                    (i === serverIndex ? 'background:linear-gradient(135deg,#ff4444,#cc0000);color:#fff;font-weight:bold;' : 'background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);') +
                    '">' + srv.name + '</button>';
            }).join('') + '</div>';
    }

    container.innerHTML =
        '<div class="player-shell" id="player-shell">' +
        '<div class="player-head"><button class="ph-btn" onclick="goBack()" aria-label="Kembali"><i class="fas fa-arrow-left"></i></button>' +
        '<p class="ph-title">' + escHtml(title) + '</p>' +
        '<button class="ph-btn" onclick="openSourceDrawer()" aria-label="Pilih server"><i class="fas fa-server"></i><span>' + escHtml(server.name) + '</span></button></div>' +
        '<div class="video-player-container adult-player" id="adult-player-wrapper">' +
        '<div id="video-iframe-wrap" style="position:absolute;top:0;left:0;width:100%;height:100%;">' +
        (function(){
            var embedUrl = server.url;
            // Use proxy for known popup-injecting players (makes iframe same-origin,
            // allows contentWindow access to inject fake window.open)
            // Tested 2026-10: only hgcloud plays through the proxy. Abyss (Server 1) binds
            // its video to its own origin, so it must load directly.
            var useProxy = embedUrl && embedUrl.indexOf('hgcloud.to') !== -1;
            var iframeSrc = useProxy
                ? '/api?action=video-proxy&url=' + encodeURIComponent(embedUrl)
                : embedUrl;
            return '<iframe id="main-video-iframe" src="' + iframeSrc + '" ' +
                'allowfullscreen allow="autoplay; encrypted-media; picture-in-picture; fullscreen" ' +
                'referrerpolicy="no-referrer" loading="eager" ' +
                'style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe>';
        })() +
        '</div></div></div>' +
        '<div class="video-info"><h2 class="video-title">' + escHtml(title) + '</h2>' +
        '<div class="video-meta"><span class="chip chip-sm chip-danger">18+</span><span>' + escHtml(server.name) + ' dari ' + rbData.servers.length + ' server</span></div></div>' +
        '<div id="ad-rebahan-watch" class="ad-container"></div>';
    window._sourceDrawer = { postId: postId, active: serverIndex, servers: rbData.servers };
    if (window._loadWatchAd) window._loadWatchAd('ad-rebahan-watch');

    // Setup anti-popup interceptor - auto-drain popup queue without opening tabs
    var iframeEl = document.getElementById('main-video-iframe');
    if (iframeEl) {
        setupIframeAntiPopup(iframeEl);
    }
    navigateTo('watch');
    hidePageTransition();
}

// ==========================================================================
// Detail Pages - Bokep API (legacy stubs for old history/favorites)
// ==========================================================================

function showAdultDetail(slug) {
    showToast('Konten ini sudah tidak tersedia', 'error');
}

function renderAdultDetail(item) {}

function playAdultVideo(slug, serverIndex) {
    showToast('Konten ini sudah tidak tersedia', 'error');
}

function useEmbedFallback(wrapper, sourceUrl) {
    var embedUrl = convertToEmbedUrl(sourceUrl);
    var isImax = sourceUrl.includes('imaxstreams');
    var warningHtml = '';
    if (isImax) {
        warningHtml = '<div class="imax-warning-below" id="imax-ad-warning">' +
            '<i class="fas fa-info-circle"></i>' +
            '<span>Jika muncul iklan, tutup lalu klik play lagi</span>' +
            '<button onclick="this.parentElement.style.display=\'none\'"><i class="fas fa-times"></i></button></div>';
    }
    wrapper.innerHTML = '<iframe id="adult-video-iframe" src="' + embedUrl + '" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>' + warningHtml;
}

// ==========================================================================
// Search
// ==========================================================================

async function performSearch(query, showPage) {
    if (showPage) {
        navigateTo('search');
        var display = document.getElementById('search-query-display');
        if (display) display.textContent = 'Hasil untuk: "' + query + '"';
        var sgrid = document.getElementById('search-grid');
        if (sgrid) sgrid.innerHTML = '<div class="skeleton-container grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
    }

    var allResults = [];
    try {
        var rebahanData = await fetchAPI('rebahan-search', { q: query });
        if (rebahanData && rebahanData.items) {
            allResults = rebahanData.items.map(function(item) { item.isRebahan = true; item.type = 'rebahan'; return item; });
        }
    } catch (e) { console.error('Search error:', e); }

    if (showPage) {
        var grid = document.getElementById('search-grid');
        if (grid) {
            if (allResults.length > 0) {
                grid.innerHTML = allResults.map(function(item) {
                    return createRebahanCard(item);
                }).join('');
            } else {
                grid.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada judul yang cocok. Coba kata kunci yang lebih pendek.</p></div>';
            }
        }
    } else {
        showSearchResults(allResults);
    }
}

function showSearchResults(items) {
    var container = document.getElementById('search-results');
    if (!container) return;
    if (items.length === 0) {
        container.innerHTML = '<div class="search-no-results"><p>Tidak ada hasil ditemukan</p></div>';
    } else {
        container.innerHTML = items.slice(0, 8).map(function(item) {
            var safePoster = encodeURIComponent(item.poster || '');
            var safeTitle = encodeURIComponent(item.title || '');
            var onclick = "showRebahanDetail('" + item.postId + "', '" + safeTitle + "', '" + safePoster + "')";
            var title = escHtml(item.title);
            var poster = escHtml(posterUrl(item.poster) || ADULT_POSTER_PLACEHOLDER);
            return '<div class="search-result-item" onclick="' + onclick + '">' +
                '<img src="' + poster + '" alt="' + title + '" class="search-result-img" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
                '<div class="search-result-info"><h4>' + title + '</h4><p>18+ \u2022 Film Dewasa</p>' +
                '<span class="search-result-type" style="background:#ff4444;color:white;">18+</span></div></div>';
        }).join('');
    }
    container.classList.remove('hidden');
}

function hideSearchResults() {
    var container = document.getElementById('search-results');
    if (container) container.classList.add('hidden');
}

async function performMobileSearch(query) {
    var container = document.getElementById('mobile-search-results');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Mencari...</p></div>';

    var allResults = [];
    try {
        var rebahanData = await fetchAPI('rebahan-search', { q: query });
        if (rebahanData && rebahanData.items) {
            allResults = rebahanData.items.map(function(item) { item.isRebahan = true; item.type = 'rebahan'; return item; });
        }
    } catch (e) { console.error('Mobile search error:', e); }

    if (allResults.length > 0) {
        container.innerHTML = allResults.slice(0, 10).map(function(item) {
            var safePoster = encodeURIComponent(item.poster || '');
            var safeTitle = encodeURIComponent(item.title || '');
            var onclick = "closeMobileSearch(); showRebahanDetail('" + item.postId + "', '" + safeTitle + "', '" + safePoster + "')";
            var title = item.title;
            return '<div class="search-result-item" onclick="' + onclick + '">' +
                '<img src="' + (item.poster || ADULT_POSTER_PLACEHOLDER) + '" alt="' + title + '" class="search-result-img" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
                '<div class="search-result-info"><h4>' + title + '</h4><p>18+ \u2022 Film Dewasa</p>' +
                '<span class="search-result-type" style="background:#ff4444;color:white;">18+</span></div></div>';
        }).join('');
    } else {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada hasil</p></div>';
    }
}

function openMobileSearch() {
    var overlay = document.getElementById('mobile-search-overlay');
    if (overlay) { overlay.classList.remove('hidden'); var input = document.getElementById('mobile-search-input'); if (input) input.focus(); }
}
function closeMobileSearch() {
    var overlay = document.getElementById('mobile-search-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// ==========================================================================
// History & Favorites
// ==========================================================================

function addToHistory(item) {
    if (!item || !item.detailPath) return;
    var historyItem = { detailPath: item.detailPath, title: item.title || 'Unknown', poster: item.poster || '', timestamp: Date.now(), type: item.type, isAdult: true, slug: item.slug, postId: item.postId };
    state.history = state.history.filter(function(h) { return h.detailPath !== item.detailPath; });
    state.history.unshift(historyItem);
    state.history = state.history.slice(0, 50);
    try { localStorage.setItem('bioskop_history', JSON.stringify(state.history)); } catch (e) {}
}

function loadContinueWatching() {
    var section = document.getElementById('continue-watching-section');
    var container = document.getElementById('continue-watching');
    if (!section || !container) return;
    if (state.history.length > 0) {
        section.style.display = 'block';
        container.innerHTML = state.history.slice(0, 10).map(function(item) { return createHistoryCard(item); }).join('');
    } else { section.style.display = 'none'; }
}

function createHistoryCard(item) {
    var isAdult = item.type === 'adult' || (item.detailPath && item.detailPath.startsWith('adult:'));
    var postId = item.postId || (item.detailPath ? item.detailPath.replace('rebahan:', '') : '');
    var onclick = isAdult
        ? "showAdultDetail('" + (item.slug || (item.detailPath || '').replace('adult:', '')) + "')"
        : "showRebahanDetail('" + postId + "', '" + encodeURIComponent(item.title || '') + "', '" + encodeURIComponent(item.poster || '') + "')";
    return posterCard({ title: item.title, poster: item.poster, onclick: onclick, left: item.timestamp ? timeAgoId(item.timestamp) : '' });
}
function timeAgoId(ts) {
    var s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'Baru saja';
    var m = Math.floor(s / 60); if (m < 60) return m + ' menit lalu';
    var h = Math.floor(m / 60); if (h < 24) return h + ' jam lalu';
    var d = Math.floor(h / 24); if (d < 30) return d + ' hari lalu';
    return Math.floor(d / 30) + ' bulan lalu';
}

function toggleAdultFavorite(slug, title, poster) {
    var detailPath = slug.startsWith('rebahan-') ? 'rebahan:' + slug.replace('rebahan-', '') : 'adult:' + slug;
    var index = state.favorites.findIndex(function(f) { return f.detailPath === detailPath; });
    if (index > -1) {
        state.favorites.splice(index, 1);
        showToast('Dihapus dari favorit', 'info');
    } else {
        state.favorites.push({ detailPath: detailPath, title: title, poster: poster, slug: slug, isAdult: true, type: slug.startsWith('rebahan-') ? 'rebahan' : 'adult' });
        showToast('Ditambahkan ke favorit', 'success');
    }
    localStorage.setItem('bioskop_favorites', JSON.stringify(state.favorites));
}

function loadFavorites() {
    var grid = document.getElementById('favorites-grid');
    if (!grid) return;
    if (state.favorites.length > 0) {
        grid.innerHTML = state.favorites.map(function(item) { return createHistoryCard(item); }).join('');
    } else {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-heart"></i><p>Belum ada favorit. Tekan ikon simpan di halaman detail.</p></div>';
    }
}

function loadHistory() {
    var grid = document.getElementById('history-grid');
    if (!grid) return;
    try { var stored = localStorage.getItem('bioskop_history'); if (stored) state.history = JSON.parse(stored); } catch (e) { state.history = []; }
    if (state.history.length > 0) {
        grid.innerHTML = state.history.map(function(item) { return createHistoryCard(item); }).join('');
    } else {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>Belum ada riwayat. Video yang kamu putar akan muncul di sini.</p></div>';
    }
}

function clearHistory() {
    state.history = [];
    localStorage.removeItem('bioskop_history');
    loadHistory();
    loadContinueWatching();
    showToast('Riwayat dihapus', 'success');
}

// ==========================================================================
// UI Helpers
// ==========================================================================

function showPageTransition() {
    var t = document.getElementById('page-transition');
    if (t) t.classList.add('active');
}
function hidePageTransition() {
    var t = document.getElementById('page-transition');
    if (!t) return;
    t.classList.add('done');
    setTimeout(function() { t.classList.remove('active', 'done'); }, 500);
}

function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    var icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'exclamation-circle' : 'info-circle');
    toast.innerHTML = '<i class="fas fa-' + icon + '"></i><span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, 3000);
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

function toggleMobileMenu() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}
function closeMobileMenu() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

// ==========================================================================
// URL Routing
// ==========================================================================

function handleUrlRouting() {
    var path = window.location.pathname.toLowerCase().replace(/\/$/, '');
    var routeMap = {
        '/trending': 'trending',
        '/semi-indonesia': 'semi-indonesia',
        '/jav': 'jav',
        '/semi-korea': 'semi-korea',
        '/filipina': 'filipina',
        '/genre-indonesia': 'genre-indonesia',
        '/history': 'history',
        '/riwayat': 'history',
        '/favorites': 'favorites',
        '/favorit': 'favorites'
    };
    var targetPage = routeMap[path];
    if (targetPage) {
        setTimeout(function() { navigateTo(targetPage); }, 100);
    }
    window.updateUrlForPage = function(page) {
        var pageToUrl = {
            'home': '/',
            'trending': '/trending',
            'semi-indonesia': '/semi-indonesia',
            'jav': '/jav',
            'semi-korea': '/semi-korea',
            'filipina': '/filipina',
            'genre-indonesia': '/genre-indonesia',
            'history': '/riwayat',
            'favorites': '/favorit'
        };
        var newUrl = pageToUrl[page] || '/';
        if (window.history && window.history.pushState) {
            window.history.pushState({ page: page }, '', newUrl);
        }
    };
}

window.addEventListener('popstate', function(event) {
    if (event.state && event.state.page) navigateTo(event.state.page, false);
});

// ==========================================================================
// Dynamic Styles
// ==========================================================================

function addAdultPlayerStyles() {
    if (document.getElementById('adult-player-styles')) return;
    var styles = document.createElement('style');
    styles.id = 'adult-player-styles';
    styles.textContent = 
        '.adult-player video,.adult-player iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none}' +
        '.adult-meta{margin-top:10px}' +
        
        '.loading-video{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#fff}' +
        '.loading-video i{font-size:3rem;margin-bottom:15px;color:#ff4444}.loading-video p{margin:0;font-size:1rem}' +
        '.imax-warning-below{background:rgba(40,40,40,.95);color:#ccc;padding:8px 15px;border-radius:0 0 8px 8px;display:flex;align-items:center;gap:8px;font-size:.75rem}' +
        '.imax-warning-below i{color:#ff9800;font-size:.85rem}.imax-warning-below span{flex:1}' +
        '.imax-warning-below button{background:none;border:none;color:#888;cursor:pointer;padding:3px 8px;font-size:.75rem}' +
        '.imax-warning-below button:hover{color:#fff}' +
        '@media(max-width:768px){.imax-warning-below{font-size:.7rem;padding:6px 10px}}';
    document.head.appendChild(styles);
}

function addCategoryTabStyles() {}

// Legacy stubs for compatibility
function showDetail() {}
function showEmbeddedPlayer() {}
function switchServer() {}
function closeEmbeddedPlayer() {}
function isAdultVerified() { return true; }
function openAdultVerification() { navigateTo('home'); }
