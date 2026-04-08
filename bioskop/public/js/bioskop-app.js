// ==========================================================================
// DADO STREAM - Film Dewasa Application
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

// API Configuration
const REBAHAN_API = '/api';
const BOKEP_API = 'https://bokep-api.vercel.app/api';
const REBAHAN_SITE = 'https://guidedumanifestant.org';

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
    'film-semi': { api: 'film-semi', label: 'Film Semi' }
};

Object.keys(CATEGORIES).forEach(function(key) {
    categoryState[key] = { page: 1, hasMore: true, loaded: false };
});
categoryState['bokep-indo'] = { page: 1, hasMore: true, loaded: false };

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
            loadHomeSection('film-semi', 'home-film-semi').catch(function(e) { console.error('Film Semi error:', e); }),
            loadHomeBokepIndo().catch(function(e) { console.error('Bokep Indo error:', e); }),
            loadBanners().catch(function(e) { console.error('Banners error:', e); })
        ]);
        loadContinueWatching();
    } catch (e) { console.error('Failed to load home:', e); }
}

async function loadHomeSection(apiCategory, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const data = await fetchAPI('rebahan-list', { category: apiCategory, page: 1 });
    if (data && data.items && data.items.length > 0) {
        container.innerHTML = data.items.map(function(item) { return createRebahanCard(item); }).join('');
    } else {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Tidak ada konten tersedia</p>';
    }
}

