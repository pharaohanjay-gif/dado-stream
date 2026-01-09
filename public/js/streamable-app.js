/**
 * DADO STREAM - StreamAble Inspired App
 * Complete streaming platform for Drama China, Anime, and Komik
 */

// ============ API Configuration ============
const API_BASE = '/api'; // Use internal API
const IMAGE_PROXY = 'https://wsrv.nl/?url=';
const INTERNAL_IMAGE_PROXY = '/api/proxy/image?url=';

// Helper function to get the right proxy for an image URL
function getProxiedImageUrl(imageUrl) {
    if (!imageUrl) return PLACEHOLDER_SMALL;
    
    // Some domains need internal proxy (wsrv.nl can't access them)
    const needsInternalProxy = [
        'samehadaku', 
        'shinigami', 
        'shngm',
        'komikindo'
    ];
    
    const useInternal = needsInternalProxy.some(domain => imageUrl.toLowerCase().includes(domain));
    
    if (useInternal) {
        return INTERNAL_IMAGE_PROXY + encodeURIComponent(imageUrl);
    }
    return IMAGE_PROXY + encodeURIComponent(imageUrl);
}

// Placeholder images (SVG data URLs - no network request needed)
const PLACEHOLDER_SMALL = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="150" height="225" viewBox="0 0 150 225"%3E%3Crect fill="%231a1a1a" width="150" height="225"/%3E%3Ctext fill="%23666" font-family="Arial" font-size="12" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
const PLACEHOLDER_LARGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="180" height="270" viewBox="0 0 180 270"%3E%3Crect fill="%231a1a1a" width="180" height="270"/%3E%3Ctext fill="%237d5fff" font-family="Arial" font-size="12" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
const PLACEHOLDER_SEARCH = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="50" height="70" viewBox="0 0 50 70"%3E%3Crect fill="%231a1a1a" width="50" height="70"/%3E%3Ctext fill="%23666" font-family="Arial" font-size="8" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo%3C/text%3E%3C/svg%3E';

// ============ State Management ============
const state = {
    currentPage: 'home',
    bannerIndex: 0,
    bannerInterval: null,
    dramaPage: 1,
    animePage: 1,
    komikPage: 1,
    currentContent: null,
    currentEpisode: null,
    currentChapter: null,
    episodes: [],
    chapters: [],
    searchTimeout: null,
    theme: localStorage.getItem('theme') || 'dark'
};

// ============ DOM Elements ============
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// ============ URL Route Mapping ============
const ROUTES = {
    'beranda': 'home',
    'home': 'home',
    'drama': 'drama',
    'anime': 'anime',
    'komik': 'komik',
    'trending': 'trending',
    'riwayat': 'history',
    'history': 'history',
    'favorit': 'favorites',
    'favorites': 'favorites'
};

const REVERSE_ROUTES = {
    'home': 'beranda',
    'drama': 'drama',
    'anime': 'anime',
    'komik': 'komik',
    'trending': 'trending',
    'history': 'riwayat',
    'favorites': 'favorit'
};

// ============ Initialization ============
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Apply saved theme
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
    
    // Load home data
    await Promise.all([
        loadHomeDrama(),
        loadHomeAnime(),
        loadHomeKomik(),
        loadBanners()
    ]);
    
    // Initialize features
    initSearch();
    initContinueWatching();
    initHistory();
    initFavorites();
    initScrollListener();
    initFilters();
    initRouter();
    
    // Hide splash screen
    setTimeout(() => {
        $('#splash-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
        
        // Navigate based on URL path after splash
        handleRouteFromUrl();
    }, 1500);
    
    // Auto-rotate banner
    startBannerAutoPlay();
}

// ============ Theme ============
function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('theme', state.theme);
    updateThemeIcon();
}

function updateThemeIcon() {
    const icon = $('#theme-icon');
    icon.className = state.theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

// ============ Router ============
function initRouter() {
    // Handle browser back/forward
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.page) {
            navigateTo(event.state.page, event.state.data, false);
        } else {
            handleRouteFromUrl();
        }
    });
}

function handleRouteFromUrl() {
    const path = window.location.pathname.replace('/', '').toLowerCase();
    
    if (path && ROUTES[path]) {
        navigateTo(ROUTES[path], null, false);
    } else if (path.startsWith('detail/')) {
        // Handle /detail/type/id URLs
        const parts = path.split('/');
        if (parts.length >= 3) {
            const type = parts[1];
            const id = parts[2];
            openDetail(type, id);
        }
    } else {
        // Default to home
        navigateTo('home', null, false);
    }
}

function updateUrl(page) {
    const urlPath = REVERSE_ROUTES[page] || page;
    const newUrl = `/${urlPath}`;
    
    // Only update if different from current
    if (window.location.pathname !== newUrl) {
        window.history.pushState({ page: page }, '', newUrl);
    }
}

// ============ Navigation ============
function navigateTo(page, data = null, updateHistory = true) {
    // Update sidebar & mobile nav active states
    $$('.sidebar-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    $$('.mobile-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    
    // Hide all pages, show target page
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${page}`).classList.add('active');
    
    state.currentPage = page;
    
    // Update URL
    if (updateHistory && ['home', 'drama', 'anime', 'komik', 'trending', 'history', 'favorites'].includes(page)) {
        updateUrl(page);
    }
    
    // Load page data if needed
    switch(page) {
        case 'drama':
            if (!$('#drama-grid').querySelector('.card')) loadDramaPage();
            break;
        case 'anime':
            if (!$('#anime-grid').querySelector('.card')) loadAnimePage();
            break;
        case 'komik':
            if (!$('#komik-grid').querySelector('.card')) loadKomikPage();
            break;
        case 'trending':
            loadTrending('drama');
            break;
        case 'history':
            loadHistory();
            break;
        case 'favorites':
            loadFavorites();
            break;
        case 'detail':
            if (data) loadDetail(data.type, data.id);
            break;
        case 'watch':
            if (data) loadWatch(data.type, data.id, data.episode);
            break;
        case 'read':
            if (data) loadReader(data.id, data.chapter);
            break;
    }
    
    // Close mobile menu if open
    $('#sidebar').classList.remove('open');
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
    $('#sidebar').classList.toggle('open');
}

// ============ Banner ============
async function loadBanners() {
    try {
        // Load trending anime for banners
        const response = await fetch(`${API_BASE}/anime?action=popular`);
        const result = await response.json();
        const data = result.data || result;
        
        if (Array.isArray(data) && data.length > 0) {
            const banners = data.slice(0, 5);
            renderAnimeBanners(banners);
        } else {
            renderFallbackBanner();
        }
    } catch (error) {
        console.error('Error loading banners:', error);
        renderFallbackBanner();
    }
}

function renderFallbackBanner() {
    $('#hero-slider').innerHTML = `
        <div class="hero-slide">
            <img src="https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&h=400&fit=crop" alt="DADO STREAM">
            <div class="hero-content">
                <span class="hero-badge">Welcome</span>
                <h2 class="hero-title">Selamat Datang di DADO STREAM</h2>
                <p class="hero-desc">Platform streaming drama China, anime, dan komik terlengkap</p>
                <div class="hero-actions">
                    <button class="hero-btn hero-btn-primary" onclick="navigateTo('drama')">
                        <i class="fas fa-play"></i> Mulai Nonton
                    </button>
                </div>
            </div>
        </div>
    `;
    $('#hero-indicators').innerHTML = '<div class="hero-indicator active"></div>';
}

function renderBanners(banners) {
    const slider = $('#hero-slider');
    const indicators = $('#hero-indicators');
    
    slider.innerHTML = banners.map((drama, index) => {
        const image = drama.image || drama.cover || drama.thumbnail_url || '';
        const imgUrl = image ? getProxiedImageUrl(image) : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&h=400&fit=crop';
        const bookId = drama.bookId || drama.id || drama.urlId;
        
        return `
            <div class="hero-slide" onclick="openDetail('drama', '${bookId}')">
                <img src="${imgUrl}" alt="${drama.title || drama.judul}">
                <div class="hero-content">
                    <span class="hero-badge">Drama China</span>
                    <h2 class="hero-title">${drama.title || drama.judul}</h2>
                    <p class="hero-desc">${drama.synopsis || drama.description || 'Tonton sekarang di DADO STREAM'}</p>
                    <div class="hero-meta">
                        <div class="hero-meta-item">
                            <i class="fas fa-film"></i>
                            <span>${drama.totalEpisode || drama.episode || '??'} Episode</span>
                        </div>
                        <div class="hero-meta-item">
                            <i class="fas fa-star"></i>
                            <span>${drama.rating || '8.5'}</span>
                        </div>
                    </div>
                    <div class="hero-actions">
                        <button class="hero-btn hero-btn-primary" onclick="event.stopPropagation(); watchDrama('${bookId}')">
                            <i class="fas fa-play"></i> Tonton Sekarang
                        </button>
                        <button class="hero-btn hero-btn-secondary" onclick="event.stopPropagation(); openDetail('drama', '${bookId}')">
                            <i class="fas fa-info-circle"></i> Detail
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    indicators.innerHTML = banners.map((_, index) => `
        <div class="hero-indicator ${index === 0 ? 'active' : ''}" onclick="goToBanner(${index})"></div>
    `).join('');
}

function renderAnimeBanners(banners) {
    const slider = $('#hero-slider');
    const indicators = $('#hero-indicators');
    
    slider.innerHTML = banners.map((anime, index) => {
        const image = anime.poster || anime.image || anime.thumbnail_url || '';
        const imgUrl = image ? getProxiedImageUrl(image) : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&h=400&fit=crop';
        const animeId = anime.animeId || anime.urlId || anime.id;
        const title = anime.title || anime.english || anime.japanese || 'Anime';
        
        return `
            <div class="hero-slide" onclick="openDetail('anime', '${animeId}')">
                <img src="${imgUrl}" alt="${title}">
                <div class="hero-content">
                    <span class="hero-badge">Anime Trending</span>
                    <h2 class="hero-title">${title}</h2>
                    <p class="hero-desc">${anime.synopsis || anime.description || 'Tonton sekarang di DADO STREAM'}</p>
                    <div class="hero-meta">
                        <div class="hero-meta-item">
                            <i class="fas fa-play-circle"></i>
                            <span>${anime.episodes || anime.episode || 'Ongoing'}</span>
                        </div>
                        <div class="hero-meta-item">
                            <i class="fas fa-star"></i>
                            <span>${anime.rating || anime.score || '8.5'}</span>
                        </div>
                    </div>
                    <div class="hero-actions">
                        <button class="hero-btn hero-btn-primary" onclick="event.stopPropagation(); openDetail('anime', '${animeId}')">
                            <i class="fas fa-play"></i> Tonton Sekarang
                        </button>
                        <button class="hero-btn hero-btn-secondary" onclick="event.stopPropagation(); openDetail('anime', '${animeId}')">
                            <i class="fas fa-info-circle"></i> Detail
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    indicators.innerHTML = banners.map((_, index) => `
        <div class="hero-indicator ${index === 0 ? 'active' : ''}" onclick="goToBanner(${index})"></div>
    `).join('');
}

function goToBanner(index) {
    state.bannerIndex = index;
    $('#hero-slider').style.transform = `translateX(-${index * 100}%)`;
    $$('.hero-indicator').forEach((ind, i) => {
        ind.classList.toggle('active', i === index);
    });
}

function nextBanner() {
    const slides = $$('.hero-slide').length;
    goToBanner((state.bannerIndex + 1) % slides);
}

function prevBanner() {
    const slides = $$('.hero-slide').length;
    goToBanner((state.bannerIndex - 1 + slides) % slides);
}

function startBannerAutoPlay() {
    state.bannerInterval = setInterval(nextBanner, 5000);
}

// ============ Home Sections ============
async function loadHomeDrama() {
    try {
        const response = await fetch(`${API_BASE}/drama?action=latest`);
        const result = await response.json();
        const data = result.data || result; // Handle both formats
        
        if (Array.isArray(data) && data.length > 0) {
            renderCards('#home-drama', data.slice(0, 10), 'drama');
        } else {
            $('#home-drama').innerHTML = '<p class="empty-message">Tidak ada drama tersedia</p>';
        }
    } catch (error) {
        console.error('Error loading home drama:', error);
        $('#home-drama').innerHTML = '<p class="error-message">Gagal memuat drama</p>';
    }
}

async function loadHomeAnime() {
    try {
        const response = await fetch(`${API_BASE}/anime?action=latest`);
        const result = await response.json();
        const data = result.data || result; // Handle both formats
        
        if (Array.isArray(data) && data.length > 0) {
            renderCards('#home-anime', data.slice(0, 10), 'anime');
        } else {
            $('#home-anime').innerHTML = '<p class="empty-message">Tidak ada anime tersedia</p>';
        }
    } catch (error) {
        console.error('Error loading home anime:', error);
        $('#home-anime').innerHTML = '<p class="error-message">Gagal memuat anime</p>';
    }
}

async function loadHomeKomik() {
    try {
        const response = await fetch(`${API_BASE}/komik?action=popular`);
        const result = await response.json();
        const data = result.data || result; // Handle both formats
        
        if (Array.isArray(data) && data.length > 0) {
            renderCards('#home-komik', data.slice(0, 10), 'komik');
        } else {
            $('#home-komik').innerHTML = '<p class="empty-message">Tidak ada komik tersedia</p>';
        }
    } catch (error) {
        console.error('Error loading home komik:', error);
        $('#home-komik').innerHTML = '<p class="error-message">Gagal memuat komik</p>';
    }
}

// ============ Page Loaders ============
async function loadDramaPage() {
    const grid = $('#drama-grid');
    grid.innerHTML = '<div class="skeleton-container grid">' + '<div class="skeleton-card"></div>'.repeat(12) + '</div>';
    
    try {
        const response = await fetch(`${API_BASE}/drama?action=latest`);
        const result = await response.json();
        const data = result.data || result;
        
        if (Array.isArray(data) && data.length > 0) {
            renderCards('#drama-grid', data, 'drama', true);
        } else {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-film"></i><p>Tidak ada drama tersedia</p></div>';
        }
    } catch (error) {
        console.error('Error loading drama page:', error);
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat drama</p></div>';
    }
}

async function loadMoreDrama() {
    state.dramaPage++;
    const btn = $('#load-more-drama');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...';
    
    try {
        // Drama API doesn't have pagination, so we load trending instead
        const response = await fetch(`${API_BASE}/drama?action=trending`);
        const result = await response.json();
        const data = result.data || result;
        
        if (Array.isArray(data) && data.length > 0) {
            const grid = $('#drama-grid');
            data.forEach(drama => {
                grid.innerHTML += createCard(drama, 'drama');
            });
        }
    } catch (error) {
        console.error('Error loading more drama:', error);
        showToast('Gagal memuat lebih banyak drama', 'error');
    }
    
    btn.innerHTML = '<i class="fas fa-plus"></i> Muat Lebih Banyak';
}

async function loadAnimePage() {
    const grid = $('#anime-grid');
    grid.innerHTML = '<div class="skeleton-container grid">' + '<div class="skeleton-card"></div>'.repeat(12) + '</div>';
    
    try {
        const response = await fetch(`${API_BASE}/anime?action=latest&page=${state.animePage}`);
        const result = await response.json();
        const data = result.data || result;
        
        if (Array.isArray(data) && data.length > 0) {
            renderCards('#anime-grid', data, 'anime', true);
        } else {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-dragon"></i><p>Tidak ada anime tersedia</p></div>';
        }
    } catch (error) {
        console.error('Error loading anime page:', error);
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat anime</p></div>';
    }
}

async function loadMoreAnime() {
    state.animePage++;
    const btn = $('#load-more-anime');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...';
    
    try {
        const response = await fetch(`${API_BASE}/anime?action=latest&page=${state.animePage}`);
        const result = await response.json();
        const data = result.data || result;
        
        if (Array.isArray(data) && data.length > 0) {
            const grid = $('#anime-grid');
            data.forEach(anime => {
                grid.innerHTML += createCard(anime, 'anime');
            });
        }
    } catch (error) {
        console.error('Error loading more anime:', error);
        showToast('Gagal memuat lebih banyak anime', 'error');
    }
    
    btn.innerHTML = '<i class="fas fa-plus"></i> Muat Lebih Banyak';
}

async function loadKomikPage() {
    const grid = $('#komik-grid');
    grid.innerHTML = '<div class="skeleton-container grid">' + '<div class="skeleton-card"></div>'.repeat(12) + '</div>';
    
    try {
        const response = await fetch(`${API_BASE}/komik?action=popular`);
        const result = await response.json();
        const data = result.data || result;
        
        if (Array.isArray(data) && data.length > 0) {
            renderCards('#komik-grid', data, 'komik', true);
        } else {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i><p>Tidak ada komik tersedia</p></div>';
        }
    } catch (error) {
        console.error('Error loading komik page:', error);
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat komik</p></div>';
    }
}

async function loadMoreKomik() {
    state.komikPage++;
    const btn = $('#load-more-komik');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...';
    
    try {
        const response = await fetch(`${API_BASE}/komik?action=popular&page=${state.komikPage}`);
        const result = await response.json();
        const data = result.data || result;
        
        if (Array.isArray(data) && data.length > 0) {
            const grid = $('#komik-grid');
            data.forEach(komik => {
                grid.innerHTML += createCard(komik, 'komik');
            });
        }
    } catch (error) {
        console.error('Error loading more komik:', error);
        showToast('Gagal memuat lebih banyak komik', 'error');
    }
    
    btn.innerHTML = '<i class="fas fa-plus"></i> Muat Lebih Banyak';
}

// ============ Card Rendering ============
function renderCards(selector, items, type, isGrid = false) {
    const container = $(selector);
    if (!items || !Array.isArray(items) || items.length === 0) {
        container.innerHTML = '<p class="empty-message">Tidak ada konten tersedia</p>';
        return;
    }
    container.innerHTML = items.map(item => createCard(item, type)).join('');
}

function createCard(item, type) {
    let image, title, badge, info, id;
    
    switch(type) {
        case 'drama':
            image = item.image || item.cover || item.thumbnail_url || '';
            title = item.title || item.judul || 'Unknown';
            badge = 'Drama';
            info = `${item.totalEpisode || item.episode || '??'} Episode`;
            id = item.bookId || item.id || item.urlId;
            break;
        case 'anime':
            image = item.image || item.poster || item.thumbnail_url || '';
            title = item.title || item.judul || 'Unknown';
            badge = item.type || 'Anime';
            info = item.episode || item.status || 'Ongoing';
            id = item.urlId || item.id;
            break;
        case 'komik':
            image = item.thumbnail || item.cover || item.image || '';
            title = item.title || item.judul || 'Unknown';
            badge = item.type || 'Manga';
            info = item.chapter || item.latestChapter || 'Ongoing';
            id = item.slug || item.id || item.manga_id;
            break;
    }
    
    const imgUrl = image ? getProxiedImageUrl(image) : PLACEHOLDER_SMALL;
    
    return `
        <div class="card" onclick="openDetail('${type}', '${id}')">
            <div class="card-image">
                <img src="${imgUrl}" alt="${title}" loading="lazy" onerror="this.src=PLACEHOLDER_SMALL">
                <div class="card-overlay">
                    <div class="card-play">
                        <i class="fas fa-${type === 'komik' ? 'book-reader' : 'play'}"></i>
                    </div>
                </div>
                <span class="card-badge">${badge}</span>
            </div>
            <h3 class="card-title">${title}</h3>
            <div class="card-info">
                <span>${info}</span>
            </div>
        </div>
    `;
}

// ============ Detail Page ============
async function openDetail(type, id) {
    if (!id || id === 'undefined') {
        showToast('ID tidak valid', 'error');
        return;
    }
    state.currentContent = { type, id };
    navigateTo('detail');
    loadDetail(type, id);
}

async function loadDetail(type, id) {
    const container = $('#detail-container');
    container.innerHTML = '<div class="loading" style="text-align:center;padding:50px;"><i class="fas fa-spinner fa-spin" style="font-size:48px;color:var(--primary);"></i><p style="margin-top:20px;">Memuat...</p></div>';
    
    try {
        let data;
        switch(type) {
            case 'drama':
                data = await fetchDramaDetail(id);
                break;
            case 'anime':
                data = await fetchAnimeDetail(id);
                break;
            case 'komik':
                data = await fetchKomikDetail(id);
                break;
        }
        
        if (data) {
            renderDetail(type, data);
        } else {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Data tidak ditemukan</p></div>';
        }
    } catch (error) {
        console.error('Error loading detail:', error);
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat detail</p></div>';
    }
}

async function fetchDramaDetail(id) {
    const response = await fetch(`${API_BASE}/drama?action=detail&bookId=${id}`);
    const result = await response.json();
    const data = result.data || result;
    
    // Get episodes
    try {
        const epResponse = await fetch(`${API_BASE}/drama?action=allepisode&bookId=${id}`);
        const epResult = await epResponse.json();
        const epData = epResult.data || epResult;
        state.episodes = Array.isArray(epData) ? epData : [];
    } catch (e) {
        state.episodes = [];
    }
    
    return data;
}

async function fetchAnimeDetail(id) {
    const response = await fetch(`${API_BASE}/anime?action=detail&urlId=${id}`);
    const result = await response.json();
    const data = result.data || result;
    state.episodes = data.episodes || [];
    return data;
}

async function fetchKomikDetail(id) {
    const response = await fetch(`${API_BASE}/komik?action=detail&manga_id=${id}`);
    const result = await response.json();
    const data = result.data || result;
    state.chapters = data.chapters || data.daftar_chapter || [];
    return data;
}

function renderDetail(type, data) {
    const container = $('#detail-container');
    const isFavorited = isFavorite(type, state.currentContent.id);
    
    let image, title, description, totalEp, rating, genres, status;
    
    switch(type) {
        case 'drama':
            // Support both normalized (title/image) and raw (bookName/coverWap) formats
            image = data.image || data.cover || data.thumbnail_url || data.coverWap || '';
            title = data.title || data.judul || data.bookName || 'Unknown';
            description = data.synopsis || data.description || data.introduction || 'Tidak ada deskripsi';
            totalEp = data.totalEpisode || data.chapterCount || state.episodes.length || '??';
            rating = data.rating || '8.5';
            genres = data.genres || data.genre || data.tags || ['Drama', 'China'];
            status = data.status || 'Ongoing';
            break;
        case 'anime':
            image = data.poster || data.image || data.thumbnail_url || '';
            // Title can be empty, use english/japanese as fallback
            title = data.title || data.english || data.japanese || data.judul || 'Unknown';
            // Synopsis can be an object with paragraphs array
            if (data.synopsis && typeof data.synopsis === 'object' && data.synopsis.paragraphs) {
                description = data.synopsis.paragraphs.join(' ') || 'Tidak ada deskripsi';
            } else {
                description = data.synopsis || data.description || 'Tidak ada deskripsi';
            }
            totalEp = data.totalEpisodes || data.episodes?.length || state.episodes.length || '??';
            // Score can be object with value property
            if (data.score && typeof data.score === 'object') {
                rating = data.score.value || '8.0';
            } else {
                rating = data.rating || data.score || '8.0';
            }
            // genreList is array of objects with title property
            if (data.genreList && Array.isArray(data.genreList) && data.genreList[0]?.title) {
                genres = data.genreList.map(g => g.title);
            } else {
                genres = data.genreList || data.genres || data.genre || ['Anime'];
            }
            status = data.status || 'Ongoing';
            break;
        case 'komik':
            image = data.thumbnail || data.cover || data.image || '';
            title = data.title || data.judul || 'Unknown';
            description = data.synopsis || data.description || 'Tidak ada deskripsi';
            totalEp = state.chapters.length || '??';
            rating = data.rating || '8.0';
            genres = data.genres || data.genre || [data.type || 'Manga'];
            status = data.status || 'Ongoing';
            break;
    }
    
    const imgUrl = image ? getProxiedImageUrl(image) : PLACEHOLDER_LARGE;
    
    // Handle genres - can be string or array
    let genresList = [];
    if (typeof genres === 'string') {
        genresList = genres.split(',').map(g => g.trim());
    } else if (Array.isArray(genres)) {
        genresList = genres;
    }
    
    container.innerHTML = `
        <div class="detail-header">
            <img src="${imgUrl}" alt="${title}" class="detail-backdrop" onerror="this.style.display='none'">
            <div class="detail-backdrop-overlay"></div>
            <div class="detail-content">
                <div class="detail-poster">
                    <img src="${imgUrl}" alt="${title}" onerror="this.src=PLACEHOLDER_LARGE">
                </div>
                <div class="detail-info">
                    <h1 class="detail-title">${title}</h1>
                    <div class="detail-meta">
                        <div class="detail-meta-item">
                            <i class="fas fa-star"></i>
                            <span>${rating}</span>
                        </div>
                        <div class="detail-meta-item">
                            <i class="fas fa-${type === 'komik' ? 'book' : 'film'}"></i>
                            <span>${totalEp} ${type === 'komik' ? 'Chapter' : 'Episode'}</span>
                        </div>
                        <div class="detail-meta-item">
                            <i class="fas fa-circle"></i>
                            <span>${status}</span>
                        </div>
                    </div>
                    <div class="detail-genres">
                        ${genresList.map(g => `<span class="detail-genre">${g}</span>`).join('')}
                    </div>
                    <div class="detail-actions">
                        <button class="detail-btn detail-btn-primary" onclick="${type === 'komik' ? `readKomik('${state.currentContent.id}')` : `watchContent('${type}', '${state.currentContent.id}')`}">
                            <i class="fas fa-${type === 'komik' ? 'book-reader' : 'play'}"></i>
                            ${type === 'komik' ? 'Baca Sekarang' : 'Tonton Sekarang'}
                        </button>
                        <button class="detail-btn detail-btn-secondary ${isFavorited ? 'favorited' : ''}" onclick="toggleFavorite('${type}', '${state.currentContent.id}', '${title.replace(/'/g, "\\'")}', '${imgUrl}')">
                            <i class="fas fa-heart"></i>
                            ${isFavorited ? 'Hapus Favorit' : 'Tambah Favorit'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="detail-body">
            <div class="detail-main">
                <div class="detail-section">
                    <h3 class="detail-section-title"><i class="fas fa-info-circle"></i> Sinopsis</h3>
                    <p class="detail-description">${description}</p>
                </div>
                
                <div class="detail-section">
                    <h3 class="detail-section-title">
                        <i class="fas fa-${type === 'komik' ? 'list' : 'play-circle'}"></i> 
                        ${type === 'komik' ? 'Daftar Chapter' : 'Daftar Episode'}
                    </h3>
                    ${type === 'komik' ? renderChapterList() : renderEpisodeList(type)}
                </div>
            </div>
        </div>
    `;
}

function renderEpisodeList(type) {
    if (!state.episodes || state.episodes.length === 0) {
        return '<p class="empty-message">Tidak ada episode tersedia</p>';
    }
    
    return `
        <div class="episode-grid">
            ${state.episodes.map((ep, index) => {
                // For drama: use chapterId and chapterIndex
                // For anime: use episodeId or id
                const epNum = ep.chapterIndex !== undefined ? (ep.chapterIndex + 1) : (ep.episode || ep.eps || index + 1);
                const epId = ep.chapterId || ep.episodeId || ep.id || ep.slug;
                const epName = ep.chapterName || ep.title || `Episode ${epNum}`;
                return `
                    <button class="episode-btn" onclick="playEpisode('${type}', '${epId}', ${epNum})" title="${epName}">
                        ${epName}
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

function renderChapterList() {
    if (!state.chapters || state.chapters.length === 0) {
        return '<p class="empty-message">Tidak ada chapter tersedia</p>';
    }
    
    return `
        <div class="chapter-list">
            ${state.chapters.map(ch => {
                // Support multiple field names: judul_chapter (komikindo), title, chapter, name
                const chTitle = ch.judul_chapter || ch.title || ch.chapter || ch.name || 'Chapter';
                // Support multiple ID fields: chapterId, link_chapter, slug, id
                const chId = ch.chapterId || ch.link_chapter || ch.slug || ch.id;
                const chDate = ch.waktu_rilis || ch.date || ch.uploadDate || '';
                return `
                    <div class="chapter-item" onclick="readChapter('${chId}')">
                        <span class="chapter-title">${chTitle}</span>
                        <span class="chapter-date">${chDate}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ============ Watch Page ============
async function watchContent(type, id) {
    // Get first episode
    if (state.episodes && state.episodes.length > 0) {
        const firstEp = state.episodes[0];
        // Use chapterId for drama, episodeId for anime
        const epId = firstEp.chapterId || firstEp.episodeId || firstEp.id || firstEp.slug;
        const epNum = (firstEp.chapterIndex !== undefined) ? (firstEp.chapterIndex + 1) : 1;
        playEpisode(type, epId, epNum);
    } else {
        showToast('Tidak ada episode tersedia', 'error');
    }
}

async function watchDrama(id) {
    // Fetch drama detail first to get episodes
    try {
        const response = await fetch(`${API_BASE}/drama?action=detail&bookId=${id}`);
        const data = await response.json();
        if (data.status && data.data) {
            const drama = data.data;
            state.currentContent = { type: 'drama', id, title: drama.title || drama.judul || drama.bookName };
            // Fetch all episodes
            const epResponse = await fetch(`${API_BASE}/drama?action=allepisode&bookId=${id}`);
            const epData = await epResponse.json();
            if (epData.status && epData.data) {
                state.episodes = epData.data;
            }
            if (state.episodes && state.episodes.length > 0) {
                const firstEp = state.episodes[0];
                // Drama uses chapterId as episode ID
                const epId = firstEp.chapterId || firstEp.id || firstEp.episodeId;
                const epNum = (firstEp.chapterIndex !== undefined) ? (firstEp.chapterIndex + 1) : 1;
                playEpisode('drama', epId, epNum);
            } else {
                showToast('Tidak ada episode tersedia', 'error');
            }
        } else {
            showToast('Tidak ada episode tersedia', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Gagal memuat episode', 'error');
    }
}

async function playEpisode(type, episodeId, episodeNum) {
    state.currentEpisode = { id: episodeId, number: episodeNum };
    navigateTo('watch');
    
    const container = $('#watch-container');
    container.innerHTML = `
        <div class="video-player-wrapper">
            <div class="video-loading">
                <i class="fas fa-spinner"></i>
                <span>Memuat video...</span>
            </div>
        </div>
    `;
    
    try {
        let videoUrl, servers = [];
        
        if (type === 'drama') {
            // Drama requires bookId to fetch video from allepisode data
            const bookId = state.currentContent?.id;
            if (!bookId) {
                throw new Error('Book ID not found');
            }
            const response = await fetch(`${API_BASE}/drama?action=video&episodeId=${episodeId}&bookId=${bookId}`);
            const data = await response.json();
            if (data.status && data.data) {
                videoUrl = data.data.video || data.data.url || data.data.stream || data.data.playUrl;
                servers = data.data.servers || [];
            }
        } else if (type === 'anime') {
            const response = await fetch(`${API_BASE}/anime?action=getvideo&episodeId=${episodeId}`);
            const data = await response.json();
            if (data.status && data.data) {
                // Get streaming URL from available sources
                const sources = data.data.sources || data.data.stream || [];
                if (Array.isArray(sources) && sources.length > 0) {
                    videoUrl = sources[0].url || sources[0].file || sources[0].src || sources[0];
                } else if (data.data.url || data.data.video) {
                    videoUrl = data.data.url || data.data.video;
                }
                servers = data.data.servers || [];
            }
        }
        
        if (videoUrl) {
            renderWatchPage(type, videoUrl, episodeNum, servers);
            saveToHistory(type, state.currentContent.id, state.currentContent.title, episodeNum, state.currentContent.image);
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Video tidak tersedia</p>
                    <button class="detail-btn detail-btn-primary" onclick="navigateTo('detail', state.currentContent)">
                        Kembali ke Detail
                    </button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading video:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Gagal memuat video</p>
            </div>
        `;
    }
}

function renderWatchPage(type, videoUrl, episodeNum, servers) {
    const container = $('#watch-container');
    const title = state.currentContent?.title || 'Video';
    const epIndex = state.episodes.findIndex(ep => 
        (ep.id || ep.slug || ep.episodeId || ep.chapterId) === state.currentEpisode.id
    );
    const hasPrev = epIndex > 0;
    const hasNext = epIndex < state.episodes.length - 1;
    
    // Detect if video is direct mp4 or embed URL
    const isDirectVideo = videoUrl.endsWith('.mp4') || videoUrl.includes('.mp4?') || videoUrl.includes('dramaboxdb.com');
    
    // Video player HTML based on type
    const videoPlayerHtml = isDirectVideo ? `
        <video 
            id="video-player"
            class="video-player" 
            src="${videoUrl}" 
            controls
            autoplay
            playsinline
            style="width: 100%; max-height: 70vh; background: #000;"
        >
            Your browser does not support the video tag.
        </video>
    ` : `
        <iframe 
            id="video-player"
            class="video-player" 
            src="${videoUrl}" 
            frameborder="0" 
            allowfullscreen
            allow="autoplay; fullscreen; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation"
        ></iframe>
    `;
    
    container.innerHTML = `
        <div class="video-player-wrapper">
            ${videoPlayerHtml}
        </div>
        
        <div class="watch-info">
            <div class="watch-details">
                <h1 class="watch-title">${title}</h1>
                <p class="watch-episode">Episode ${episodeNum}</p>
                <div class="watch-actions">
                    <button class="watch-action-btn" onclick="toggleFavorite('${type}', '${state.currentContent.id}', '${title}', '')">
                        <i class="fas fa-heart"></i> Favorit
                    </button>
                    <button class="watch-action-btn" onclick="openDetail('${type}', '${state.currentContent.id}')">
                        <i class="fas fa-list"></i> Daftar Episode
                    </button>
                </div>
            </div>
            <div class="episode-navigation">
                <button class="nav-episode-btn" onclick="playPrevEpisode('${type}')" ${!hasPrev ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Sebelumnya
                </button>
                <button class="nav-episode-btn" onclick="playNextEpisode('${type}')" ${!hasNext ? 'disabled' : ''}>
                    Selanjutnya <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
        
        ${servers.length > 0 ? `
            <div class="server-section">
                <h3 class="server-title"><i class="fas fa-server"></i> Pilih Kualitas</h3>
                <div class="server-list">
                    ${servers.map((server, i) => `
                        <button class="server-btn ${i === 0 ? 'active' : ''}" onclick="changeServer('${server.url || server.file}', this, ${isDirectVideo})">
                            ${server.name || server.quality || 'Server ' + (i + 1)}
                        </button>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        <div class="detail-section">
            <h3 class="detail-section-title"><i class="fas fa-play-circle"></i> Episode Lainnya</h3>
            <div class="episode-grid">
                ${state.episodes.map((ep, index) => {
                    // Support both drama (chapterIndex) and anime (episode) fields
                    const epNum = ep.chapterIndex !== undefined ? (ep.chapterIndex + 1) : (ep.episode || ep.eps || index + 1);
                    const epId = ep.chapterId || ep.id || ep.slug || ep.episodeId;
                    const isWatching = epId === state.currentEpisode.id;
                    const epName = ep.chapterName || `Episode ${epNum}`;
                    return `
                        <button class="episode-btn ${isWatching ? 'watching' : ''}" onclick="playEpisode('${type}', '${epId}', ${epNum})" title="${epName}">
                            ${epName}
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function playNextEpisode(type) {
    const epIndex = state.episodes.findIndex(ep => 
        (ep.chapterId || ep.id || ep.slug || ep.episodeId) === state.currentEpisode.id
    );
    if (epIndex < state.episodes.length - 1) {
        const nextEp = state.episodes[epIndex + 1];
        const epId = nextEp.chapterId || nextEp.id || nextEp.slug || nextEp.episodeId;
        const epNum = nextEp.chapterIndex !== undefined ? (nextEp.chapterIndex + 1) : (nextEp.episode || nextEp.eps || epIndex + 2);
        playEpisode(type, epId, epNum);
    }
}

function playPrevEpisode(type) {
    const epIndex = state.episodes.findIndex(ep => 
        (ep.chapterId || ep.id || ep.slug || ep.episodeId) === state.currentEpisode.id
    );
    if (epIndex > 0) {
        const prevEp = state.episodes[epIndex - 1];
        const epId = prevEp.chapterId || prevEp.id || prevEp.slug || prevEp.episodeId;
        const epNum = prevEp.chapterIndex !== undefined ? (prevEp.chapterIndex + 1) : (prevEp.episode || prevEp.eps || epIndex);
        playEpisode(type, epId, epNum);
    }
}

function changeServer(url, btn, isDirectVideo = false) {
    $$('.server-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const player = $('#video-player');
    if (player) {
        if (isDirectVideo || url.endsWith('.mp4') || url.includes('.mp4?')) {
            // For direct video, update src attribute
            player.src = url;
            if (player.tagName === 'VIDEO') {
                player.load();
                player.play().catch(e => console.log('Autoplay blocked'));
            }
        } else {
            // For iframe embeds
            player.src = url;
        }
    }
}

// ============ Reader Page ============
async function readKomik(id) {
    if (state.chapters && state.chapters.length > 0) {
        const firstChapter = state.chapters[state.chapters.length - 1]; // Usually first chapter is at the end
        const chId = firstChapter.slug || firstChapter.id || firstChapter.chapterId;
        readChapter(chId);
    } else {
        showToast('Tidak ada chapter tersedia', 'error');
    }
}

async function readChapter(chapterId) {
    state.currentChapter = chapterId;
    navigateTo('read');
    
    const container = $('#reader-container');
    container.innerHTML = `
        <div class="loading" style="text-align: center; padding: 50px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: var(--primary);"></i>
            <p style="margin-top: 20px;">Memuat chapter...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE}/komik?action=chapter&chapterId=${encodeURIComponent(chapterId)}`);
        const data = await response.json();
        
        if (data.status && data.data) {
            renderReader(data.data);
            saveToHistory('komik', state.currentContent?.id, state.currentContent?.title, chapterId, state.currentContent?.image);
        } else {
            throw new Error('No data');
        }
    } catch (error) {
        console.error('Error loading chapter:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Gagal memuat chapter</p>
            </div>
        `;
    }
}

function renderReader(data) {
    const container = $('#reader-container');
    const title = data.title || state.currentContent?.title || 'Chapter';
    const images = data.images || data.pages || data.data || [];
    
    // Find chapter navigation
    const chIndex = state.chapters.findIndex(ch => 
        (ch.slug || ch.id || ch.chapterId) === state.currentChapter
    );
    const hasPrev = chIndex < state.chapters.length - 1;
    const hasNext = chIndex > 0;
    
    container.innerHTML = `
        <div class="reader-header">
            <button class="reader-control-btn" onclick="navigateTo('detail', state.currentContent)">
                <i class="fas fa-arrow-left"></i>
            </button>
            <h3 class="reader-title">${title}</h3>
            <div class="reader-controls">
                <button class="reader-control-btn" onclick="toggleFullscreen()">
                    <i class="fas fa-expand"></i>
                </button>
            </div>
        </div>
        
        <div class="reader-pages">
            ${images.map((img, i) => {
                const imgUrl = typeof img === 'string' ? img : (img.url || img.src || img.image || '');
                return `
                    <img 
                        class="reader-page" 
                        src="${IMAGE_PROXY}${encodeURIComponent(imgUrl)}" 
                        alt="Page ${i + 1}"
                        loading="lazy"
                        onerror="this.style.opacity='0.5'"
                    >
                `;
            }).join('')}
        </div>
        
        <div class="reader-navigation">
            <button class="nav-episode-btn" onclick="readPrevChapter()" ${!hasPrev ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i> Chapter Sebelumnya
            </button>
            <button class="nav-episode-btn" onclick="readNextChapter()" ${!hasNext ? 'disabled' : ''}>
                Chapter Selanjutnya <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
}

function readNextChapter() {
    const chIndex = state.chapters.findIndex(ch => 
        (ch.slug || ch.id || ch.chapterId) === state.currentChapter
    );
    if (chIndex > 0) {
        const nextCh = state.chapters[chIndex - 1];
        readChapter(nextCh.slug || nextCh.id || nextCh.chapterId);
    }
}

function readPrevChapter() {
    const chIndex = state.chapters.findIndex(ch => 
        (ch.slug || ch.id || ch.chapterId) === state.currentChapter
    );
    if (chIndex < state.chapters.length - 1) {
        const prevCh = state.chapters[chIndex + 1];
        readChapter(prevCh.slug || prevCh.id || prevCh.chapterId);
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// ============ Search ============
function initSearch() {
    const input = $('#search-input');
    const clearBtn = $('#search-clear');
    const results = $('#search-results');
    
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearBtn.classList.toggle('hidden', !query);
        
        if (state.searchTimeout) clearTimeout(state.searchTimeout);
        
        if (query.length >= 2) {
            state.searchTimeout = setTimeout(() => searchAll(query), 500);
        } else {
            results.classList.add('hidden');
        }
    });
    
    input.addEventListener('focus', () => {
        if (input.value.trim().length >= 2) {
            results.classList.remove('hidden');
        }
    });
    
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.add('hidden');
        results.classList.add('hidden');
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-search')) {
            results.classList.add('hidden');
        }
    });
    
    // Initialize mobile search
    initMobileSearch();
}

// Mobile Search Functions
function initMobileSearch() {
    const input = $('#mobile-search-input');
    if (!input) return;
    
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        if (state.searchTimeout) clearTimeout(state.searchTimeout);
        
        if (query.length >= 2) {
            state.searchTimeout = setTimeout(() => mobileSearchAll(query), 500);
        } else {
            $('#mobile-search-results').innerHTML = '';
        }
    });
}

function openMobileSearch() {
    const overlay = $('#mobile-search-overlay');
    overlay.classList.remove('hidden');
    setTimeout(() => {
        $('#mobile-search-input').focus();
    }, 100);
}

function closeMobileSearch() {
    const overlay = $('#mobile-search-overlay');
    overlay.classList.add('hidden');
    $('#mobile-search-input').value = '';
    $('#mobile-search-results').innerHTML = '';
}

async function mobileSearchAll(query) {
    const results = $('#mobile-search-results');
    results.innerHTML = '<div class="loading" style="padding: 20px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Mencari...</div>';
    
    try {
        const [dramaResults, animeResults, komikResults] = await Promise.allSettled([
            searchDrama(query),
            searchAnime(query),
            searchKomik(query)
        ]);
        
        const allResults = [];
        
        if (dramaResults.status === 'fulfilled' && dramaResults.value) {
            allResults.push(...dramaResults.value.map(d => ({ ...d, searchType: 'drama' })));
        }
        if (animeResults.status === 'fulfilled' && animeResults.value) {
            allResults.push(...animeResults.value.map(a => ({ ...a, searchType: 'anime' })));
        }
        if (komikResults.status === 'fulfilled' && komikResults.value) {
            allResults.push(...komikResults.value.map(k => ({ ...k, searchType: 'komik' })));
        }
        
        renderMobileSearchResults(allResults);
    } catch (error) {
        console.error('Mobile search error:', error);
        results.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Gagal mencari</div>';
    }
}

function renderMobileSearchResults(items) {
    const results = $('#mobile-search-results');
    
    if (items.length === 0) {
        results.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Tidak ada hasil</div>';
        return;
    }
    
    results.innerHTML = items.map(item => {
        let image, title, type, info, id;
        
        switch(item.searchType) {
            case 'drama':
                image = getProxiedImageUrl(item.cover || item.image || item.thumbnail_url || '');
                title = item.title || item.judul;
                type = 'Drama';
                info = `${item.totalEpisode || '??'} Episode`;
                id = item.bookId || item.id;
                break;
            case 'anime':
                image = getProxiedImageUrl(item.poster || item.image || item.thumbnail_url || '');
                title = item.title || item.judul;
                type = 'Anime';
                info = item.status || 'Anime';
                id = item.urlId || item.slug || item.id;
                break;
            case 'komik':
                image = getProxiedImageUrl(item.thumbnail || item.cover || item.image || '');
                title = item.title || item.judul;
                type = item.type || 'Komik';
                info = item.chapter || 'Manga';
                id = item.manga_id || item.slug || item.id;
                break;
        }
        
        return `
            <div class="search-result-item" onclick="closeMobileSearch(); openDetail('${item.searchType}', '${id}');">
                <img class="search-result-img" src="${image}" alt="${title}" onerror="this.src='${PLACEHOLDER_SEARCH}'">
                <div class="search-result-info">
                    <h4>${title}</h4>
                    <p>${info}</p>
                    <span class="search-result-badge">${type}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function searchAll(query) {
    const results = $('#search-results');
    results.classList.remove('hidden');
    results.innerHTML = '<div class="loading" style="padding: 20px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Mencari...</div>';
    
    try {
        const [dramaResults, animeResults, komikResults] = await Promise.allSettled([
            searchDrama(query),
            searchAnime(query),
            searchKomik(query)
        ]);
        
        const allResults = [];
        
        if (dramaResults.status === 'fulfilled' && dramaResults.value) {
            allResults.push(...dramaResults.value.map(d => ({ ...d, searchType: 'drama' })));
        }
        if (animeResults.status === 'fulfilled' && animeResults.value) {
            allResults.push(...animeResults.value.map(a => ({ ...a, searchType: 'anime' })));
        }
        if (komikResults.status === 'fulfilled' && komikResults.value) {
            allResults.push(...komikResults.value.map(k => ({ ...k, searchType: 'komik' })));
        }
        
        renderSearchResults(allResults);
    } catch (error) {
        console.error('Search error:', error);
        results.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Gagal mencari</div>';
    }
}

async function searchDrama(query) {
    const response = await fetch(`${API_BASE}/drama?action=search&keyword=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.status && data.data ? data.data.slice(0, 5) : [];
}

async function searchAnime(query) {
    const response = await fetch(`${API_BASE}/anime?action=search&keyword=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.status && data.data ? data.data.slice(0, 5) : [];
}

async function searchKomik(query) {
    const response = await fetch(`${API_BASE}/komik?action=search&keyword=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.status && data.data ? data.data.slice(0, 5) : [];
}

function renderSearchResults(items) {
    const results = $('#search-results');
    
    if (items.length === 0) {
        results.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Tidak ditemukan hasil</div>';
        return;
    }
    
    results.innerHTML = items.map(item => {
        let image, title, type, info, id;
        
        switch(item.searchType) {
            case 'drama':
                image = getProxiedImageUrl(item.cover || item.image || item.thumbnail_url || '');
                title = item.title || item.judul;
                type = 'Drama';
                info = `${item.totalEpisode || '??'} Episode`;
                id = item.bookId || item.id;
                break;
            case 'anime':
                image = getProxiedImageUrl(item.poster || item.image || item.thumbnail_url || '');
                title = item.title || item.judul;
                type = 'Anime';
                info = item.status || 'Anime';
                id = item.urlId || item.slug || item.id;
                break;
            case 'komik':
                image = getProxiedImageUrl(item.thumbnail || item.cover || item.image || '');
                title = item.title || item.judul;
                type = item.type || 'Komik';
                info = item.chapter || 'Manga';
                id = item.manga_id || item.slug || item.id;
                break;
        }
        
        return `
            <div class="search-result-item" onclick="openDetail('${item.searchType}', '${id}'); $('#search-results').classList.add('hidden');">
                <img class="search-result-img" src="${image}" alt="${title}" onerror="this.src=PLACEHOLDER_SEARCH">
                <div class="search-result-info">
                    <h4>${title}</h4>
                    <p>${info}</p>
                    <span class="search-result-type">${type}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============ Trending ============
async function switchTrendingTab(tab) {
    $$('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    loadTrending(tab);
}

async function loadTrending(type) {
    const list = $('#trending-list');
    list.innerHTML = '<div class="loading" style="padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';
    
    try {
        let items = [];
        
        switch(type) {
            case 'drama':
                const dramaRes = await fetch(`${API_BASE}/drama?action=trending`);
                const dramaData = await dramaRes.json();
                items = (dramaData.data || dramaData || []).slice(0, 10);
                break;
            case 'anime':
                const animeRes = await fetch(`${API_BASE}/anime?action=latest`);
                const animeData = await animeRes.json();
                items = (animeData.data || animeData || []).slice(0, 10);
                break;
            case 'komik':
                const komikRes = await fetch(`${API_BASE}/komik?action=popular`);
                const komikData = await komikRes.json();
                items = (komikData.data || komikData || []).slice(0, 10);
                break;
        }
        
        if (!Array.isArray(items)) items = [];
        renderTrendingList(items, type);
    } catch (error) {
        console.error('Error loading trending:', error);
        list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat trending</p></div>';
    }
}

function renderTrendingList(items, type) {
    const list = $('#trending-list');
    
    if (items.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-fire"></i><p>Tidak ada data trending</p></div>';
        return;
    }
    
    list.innerHTML = items.map((item, index) => {
        let image, title, info, id;
        
        switch(type) {
            case 'drama':
                image = getProxiedImageUrl(item.cover || item.image || item.thumbnail_url || '');
                title = item.title || item.judul;
                info = `${item.totalEpisode || '??'} Episode • Drama China`;
                id = item.bookId || item.id;
                break;
            case 'anime':
                image = getProxiedImageUrl(item.poster || item.image || item.thumbnail_url || '');
                title = item.title || item.judul;
                info = `${item.episode || item.status || 'Ongoing'} • Anime`;
                id = item.urlId || item.slug || item.id;
                break;
            case 'komik':
                image = getProxiedImageUrl(item.thumbnail || item.cover || item.image || '');
                title = item.title || item.judul;
                info = `${item.chapter || 'Ongoing'} • ${item.type || 'Manga'}`;
                id = item.manga_id || item.slug || item.id;
                break;
        }
        
        return `
            <div class="trending-item" onclick="openDetail('${type}', '${id}')">
                <span class="trending-rank">${index + 1}</span>
                <img class="trending-img" src="${image}" alt="${title}" onerror="this.src=PLACEHOLDER_SMALL">
                <div class="trending-info">
                    <h4 class="trending-title">${title}</h4>
                    <p class="trending-meta">${info}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ============ History ============
function initHistory() {
    // Initialize from localStorage
}

function saveToHistory(type, id, title, episode, image) {
    const history = JSON.parse(localStorage.getItem('dado_history') || '[]');
    
    // Remove existing entry if any
    const existingIndex = history.findIndex(h => h.id === id && h.type === type);
    if (existingIndex !== -1) {
        history.splice(existingIndex, 1);
    }
    
    // Add to beginning with image
    history.unshift({
        type,
        id,
        title,
        episode,
        image: image || '',
        timestamp: Date.now()
    });
    
    // Keep only last 50 items
    if (history.length > 50) history.pop();
    
    localStorage.setItem('dado_history', JSON.stringify(history));
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('dado_history') || '[]');
    const grid = $('#history-grid');
    
    if (history.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>Belum ada riwayat</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = history.map(item => {
        const imgUrl = item.image ? getProxiedImageUrl(item.image) : PLACEHOLDER_SMALL;
        return `
            <div class="card" onclick="openDetail('${item.type}', '${item.id}')">
                <div class="card-image">
                    <img src="${imgUrl}" alt="${item.title}" onerror="this.src='${PLACEHOLDER_SMALL}'">
                    <div class="card-overlay">
                        <div class="card-play">
                            <i class="fas fa-${item.type === 'komik' ? 'book-reader' : 'play'}"></i>
                        </div>
                    </div>
                    <span class="card-badge">${item.type}</span>
                </div>
                <h3 class="card-title">${item.title || 'Unknown'}</h3>
                <div class="card-info">
                    <span>${item.type === 'komik' ? 'Chapter' : 'Episode'} ${item.episode || '?'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function clearHistory() {
    if (confirm('Hapus semua riwayat?')) {
        localStorage.removeItem('dado_history');
        loadHistory();
        showToast('Riwayat telah dihapus', 'success');
    }
}

// ============ Filter Buttons ============
function initFilters() {
    // Add click handlers to all filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const filterBar = this.closest('.filter-bar');
            const page = this.closest('.page');
            const filter = this.dataset.filter;
            
            // Update active state
            filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Determine content type from page id
            if (page) {
                const pageId = page.id;
                if (pageId === 'page-drama') {
                    filterContent('drama', filter);
                } else if (pageId === 'page-anime') {
                    filterContent('anime', filter);
                } else if (pageId === 'page-komik') {
                    filterContent('komik', filter);
                }
            }
        });
    });
}

async function filterContent(type, filter) {
    const grid = $(`#${type}-grid`);
    
    // Show loading
    grid.innerHTML = `
        <div class="skeleton-container grid">
            ${Array(6).fill('<div class="skeleton-card"></div>').join('')}
        </div>
    `;
    
    try {
        let data;
        
        if (filter === 'all') {
            // Load all content
            if (type === 'drama') {
                const response = await fetch(`${API_BASE}/drama?action=latest`);
                const result = await response.json();
                data = result.data || result;
            } else if (type === 'anime') {
                const response = await fetch(`${API_BASE}/anime?action=popular`);
                const result = await response.json();
                data = result.data || result;
            } else if (type === 'komik') {
                const response = await fetch(`${API_BASE}/komik?action=popular`);
                const result = await response.json();
                data = result.data || result;
            }
        } else {
            // Filter by genre/status/type
            if (type === 'drama') {
                // Drama doesn't have specific endpoints, use search
                const response = await fetch(`${API_BASE}/drama?action=search&keyword=${encodeURIComponent(filter)}`);
                const result = await response.json();
                data = result.data || result;
            } else if (type === 'anime') {
                // Anime has specific endpoints for ongoing/completed/movie
                if (filter === 'ongoing' || filter === 'completed' || filter === 'movie') {
                    const response = await fetch(`${API_BASE}/anime?action=${filter}`);
                    const result = await response.json();
                    data = result.data || result;
                } else {
                    // Other filters use search
                    const response = await fetch(`${API_BASE}/anime?action=search&keyword=${encodeURIComponent(filter)}`);
                    const result = await response.json();
                    data = result.data || result;
                }
            } else if (type === 'komik') {
                // Komik uses search for type filters
                const response = await fetch(`${API_BASE}/komik?action=search&keyword=${encodeURIComponent(filter)}`);
                const result = await response.json();
                data = result.data || result;
            }
        }
        
        if (Array.isArray(data) && data.length > 0) {
            renderGrid(type, grid, data);
        } else {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>Tidak ada ${type} ditemukan untuk filter "${filter}"</p>
                </div>
            `;
        }
    } catch (error) {
        console.error(`Error filtering ${type}:`, error);
        grid.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Gagal memuat konten. Coba lagi.</p>
            </div>
        `;
    }
}

function renderGrid(type, grid, data) {
    if (type === 'drama') {
        grid.innerHTML = data.map(item => renderDramaCard(item)).join('');
    } else if (type === 'anime') {
        grid.innerHTML = data.map(item => renderAnimeCard(item)).join('');
    } else if (type === 'komik') {
        grid.innerHTML = data.map(item => renderKomikCard(item)).join('');
    }
}

function renderDramaCard(item) {
    const image = item.image || item.cover || item.thumbnail_url || '';
    const title = item.title || item.judul || 'Unknown';
    const id = item.bookId || item.id || item.urlId;
    const episodes = item.totalEpisode || item.episode || '??';
    const imgUrl = image ? getProxiedImageUrl(image) : PLACEHOLDER_SMALL;
    
    return `
        <div class="card" onclick="openDetail('drama', '${id}')">
            <div class="card-image">
                <img src="${imgUrl}" alt="${title}" loading="lazy" onerror="this.src='${PLACEHOLDER_SMALL}'">
                <div class="card-overlay">
                    <div class="card-play">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
                <span class="card-badge">Drama</span>
            </div>
            <h3 class="card-title">${title}</h3>
            <div class="card-info">${episodes} Episode</div>
        </div>
    `;
}

function renderAnimeCard(item) {
    const image = item.image || item.poster || item.thumbnail_url || '';
    const title = item.title || item.judul || 'Unknown';
    const id = item.urlId || item.id || item.animeId;
    const episode = item.episode || item.episodes || 'Ongoing';
    const imgUrl = image ? getProxiedImageUrl(image) : PLACEHOLDER_SMALL;
    
    return `
        <div class="card" onclick="openDetail('anime', '${id}')">
            <div class="card-image">
                <img src="${imgUrl}" alt="${title}" loading="lazy" onerror="this.src='${PLACEHOLDER_SMALL}'">
                <div class="card-overlay">
                    <div class="card-play">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
                <span class="card-badge">Anime</span>
            </div>
            <h3 class="card-title">${title}</h3>
            <div class="card-info">${episode}</div>
        </div>
    `;
}

function renderKomikCard(item) {
    const image = item.thumbnail || item.cover || item.image || '';
    const title = item.title || item.judul || 'Unknown';
    const id = item.slug || item.id || item.manga_id;
    const chapter = item.chapter || item.latestChapter || 'Ongoing';
    const type = item.type || 'Manga';
    const imgUrl = image ? getProxiedImageUrl(image) : PLACEHOLDER_SMALL;
    
    return `
        <div class="card" onclick="openDetail('komik', '${id}')">
            <div class="card-image">
                <img src="${imgUrl}" alt="${title}" loading="lazy" onerror="this.src='${PLACEHOLDER_SMALL}'">
                <div class="card-overlay">
                    <div class="card-play">
                        <i class="fas fa-book-reader"></i>
                    </div>
                </div>
                <span class="card-badge">${type}</span>
            </div>
            <h3 class="card-title">${title}</h3>
            <div class="card-info">${chapter}</div>
        </div>
    `;
}

// ============ Favorites ============
function initFavorites() {
    // Initialize from localStorage
}

function toggleFavorite(type, id, title, image) {
    const favorites = JSON.parse(localStorage.getItem('dado_favorites') || '[]');
    const existingIndex = favorites.findIndex(f => f.id === id && f.type === type);
    
    if (existingIndex !== -1) {
        favorites.splice(existingIndex, 1);
        showToast('Dihapus dari favorit', 'info');
    } else {
        favorites.unshift({ type, id, title, image, timestamp: Date.now() });
        showToast('Ditambahkan ke favorit', 'success');
    }
    
    localStorage.setItem('dado_favorites', JSON.stringify(favorites));
    
    // Update UI if on detail page
    const favBtn = $('.detail-btn-secondary');
    if (favBtn) {
        favBtn.classList.toggle('favorited', existingIndex === -1);
        favBtn.innerHTML = `<i class="fas fa-heart"></i> ${existingIndex === -1 ? 'Hapus Favorit' : 'Tambah Favorit'}`;
    }
}

function isFavorite(type, id) {
    const favorites = JSON.parse(localStorage.getItem('dado_favorites') || '[]');
    return favorites.some(f => f.id === id && f.type === type);
}

function loadFavorites() {
    const favorites = JSON.parse(localStorage.getItem('dado_favorites') || '[]');
    const grid = $('#favorites-grid');
    
    if (favorites.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-heart"></i>
                <p>Belum ada favorit</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = favorites.map(item => `
        <div class="card" onclick="openDetail('${item.type}', '${item.id}')">
            <div class="card-image">
                <img src="${item.image || PLACEHOLDER_SMALL}" alt="${item.title}" onerror="this.src=PLACEHOLDER_SMALL">
                <div class="card-overlay">
                    <div class="card-play">
                        <i class="fas fa-${item.type === 'komik' ? 'book-reader' : 'play'}"></i>
                    </div>
                </div>
                <span class="card-badge">${item.type}</span>
            </div>
            <h3 class="card-title">${item.title || 'Unknown'}</h3>
        </div>
    `).join('');
}

// ============ Continue Watching ============
function initContinueWatching() {
    const history = JSON.parse(localStorage.getItem('dado_history') || '[]');
    const videoHistory = history.filter(h => h.type !== 'komik').slice(0, 5);
    const section = $('#continue-watching-section');
    
    if (videoHistory.length > 0 && section) {
        section.style.display = 'block';
        const container = section.querySelector('.scroll-row') || section.querySelector('.content-grid');
        
        if (container) {
            container.innerHTML = videoHistory.map(item => `
                <div class="card" onclick="openDetail('${item.type}', '${item.id}')">
                    <div class="card-image">
                        <img src="${item.image || PLACEHOLDER_SMALL}" alt="${item.title}" onerror="this.src='${PLACEHOLDER_SMALL}'">
                        <div class="card-overlay">
                            <div class="card-play">
                                <i class="fas fa-play"></i>
                            </div>
                        </div>
                        <div class="card-progress">
                            <div class="card-progress-bar" style="width: ${item.progress || 50}%"></div>
                        </div>
                        <span class="card-badge">${item.type}</span>
                    </div>
                    <h3 class="card-title">${item.title || 'Unknown'}</h3>
                    <p class="card-episode">${item.episode || 'Episode 1'}</p>
                </div>
            `).join('');
        }
    } else if (section) {
        section.style.display = 'none';
    }
}

// ============ Scroll Listener ============
function initScrollListener() {
    const backToTop = $('#back-to-top');
    
    window.addEventListener('scroll', () => {
        backToTop.classList.toggle('hidden', window.scrollY < 300);
    });
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============ Toast Notifications ============
function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============ Service Worker ============
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('ServiceWorker registration failed:', err);
        });
    });
}