async function loadHomeBokepIndo() {
    const container = document.getElementById('home-bokep-indo');
    if (!container) return;
    try {
        const response = await fetch(BOKEP_API + '/videos?limit=15');
        const data = await response.json();
        if (data.status && data.results && data.results.length > 0) {
            container.innerHTML = data.results.map(function(item) { return createAdultContentCard(item); }).join('');
        } else {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Tidak ada konten tersedia</p>';
        }
    } catch (e) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Gagal memuat konten</p>';
    }
}

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
    const slider = document.getElementById('hero-slider');
    const indicators = document.getElementById('hero-indicators');
    if (!slider || !indicators) return;

    slider.innerHTML = items.map(function(item) {
        var safeTitle = (item.title || '').replace(/'/g, "\\'");
        var safePoster = encodeURIComponent(item.poster || '');
        var safeEncodedTitle = encodeURIComponent(item.title || '');
        return '<div class="hero-slide" style="background-image: url(\'' + (item.poster || ADULT_POSTER_PLACEHOLDER) + '\')" ' +
            'onclick="showRebahanDetail(\'' + item.postId + '\', \'' + safeEncodedTitle + '\', \'' + safePoster + '\')">' +
            '<div class="hero-content">' +
            '<span class="hero-badge" style="background: linear-gradient(135deg, #ff4444, #cc0000);">18+</span>' +
            '<h1 class="hero-title">' + item.title + '</h1>' +
            '<div class="hero-meta">' +
            '<span><i class="fas fa-fire" style="color:#ff4444"></i> Trending</span>' +
            (item.year ? '<span><i class="fas fa-calendar"></i> ' + item.year + '</span>' : '') +
            '<span><i class="fas fa-server"></i> Server Dado</span>' +
            '</div>' +
            '<p class="hero-description">Film dewasa trending. Tonton sekarang di Dado Stream.</p>' +
            '<div class="hero-buttons">' +
            '<button class="hero-btn primary" style="background: linear-gradient(135deg, #ff4444, #cc0000);" ' +
            'onclick="event.stopPropagation(); showRebahanDetail(\'' + item.postId + '\', \'' + safeEncodedTitle + '\', \'' + safePoster + '\')">' +
            '<i class="fas fa-play"></i> Tonton Sekarang</button>' +
            '</div></div></div>';
    }).join('');

    indicators.innerHTML = items.map(function(_, index) {
        return '<div class="hero-indicator ' + (index === 0 ? 'active' : '') + '" onclick="goToBanner(' + index + ')"></div>';
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
    const slider = document.getElementById('hero-slider');
    const indicators = document.querySelectorAll('.hero-indicator');
    if (slider) slider.style.transform = 'translateX(-' + (state.bannerIndex * 100) + '%)';
    indicators.forEach(function(ind, i) { ind.classList.toggle('active', i === state.bannerIndex); });
}

// ==========================================================================
// Featured Section
// ==========================================================================

async function loadMultiFeatured() {
    const container = document.getElementById('featured-film');
    if (!container) return;
    try {
        const rebahanData = await fetchAPI('rebahan-list', { category: 'film-semi', page: 1 });
        if (rebahanData && rebahanData.items && rebahanData.items.length > 0) {
            var labels = ['\ud83d\udd25 Viral', '\ud83d\udcc8 Trending', '\u2b50 Populer', '\u2728 Terbaru'];
            var icons = ['fa-fire', 'fa-chart-line', 'fa-star', 'fa-sparkles'];
            var colors = ['#ff4444', '#ff6b35', '#ffd700', '#ff69b4'];
            var featured = rebahanData.items.slice(0, 4);
            var html = '<div class="multi-featured-grid">';
            featured.forEach(function(item, i) {
                var safePoster = encodeURIComponent(item.poster || '');
                var safeTitle = encodeURIComponent(item.title || '');
                var onclick = "showRebahanDetail('" + item.postId + "', '" + safeTitle + "', '" + safePoster + "')";
                html += '<div class="featured-card" onclick="' + onclick + '" style="border-left: 3px solid ' + colors[i] + ';">' +
                    '<img src="' + (item.poster || ADULT_POSTER_PLACEHOLDER) + '" alt="' + item.title + '" class="featured-poster" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
                    '<div class="featured-info">' +
                    '<div class="featured-category" style="color: ' + colors[i] + ';"><i class="fas ' + icons[i] + '"></i> ' + labels[i] + '</div>' +
                    '<h3 class="featured-title">' + item.title + '</h3>' +
                    '<div class="featured-meta"><span style="color: #ff4444;"><i class="fas fa-fire-alt"></i> 18+</span><span><i class="fas fa-server"></i> Server Dado</span></div>' +
                    '<button class="featured-btn" style="background: ' + colors[i] + ';" onclick="event.stopPropagation(); ' + onclick + '"><i class="fas fa-play"></i> Tonton</button>' +
                    '</div></div>';
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

function createRebahanCard(item) {
    var posterSrc = item.poster || ADULT_POSTER_PLACEHOLDER;
    var safePoster = encodeURIComponent(item.poster || '');
    var safeTitle = encodeURIComponent(item.title || '');
    return '<div class="content-card" onclick="showRebahanDetail(\'' + item.postId + '\', \'' + safeTitle + '\', \'' + safePoster + '\')">' +
        '<img src="' + posterSrc + '" alt="' + (item.title || '') + '" class="card-poster" loading="lazy" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
        '<div class="card-badge" style="background: linear-gradient(135deg, #ff4444, #cc0000);">18+</div>' +
        '<div class="card-overlay"><div class="card-play-btn"><i class="fas fa-play"></i></div></div>' +
        '<div class="card-info"><h4 class="card-title">' + (item.title || '') + '</h4>' +
        '<div class="card-meta"><span><i class="fas fa-play-circle" style="color:#ff4444"></i> Server Dado</span>' +
        (item.year ? '<span>' + item.year + '</span>' : '') +
        '</div></div></div>';
}

function createAdultContentCard(item) {
    var isDefaultPoster = !item.poster || item.poster.includes('layarkaca21') || item.poster.includes('L-K-2-1');
    var posterSrc = isDefaultPoster ? ADULT_POSTER_PLACEHOLDER : item.poster;
    var cleanTitle = (item.title || 'Video').replace('Bokep Indo \u2013 ', '').replace('Bokep Indo - ', '');
    return '<div class="content-card" onclick="showAdultDetail(\'' + item.slug + '\')">' +
        '<img src="' + posterSrc + '" alt="' + cleanTitle + '" class="card-poster" loading="lazy" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
        '<div class="card-badge" style="background: linear-gradient(135deg, #ff4444, #cc0000);">18+</div>' +
        '<div class="card-overlay"><div class="card-play-btn"><i class="fas fa-play"></i></div></div>' +
        '<div class="card-info"><h4 class="card-title">' + cleanTitle + '</h4>' +
        '<div class="card-meta"><span><i class="fas fa-play-circle" style="color:#ff4444"></i> Server Dado</span></div></div></div>';
}

// ==========================================================================
// Navigation
// ==========================================================================

function navigateTo(page, addToStack) {
    if (addToStack === undefined) addToStack = true;
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
        loadPageData(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    closeMobileMenu();
}

function goBack() {
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
    if (page === 'bokep-indo') { await loadBokepIndoPage(); return; }
    if (page === 'filipina') { await loadCategoryPage('filipina', filipinaCategory); return; }
    var cat = CATEGORIES[page];
    if (cat) { await loadCategoryPage(page, cat.api); return; }
}

// ==========================================================================
// Category Page Loading
// ==========================================================================

async function loadCategoryPage(pageKey, apiCategory) {
    var gridId = pageKey + '-grid';
    var grid = document.getElementById(gridId);
    if (!grid) return;
    if (categoryState[pageKey] && categoryState[pageKey].loaded) return;

    grid.innerHTML = '<div class="skeleton-container grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';

    var data = await fetchAPI('rebahan-list', { category: apiCategory, page: 1 });
    if (data && data.items && data.items.length > 0) {
        grid.innerHTML = data.items.map(function(item) { return createRebahanCard(item); }).join('');
        categoryState[pageKey] = { page: 1, hasMore: data.hasMore !== false, loaded: true, apiCategory: apiCategory };
        var btn = document.getElementById('load-more-' + pageKey);
        if (btn && !data.hasMore) btn.style.display = 'none';
    } else {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-film"></i><p>Tidak ada konten tersedia</p></div>';
        var btn2 = document.getElementById('load-more-' + pageKey);
        if (btn2) btn2.style.display = 'none';
    }
}

async function loadMoreCategory(pageKey) {
    var cs = categoryState[pageKey];
    if (!cs || !cs.hasMore) return;

    var btn = document.getElementById('load-more-' + pageKey);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...'; }

    var apiCat = cs.apiCategory || (CATEGORIES[pageKey] ? CATEGORIES[pageKey].api : pageKey);
    cs.page++;

    var data = await fetchAPI('rebahan-list', { category: apiCat, page: cs.page });
    var grid = document.getElementById(pageKey + '-grid');

    if (data && data.items && data.items.length > 0) {
        if (grid) grid.insertAdjacentHTML('beforeend', data.items.map(function(item) { return createRebahanCard(item); }).join(''));
        cs.hasMore = data.hasMore !== false;
        if (btn && !cs.hasMore) btn.style.display = 'none';
    } else {
        cs.page--;
        cs.hasMore = false;
        if (btn) btn.style.display = 'none';
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Muat Lebih Banyak'; }
}

function switchFilipina(cat, btnEl) {
    document.querySelectorAll('#filipina-tabs .rebahan-cat-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btnEl) btnEl.classList.add('active');
    filipinaCategory = cat;
    categoryState['filipina'] = { page: 1, hasMore: true, loaded: false };
    loadCategoryPage('filipina', cat);
}

// ==========================================================================
// Bokep Indo Page
// ==========================================================================

async function loadBokepIndoPage() {
    var grid = document.getElementById('bokep-indo-grid');
    if (!grid) return;
    if (categoryState['bokep-indo'].loaded) return;

    grid.innerHTML = '<div class="skeleton-container grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';

    try {
        var response = await fetch(BOKEP_API + '/videos?limit=30&page=1');
        var data = await response.json();
        if (data.status && data.results && data.results.length > 0) {
            grid.innerHTML = data.results.map(function(item) { return createAdultContentCard(item); }).join('');
            categoryState['bokep-indo'] = { page: 1, hasMore: data.results.length >= 30, loaded: true };
        } else {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-film"></i><p>Tidak ada konten tersedia</p></div>';
        }
    } catch (e) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Gagal memuat konten</p></div>';
    }
}

async function loadMoreBokepIndo() {
    var cs = categoryState['bokep-indo'];
    if (!cs || !cs.hasMore) return;

    var btn = document.getElementById('load-more-bokep-indo');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...'; }

    cs.page++;
    try {
        var response = await fetch(BOKEP_API + '/videos?limit=30&page=' + cs.page);
        var data = await response.json();
        var grid = document.getElementById('bokep-indo-grid');
        if (data.status && data.results && data.results.length > 0) {
            if (grid) grid.insertAdjacentHTML('beforeend', data.results.map(function(item) { return createAdultContentCard(item); }).join(''));
            cs.hasMore = data.results.length >= 30;
            if (btn && !cs.hasMore) btn.style.display = 'none';
        } else {
            cs.page--;
            cs.hasMore = false;
            if (btn) btn.style.display = 'none';
        }
    } catch (e) {
        cs.page--;
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Muat Lebih Banyak'; }
}

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
    var safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    container.innerHTML =
        '<button class="back-btn" onclick="goBack()"><i class="fas fa-arrow-left"></i> Kembali</button>' +
        '<div class="detail-header">' +
        '<img src="' + (poster || ADULT_POSTER_PLACEHOLDER) + '" alt="' + title + '" class="detail-poster" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
        '<div class="detail-info">' +
        '<h1 class="detail-title">' + title + '</h1>' +
        '<div class="detail-meta">' +
        '<div class="detail-meta-item" style="color: #ff4444;"><i class="fas fa-fire-alt"></i><span>18+</span></div>' +
        '<div class="detail-meta-item"><i class="fas fa-server"></i><span>Server Dado</span></div>' +
        '</div>' +
        '<p class="detail-description">Film Semi / JAV - Server Dado</p>' +
        '<div class="detail-actions">' +
        '<button class="detail-btn primary" onclick="playRebahanVideo(\'' + postId + '\', 0)"><i class="fas fa-play"></i> Tonton Sekarang</button>' +
        '</div></div></div>' +
        '<div class="episodes-section"><h2><i class="fas fa-play-circle"></i> Server Streaming</h2>' +
        '<div class="episodes-list" style="display:flex;flex-wrap:wrap;gap:10px;">' +
        '<button class="episode-btn" onclick="playRebahanVideo(\'' + postId + '\', 0)" style="padding:12px 20px;background:linear-gradient(135deg,#ff4444,#cc0000);border:none;border-radius:8px;color:white;cursor:pointer;font-weight:bold;">' +
        '<i class="fas fa-play-circle"></i> Server Dado</button></div></div>' +
        '<div class="episodes-section" style="margin-top:20px;"><h2><i class="fas fa-heart"></i> Simpan Video</h2>' +
        '<div style="display:flex;gap:10px;">' +
        '<button class="episode-btn" onclick="toggleAdultFavorite(\'rebahan-' + postId + '\', \'' + safeTitle + '\', \'' + (poster || '') + '\')" ' +
        'style="padding:12px 20px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;color:var(--text-color);cursor:pointer;">' +
        '<i class="fas fa-bookmark"></i> Favorit</button></div></div>' +
        '<div id="ad-rebahan-detail" class="ad-container"></div>';
    if (window._loadDetailAd) window._loadDetailAd('ad-rebahan-detail');
}

async function playRebahanVideo(postId, serverIndex) {
    if (window._hideSocialBar) window._hideSocialBar();
    showPageTransition();
    var rbData = window.currentRebahanData;
    if (!rbData || rbData.postId !== postId) {
        try {
            var data = await fetchAPI('rebahan-player', { post_id: postId });
            if (data && data.success && data.servers) {
                rbData = { postId: postId, title: 'Video', poster: '', servers: data.servers };
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
    container.innerHTML =
        '<button class="back-btn" onclick="goBack()"><i class="fas fa-arrow-left"></i> Kembali</button>' +
        '<div class="video-player-container adult-player" id="adult-player-wrapper">' +
        '<iframe src="' + server.url + '" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe></div>' +
        '<div class="video-info"><h2 class="video-title">' + title + '</h2>' +
        '<div class="video-meta adult-meta"><span class="adult-badge"><i class="fas fa-fire"></i> Film Dewasa</span>' +
        '<span style="margin-left:10px;color:var(--text-muted);">Server Dado</span></div></div>' +
        '<div id="ad-rebahan-watch" class="ad-container"></div>';
    if (window._loadWatchAd) window._loadWatchAd('ad-rebahan-watch');
    navigateTo('watch');
    hidePageTransition();
}

// ==========================================================================
// Detail Pages - Bokep API
// ==========================================================================

async function showAdultDetail(slug) {
    showPageTransition();
    try {
        var response = await fetch(BOKEP_API + '/videos/' + slug);
        var data = await response.json();
        if (data.status && data.data) {
            window.currentAdultContent = data.data;
            renderAdultDetail(data.data);
            navigateTo('detail');
        } else { showToast('Gagal memuat detail', 'error'); }
    } catch (e) { showToast('Gagal memuat konten', 'error'); }
    hidePageTransition();
}

function renderAdultDetail(item) {
    var container = document.getElementById('detail-container');
    if (!container) return;
    var title = (item.title || 'Video').replace('Bokep Indo \u2013 ', '').replace('Bokep Indo - ', '');
    var safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    var genres = (item.categories || []).slice(0, 5).map(function(c) { return '<span class="genre-tag">' + c + '</span>'; }).join('');
    container.innerHTML =
        '<button class="back-btn" onclick="goBack()"><i class="fas fa-arrow-left"></i> Kembali</button>' +
        '<div class="detail-header">' +
        '<img src="' + (item.poster || '') + '" alt="' + title + '" class="detail-poster" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
        '<div class="detail-info">' +
        '<h1 class="detail-title">' + title + '</h1>' +
        '<div class="detail-meta">' +
        '<div class="detail-meta-item" style="color:#ff4444;"><i class="fas fa-fire-alt"></i><span>18+</span></div>' +
        '<div class="detail-meta-item"><i class="fas fa-play-circle"></i><span>Server Dado</span></div></div>' +
        '<div class="detail-genres">' + genres + '</div>' +
        '<p class="detail-description">' + (item.description || 'Konten dewasa 18+') + '</p>' +
        '<div class="detail-actions">' +
        '<button class="detail-btn primary" onclick="playAdultVideo(\'' + item.slug + '\', 0)"><i class="fas fa-play"></i> Tonton Sekarang</button>' +
        '</div></div></div>' +
        '<div class="episodes-section"><h2><i class="fas fa-play-circle"></i> Server Streaming</h2>' +
        '<div class="episodes-list" style="display:flex;flex-wrap:wrap;gap:10px;">' +
        '<button class="episode-btn" onclick="playAdultVideo(\'' + item.slug + '\', 0)" style="padding:12px 20px;background:linear-gradient(135deg,#ff4444,#cc0000);border:none;border-radius:8px;color:white;cursor:pointer;font-weight:bold;">' +
        '<i class="fas fa-play-circle"></i> Server Dado</button></div></div>' +
        '<div class="episodes-section" style="margin-top:20px;"><h2><i class="fas fa-heart"></i> Simpan Video</h2>' +
        '<div style="display:flex;gap:10px;">' +
        '<button class="episode-btn" onclick="toggleAdultFavorite(\'' + item.slug + '\', \'' + safeTitle + '\', \'' + (item.poster || '') + '\')" ' +
        'style="padding:12px 20px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;color:var(--text-color);cursor:pointer;">' +
        '<i class="fas fa-bookmark"></i> Favorit</button></div></div>' +
        '<div id="ad-adult-detail" class="ad-container"></div>';
    window.currentAdultContent = item;
    if (window._loadDetailAd) window._loadDetailAd('ad-adult-detail');
}

async function playAdultVideo(slug, serverIndex) {
    if (serverIndex === undefined) serverIndex = 0;
    if (window._hideSocialBar) window._hideSocialBar();
    showPageTransition();
    var item = window.currentAdultContent;
    if (!item || item.slug !== slug) {
        try {
            var response = await fetch(BOKEP_API + '/videos/' + slug);
            var data = await response.json();
            if (data.status && data.data) { item = data.data; window.currentAdultContent = item; }
            else { hidePageTransition(); showToast('Video tidak ditemukan', 'error'); return; }
        } catch (e) { hidePageTransition(); showToast('Gagal memuat video', 'error'); return; }
    }
    if (!item || !item.sources || !item.sources[serverIndex]) { hidePageTransition(); showToast('Video tidak tersedia', 'error'); return; }

    var title = (item.title || 'Video').replace('Bokep Indo \u2013 ', '').replace('Bokep Indo - ', '');
    window.currentAdultSources = item.sources;
    window.currentAdultTitle = title;
    window.currentAdultSlug = slug;

    var imaxSource = null;
    var imaxIndex = -1;
    for (var si = 0; si < item.sources.length; si++) {
        if (item.sources[si].url.includes('imaxstreams.com')) { imaxSource = item.sources[si]; imaxIndex = si; break; }
    }
    if (!imaxSource) { imaxSource = item.sources[0]; imaxIndex = 0; }
    window.currentServerIndex = imaxIndex;

    addToHistory({ title: title, poster: item.poster, detailPath: 'adult:' + slug, slug: slug, type: 'adult', isAdult: true });

    var container = document.getElementById('watch-container');
    if (!container) { hidePageTransition(); return; }
    container.innerHTML =
        '<button class="back-btn" onclick="goBack()"><i class="fas fa-arrow-left"></i> Kembali</button>' +
        '<div class="video-player-container adult-player" id="adult-player-wrapper">' +
        '<div class="loading-video"><i class="fas fa-spinner fa-spin"></i><p>Memuat video...</p></div></div>' +
        '<div class="video-info"><h2 class="video-title">' + title + '</h2>' +
        '<div class="video-meta adult-meta"><span class="adult-badge"><i class="fas fa-fire"></i> Film Dewasa</span></div></div>' +
        '<div id="ad-adult-watch" class="ad-container"></div>';
    if (window._loadWatchAd) window._loadWatchAd('ad-adult-watch');

    var wrapper = document.getElementById('adult-player-wrapper');
    if (wrapper) useEmbedFallback(wrapper, imaxSource.url);

    navigateTo('watch');
    hidePageTransition();
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
        var results = await Promise.all([
            fetch(BOKEP_API + '/videos?q=' + encodeURIComponent(query) + '&limit=20').then(function(r) { return r.json(); }).catch(function() { return null; }),
            fetchAPI('rebahan-search', { q: query })
        ]);
        var bokepResponse = results[0];
        var rebahanData = results[1];
        if (rebahanData && rebahanData.items) {
            allResults = rebahanData.items.map(function(item) { item.isRebahan = true; item.type = 'rebahan'; return item; });
        }
        if (bokepResponse && bokepResponse.status && bokepResponse.results) {
            allResults = allResults.concat(bokepResponse.results.map(function(item) { item.isAdult = true; item.type = 'adult'; return item; }));
        }
    } catch (e) { console.error('Search error:', e); }

    if (showPage) {
        var grid = document.getElementById('search-grid');
        if (grid) {
            if (allResults.length > 0) {
                grid.innerHTML = allResults.map(function(item) {
                    if (item.isRebahan || item.type === 'rebahan') return createRebahanCard(item);
                    return createAdultContentCard(item);
                }).join('');
            } else {
                grid.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada hasil ditemukan</p></div>';
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
            var isRebahan = item.isRebahan || item.type === 'rebahan';
            var safePoster = encodeURIComponent(item.poster || '');
            var safeTitle = encodeURIComponent(item.title || '');
            var onclick = isRebahan
                ? "showRebahanDetail('" + item.postId + "', '" + safeTitle + "', '" + safePoster + "')"
                : "showAdultDetail('" + item.slug + "')";
            var title = isRebahan ? item.title : (item.title || 'Video').replace('Bokep Indo \u2013 ', '').replace('Bokep Indo - ', '');
            var poster = item.poster || ADULT_POSTER_PLACEHOLDER;
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
        var results = await Promise.all([
            fetch(BOKEP_API + '/videos?q=' + encodeURIComponent(query) + '&limit=10').then(function(r) { return r.json(); }).catch(function() { return null; }),
            fetchAPI('rebahan-search', { q: query })
        ]);
        var bokepResponse = results[0];
        var rebahanData = results[1];
        if (rebahanData && rebahanData.items) {
            allResults = rebahanData.items.map(function(item) { item.isRebahan = true; item.type = 'rebahan'; return item; });
        }
        if (bokepResponse && bokepResponse.status && bokepResponse.results) {
            allResults = allResults.concat(bokepResponse.results.map(function(item) { item.isAdult = true; item.type = 'adult'; return item; }));
        }
    } catch (e) { console.error('Mobile search error:', e); }

    if (allResults.length > 0) {
        container.innerHTML = allResults.slice(0, 10).map(function(item) {
            var isRebahan = item.isRebahan || item.type === 'rebahan';
            var safePoster = encodeURIComponent(item.poster || '');
            var safeTitle = encodeURIComponent(item.title || '');
            var onclick = isRebahan
                ? "closeMobileSearch(); showRebahanDetail('" + item.postId + "', '" + safeTitle + "', '" + safePoster + "')"
                : "closeMobileSearch(); showAdultDetail('" + item.slug + "')";
            var title = isRebahan ? item.title : (item.title || 'Video').replace('Bokep Indo \u2013 ', '').replace('Bokep Indo - ', '');
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
    var isRebahan = item.type === 'rebahan' || (item.detailPath && item.detailPath.startsWith('rebahan:'));
    var isAdult = item.type === 'adult' || (item.detailPath && item.detailPath.startsWith('adult:'));
    var slug = isAdult ? (item.slug || (item.detailPath ? item.detailPath.replace('adult:', '') : '')) : null;
    var postId = isRebahan ? (item.postId || (item.detailPath ? item.detailPath.replace('rebahan:', '') : '')) : null;
    var safePoster = encodeURIComponent(item.poster || '');
    var safeTitle = encodeURIComponent(item.title || '');
    var onclick;
    if (isRebahan) { onclick = "showRebahanDetail('" + postId + "', '" + safeTitle + "', '" + safePoster + "')"; }
    else if (isAdult) { onclick = "showAdultDetail('" + slug + "')"; }
    else { onclick = "showRebahanDetail('" + (postId || '') + "', '" + safeTitle + "', '" + safePoster + "')"; }
    return '<div class="content-card" onclick="' + onclick + '">' +
        '<img src="' + (item.poster || ADULT_POSTER_PLACEHOLDER) + '" alt="' + (item.title || '') + '" class="card-poster" onerror="this.src=\'' + ADULT_POSTER_PLACEHOLDER + '\'">' +
        '<div class="card-badge" style="background: linear-gradient(135deg, #ff4444, #cc0000);">18+</div>' +
        '<div class="card-overlay"><div class="card-play-btn"><i class="fas fa-play"></i></div></div>' +
        '<div class="card-info"><h4 class="card-title">' + (item.title || '') + '</h4></div></div>';
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
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-heart"></i><p>Belum ada favorit</p></div>';
    }
}

function loadHistory() {
    var grid = document.getElementById('history-grid');
    if (!grid) return;
    try { var stored = localStorage.getItem('bioskop_history'); if (stored) state.history = JSON.parse(stored); } catch (e) { state.history = []; }
    if (state.history.length > 0) {
        grid.innerHTML = state.history.map(function(item) { return createHistoryCard(item); }).join('');
    } else {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>Belum ada riwayat tontonan</p></div>';
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
    if (t) setTimeout(function() { t.classList.remove('active'); }, 300);
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
        '/film-semi': 'film-semi',
        '/bokep-indo': 'bokep-indo',
        '/bokep': 'bokep-indo',
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
            'film-semi': '/film-semi',
            'bokep-indo': '/bokep-indo',
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
    styles.textContent = '.adult-player{border-radius:12px;overflow:hidden;position:relative;width:100%;padding-top:56.25%;background:#000}' +
        '.adult-player video,.adult-player iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none}' +
        '.adult-meta{margin-top:10px}' +
        '.adult-badge{background:linear-gradient(135deg,#ff4444,#cc0000);padding:5px 12px;border-radius:20px;font-size:.85rem}' +
        '.loading-video{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#fff}' +
        '.loading-video i{font-size:3rem;margin-bottom:15px;color:#ff4444}.loading-video p{margin:0;font-size:1rem}' +
        '.imax-warning-below{background:rgba(40,40,40,.95);color:#ccc;padding:8px 15px;border-radius:0 0 8px 8px;display:flex;align-items:center;gap:8px;font-size:.75rem}' +
        '.imax-warning-below i{color:#ff9800;font-size:.85rem}.imax-warning-below span{flex:1}' +
        '.imax-warning-below button{background:none;border:none;color:#888;cursor:pointer;padding:3px 8px;font-size:.75rem}' +
        '.imax-warning-below button:hover{color:#fff}' +
        '@media(max-width:768px){.imax-warning-below{font-size:.7rem;padding:6px 10px}}';
    document.head.appendChild(styles);
}

function addCategoryTabStyles() {
    if (document.getElementById('rebahan-cat-styles')) return;
    var s = document.createElement('style');
    s.id = 'rebahan-cat-styles';
    s.textContent = '.rebahan-cat-btn{padding:8px 16px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:20px;color:var(--text-color);cursor:pointer;transition:all .3s;font-size:.85rem}.rebahan-cat-btn.active{background:linear-gradient(135deg,#ff4444,#cc0000);border-color:#ff4444;color:white;font-weight:bold}.rebahan-cat-btn:hover:not(.active){background:var(--hover-bg)}';
    document.head.appendChild(s);
}

// Legacy stubs for compatibility
function showDetail() {}
function showEmbeddedPlayer() {}
function switchServer() {}
function closeEmbeddedPlayer() {}
function isAdultVerified() { return true; }
function openAdultVerification() { navigateTo('home'); }
