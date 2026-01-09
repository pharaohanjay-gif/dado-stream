/**
 * DADO STREAM - StreamAble Inspired App
 * Complete streaming platform for Drama China, Anime, and Komik
 */

// ============ API Configuration ============
const API_CONFIG = {
    drama: 'https://api.sansekai.my.id/api',
    anime: 'https://www.sankavollerei.com/anime/samehadaku',
    komik: 'https://api-manga-five.vercel.app',
    komikProvider: 'shinigami',
    imageProxy: 'https://wsrv.nl/?url='
};

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
    
    // Hide splash screen
    setTimeout(() => {
        $('#splash-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
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

// ============ Navigation ============
function navigateTo(page, data = null) {
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
        const response = await fetch(`${API_CONFIG.drama}/dramabox/list?page=1`);
        const data = await response.json();
        
        if (data.status && data.result && data.result.drama) {
            const banners = data.result.drama.slice(0, 5);
            renderBanners(banners);
        }
    } catch (error) {
        console.error('Error loading banners:', error);
        // Fallback banner
        $('#hero-slider').innerHTML = `
            <div class="hero-slide">
                <img src="https://via.placeholder.com/1200x400/7d5fff/ffffff?text=DADO+STREAM" alt="DADO STREAM">
                <div class="hero-content">
                    <span class="hero-badge">Welcome</span>
                    <h2 class="hero-title">Selamat Datang di DADO STREAM</h2>
                    <p class="hero-desc">Platform streaming drama China, anime, dan komik terlengkap</p>
                </div>
            </div>
        `;
    }
}

function renderBanners(banners) {
    const slider = $('#hero-slider');
    const indicators = $('#hero-indicators');
    
    slider.innerHTML = banners.map((drama, index) => `
        <div class="hero-slide" onclick="openDetail('drama', '${drama.id}')">
            <img src="${API_CONFIG.imageProxy}${encodeURIComponent(drama.cover || drama.image)}" alt="${drama.title}">
            <div class="hero-content">
                <span class="hero-badge">Drama China</span>
                <h2 class="hero-title">${drama.title}</h2>
                <p class="hero-desc">${drama.synopsis || drama.description || 'Tonton sekarang di DADO STREAM'}</p>
                <div class="hero-meta">
                    <div class="hero-meta-item">
                        <i class="fas fa-film"></i>
                        <span>${drama.totalEpisode || '??'} Episode</span>
                    </div>
                    <div class="hero-meta-item">
                        <i class="fas fa-star"></i>
                        <span>${drama.rating || '8.5'}</span>
                    </div>
                </div>
                <div class="hero-actions">
                    <button class="hero-btn hero-btn-primary" onclick="event.stopPropagation(); watchDrama('${drama.id}')">
                        <i class="fas fa-play"></i> Tonton Sekarang
                    </button>
                    <button class="hero-btn hero-btn-secondary" onclick="event.stopPropagation(); openDetail('drama', '${drama.id}')">
                        <i class="fas fa-info-circle"></i> Detail
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
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
        const response = await fetch(`${API_CONFIG.drama}/dramabox/list?page=1`);
        const data = await response.json();
        
        if (data.status && data.result && data.result.drama) {
            renderCards('#home-drama', data.result.drama.slice(0, 10), 'drama');
        }
    } catch (error) {
        console.error('Error loading home drama:', error);
        $('#home-drama').innerHTML = '<p class="error-message">Gagal memuat drama</p>';
    }
}

async function loadHomeAnime() {
    try {
        const response = await fetch(`${API_CONFIG.anime}/recent?page=1`);
        const data = await response.json();
        
        if (data.status && data.data) {
            renderCards('#home-anime', data.data.slice(0, 10), 'anime');
        }
    } catch (error) {
        console.error('Error loading home anime:', error);
        $('#home-anime').innerHTML = '<p class="error-message">Gagal memuat anime</p>';
    }
}

async function loadHomeKomik() {
    try {
        const response = await fetch(`${API_CONFIG.komik}/${API_CONFIG.komikProvider}/popular`);
        const data = await response.json();
        
        if (data.status && data.data) {
            renderCards('#home-komik', data.data.slice(0, 10), 'komik');
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
        const response = await fetch(`${API_CONFIG.drama}/dramabox/list?page=${state.dramaPage}`);
        const data = await response.json();
        
        if (data.status && data.result && data.result.drama) {
            renderCards('#drama-grid', data.result.drama, 'drama', true);
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
        const response = await fetch(`${API_CONFIG.drama}/dramabox/list?page=${state.dramaPage}`);
        const data = await response.json();
        
        if (data.status && data.result && data.result.drama) {
            const grid = $('#drama-grid');
            data.result.drama.forEach(drama => {
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
        const response = await fetch(`${API_CONFIG.anime}/recent?page=${state.animePage}`);
        const data = await response.json();
        
        if (data.status && data.data) {
            renderCards('#anime-grid', data.data, 'anime', true);
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
        const response = await fetch(`${API_CONFIG.anime}/recent?page=${state.animePage}`);
        const data = await response.json();
        
        if (data.status && data.data) {
            const grid = $('#anime-grid');
            data.data.forEach(anime => {
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
        const response = await fetch(`${API_CONFIG.komik}/${API_CONFIG.komikProvider}/popular`);
        const data = await response.json();
        
        if (data.status && data.data) {
            renderCards('#komik-grid', data.data, 'komik', true);
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
        const response = await fetch(`${API_CONFIG.komik}/${API_CONFIG.komikProvider}/popular?page=${state.komikPage}`);
        const data = await response.json();
        
        if (data.status && data.data) {
            const grid = $('#komik-grid');
            data.data.forEach(komik => {
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
    container.innerHTML = items.map(item => createCard(item, type)).join('');
}

function createCard(item, type) {
    let image, title, badge, info, id;
    
    switch(type) {
        case 'drama':
            image = API_CONFIG.imageProxy + encodeURIComponent(item.cover || item.image || '');
            title = item.title;
            badge = 'Drama';
            info = `${item.totalEpisode || '??'} Episode`;
            id = item.id;
            break;
        case 'anime':
            image = API_CONFIG.imageProxy + encodeURIComponent(item.poster || item.image || '');
            title = item.title;
            badge = item.type || 'Anime';
            info = item.episode || item.status || 'Ongoing';
            id = item.slug || item.id;
            break;
        case 'komik':
            image = API_CONFIG.imageProxy + encodeURIComponent(item.thumbnail || item.cover || item.image || '');
            title = item.title;
            badge = item.type || 'Manga';
            info = item.chapter || item.status || 'Ongoing';
            id = item.slug || item.id;
            break;
    }
    
    return `
        <div class="card" onclick="openDetail('${type}', '${id}')">
            <div class="card-image">
                <img src="${image}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/150x225/1a1a1a/666?text=No+Image'">
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
    state.currentContent = { type, id };
    navigateTo('detail');
    loadDetail(type, id);
}

async function loadDetail(type, id) {
    const container = $('#detail-container');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';
    
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
        }
    } catch (error) {
        console.error('Error loading detail:', error);
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat detail</p></div>';
    }
}

async function fetchDramaDetail(id) {
    const response = await fetch(`${API_CONFIG.drama}/dramabox/detail?id=${id}`);
    const data = await response.json();
    if (data.status && data.result) {
        state.episodes = data.result.episodes || [];
        return data.result;
    }
    return null;
}

async function fetchAnimeDetail(id) {
    const response = await fetch(`${API_CONFIG.anime}/detail/${id}`);
    const data = await response.json();
    if (data.status && data.data) {
        // Load episodes
        const epResponse = await fetch(`${API_CONFIG.anime}/episode/${id}`);
        const epData = await epResponse.json();
        state.episodes = epData.status && epData.data ? epData.data : [];
        return data.data;
    }
    return null;
}

async function fetchKomikDetail(id) {
    const response = await fetch(`${API_CONFIG.komik}/${API_CONFIG.komikProvider}/detail/${id}`);
    const data = await response.json();
    if (data.status && data.data) {
        state.chapters = data.data.chapters || [];
        return data.data;
    }
    return null;
}

function renderDetail(type, data) {
    const container = $('#detail-container');
    const isFavorited = isFavorite(type, state.currentContent.id);
    
    let image, title, description, totalEp, rating, genres, status;
    
    switch(type) {
        case 'drama':
            image = API_CONFIG.imageProxy + encodeURIComponent(data.cover || data.image || '');
            title = data.title;
            description = data.synopsis || data.description || 'Tidak ada deskripsi';
            totalEp = data.totalEpisode || '??';
            rating = data.rating || '8.5';
            genres = data.genres || ['Drama', 'China'];
            status = data.status || 'Ongoing';
            break;
        case 'anime':
            image = API_CONFIG.imageProxy + encodeURIComponent(data.poster || data.image || '');
            title = data.title;
            description = data.synopsis || data.description || 'Tidak ada deskripsi';
            totalEp = data.totalEpisode || data.episodes?.length || '??';
            rating = data.rating || data.score || '8.0';
            genres = data.genres || data.genre || ['Anime'];
            status = data.status || 'Ongoing';
            break;
        case 'komik':
            image = API_CONFIG.imageProxy + encodeURIComponent(data.thumbnail || data.cover || data.image || '');
            title = data.title;
            description = data.synopsis || data.description || 'Tidak ada deskripsi';
            totalEp = data.chapters?.length || state.chapters.length || '??';
            rating = data.rating || '8.0';
            genres = data.genres || data.genre || [data.type || 'Manga'];
            status = data.status || 'Ongoing';
            break;
    }
    
    const genresList = Array.isArray(genres) ? genres : [genres];
    
    container.innerHTML = `
        <div class="detail-header">
            <img src="${image}" alt="${title}" class="detail-backdrop">
            <div class="detail-backdrop-overlay"></div>
            <div class="detail-content">
                <div class="detail-poster">
                    <img src="${image}" alt="${title}">
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
                        <button class="detail-btn detail-btn-secondary ${isFavorited ? 'favorited' : ''}" onclick="toggleFavorite('${type}', '${state.currentContent.id}', '${title}', '${image}')">
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
                const epNum = ep.episode || ep.eps || index + 1;
                const epId = ep.id || ep.slug || ep.episodeId;
                return `
                    <button class="episode-btn" onclick="playEpisode('${type}', '${epId}', ${epNum})">
                        Episode ${epNum}
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
                const chTitle = ch.title || ch.chapter || ch.name;
                const chId = ch.slug || ch.id || ch.chapterId;
                return `
                    <div class="chapter-item" onclick="readChapter('${chId}')">
                        <span class="chapter-title">${chTitle}</span>
                        <span class="chapter-date">${ch.date || ch.uploadDate || ''}</span>
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
        const epId = firstEp.id || firstEp.slug || firstEp.episodeId;
        playEpisode(type, epId, 1);
    } else {
        showToast('Tidak ada episode tersedia', 'error');
    }
}

async function watchDrama(id) {
    // Fetch drama detail first to get episodes
    try {
        const response = await fetch(`${API_CONFIG.drama}/dramabox/detail?id=${id}`);
        const data = await response.json();
        if (data.status && data.result && data.result.episodes && data.result.episodes.length > 0) {
            state.currentContent = { type: 'drama', id, title: data.result.title };
            state.episodes = data.result.episodes;
            const firstEp = state.episodes[0];
            playEpisode('drama', firstEp.id || firstEp.episodeId, 1);
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
            const response = await fetch(`${API_CONFIG.drama}/dramabox/watch?id=${episodeId}`);
            const data = await response.json();
            if (data.status && data.result) {
                videoUrl = data.result.video || data.result.url || data.result.stream;
                servers = data.result.servers || [];
            }
        } else if (type === 'anime') {
            const response = await fetch(`${API_CONFIG.anime}/watch/${episodeId}`);
            const data = await response.json();
            if (data.status && data.data) {
                // Get streaming URL from available sources
                const sources = data.data.sources || data.data.stream || [];
                if (sources.length > 0) {
                    videoUrl = sources[0].url || sources[0].file || sources[0].src;
                }
                servers = data.data.servers || [];
            }
        }
        
        if (videoUrl) {
            renderWatchPage(type, videoUrl, episodeNum, servers);
            saveToHistory(type, state.currentContent.id, state.currentContent.title, episodeNum);
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
        (ep.id || ep.slug || ep.episodeId) === state.currentEpisode.id
    );
    const hasPrev = epIndex > 0;
    const hasNext = epIndex < state.episodes.length - 1;
    
    container.innerHTML = `
        <div class="video-player-wrapper">
            <iframe 
                class="video-player" 
                src="${videoUrl}" 
                frameborder="0" 
                allowfullscreen
                allow="autoplay; fullscreen; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-presentation"
            ></iframe>
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
                <h3 class="server-title"><i class="fas fa-server"></i> Pilih Server</h3>
                <div class="server-list">
                    ${servers.map((server, i) => `
                        <button class="server-btn ${i === 0 ? 'active' : ''}" onclick="changeServer('${server.url || server.file}', this)">
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
                    const epNum = ep.episode || ep.eps || index + 1;
                    const epId = ep.id || ep.slug || ep.episodeId;
                    const isWatching = epId === state.currentEpisode.id;
                    return `
                        <button class="episode-btn ${isWatching ? 'watching' : ''}" onclick="playEpisode('${type}', '${epId}', ${epNum})">
                            Episode ${epNum}
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function playNextEpisode(type) {
    const epIndex = state.episodes.findIndex(ep => 
        (ep.id || ep.slug || ep.episodeId) === state.currentEpisode.id
    );
    if (epIndex < state.episodes.length - 1) {
        const nextEp = state.episodes[epIndex + 1];
        const epId = nextEp.id || nextEp.slug || nextEp.episodeId;
        const epNum = nextEp.episode || nextEp.eps || epIndex + 2;
        playEpisode(type, epId, epNum);
    }
}

function playPrevEpisode(type) {
    const epIndex = state.episodes.findIndex(ep => 
        (ep.id || ep.slug || ep.episodeId) === state.currentEpisode.id
    );
    if (epIndex > 0) {
        const prevEp = state.episodes[epIndex - 1];
        const epId = prevEp.id || prevEp.slug || prevEp.episodeId;
        const epNum = prevEp.episode || prevEp.eps || epIndex;
        playEpisode(type, epId, epNum);
    }
}

function changeServer(url, btn) {
    $$('.server-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('.video-player').src = url;
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
        const response = await fetch(`${API_CONFIG.komik}/${API_CONFIG.komikProvider}/chapter/${chapterId}`);
        const data = await response.json();
        
        if (data.status && data.data) {
            renderReader(data.data);
            saveToHistory('komik', state.currentContent?.id, state.currentContent?.title, chapterId);
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
    const images = data.images || data.pages || [];
    
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
            ${images.map((img, i) => `
                <img 
                    class="reader-page" 
                    src="${API_CONFIG.imageProxy}${encodeURIComponent(img.url || img.src || img)}" 
                    alt="Page ${i + 1}"
                    loading="lazy"
                    onerror="this.src='https://via.placeholder.com/800x1200/1a1a1a/666?text=Page+${i + 1}'"
                >
            `).join('')}
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
    const response = await fetch(`${API_CONFIG.drama}/dramabox/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.status && data.result ? data.result.slice(0, 5) : [];
}

async function searchAnime(query) {
    const response = await fetch(`${API_CONFIG.anime}/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.status && data.data ? data.data.slice(0, 5) : [];
}

async function searchKomik(query) {
    const response = await fetch(`${API_CONFIG.komik}/${API_CONFIG.komikProvider}/search?q=${encodeURIComponent(query)}`);
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
                image = API_CONFIG.imageProxy + encodeURIComponent(item.cover || item.image || '');
                title = item.title;
                type = 'Drama';
                info = `${item.totalEpisode || '??'} Episode`;
                id = item.id;
                break;
            case 'anime':
                image = API_CONFIG.imageProxy + encodeURIComponent(item.poster || item.image || '');
                title = item.title;
                type = 'Anime';
                info = item.status || 'Anime';
                id = item.slug || item.id;
                break;
            case 'komik':
                image = API_CONFIG.imageProxy + encodeURIComponent(item.thumbnail || item.cover || item.image || '');
                title = item.title;
                type = item.type || 'Komik';
                info = item.chapter || 'Manga';
                id = item.slug || item.id;
                break;
        }
        
        return `
            <div class="search-result-item" onclick="openDetail('${item.searchType}', '${id}'); $('#search-results').classList.add('hidden');">
                <img class="search-result-img" src="${image}" alt="${title}" onerror="this.src='https://via.placeholder.com/50x70/1a1a1a/666?text=No'">
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
                const dramaRes = await fetch(`${API_CONFIG.drama}/dramabox/list?page=1`);
                const dramaData = await dramaRes.json();
                items = dramaData.status && dramaData.result?.drama ? dramaData.result.drama.slice(0, 10) : [];
                break;
            case 'anime':
                const animeRes = await fetch(`${API_CONFIG.anime}/recent?page=1`);
                const animeData = await animeRes.json();
                items = animeData.status && animeData.data ? animeData.data.slice(0, 10) : [];
                break;
            case 'komik':
                const komikRes = await fetch(`${API_CONFIG.komik}/${API_CONFIG.komikProvider}/popular`);
                const komikData = await komikRes.json();
                items = komikData.status && komikData.data ? komikData.data.slice(0, 10) : [];
                break;
        }
        
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
                image = API_CONFIG.imageProxy + encodeURIComponent(item.cover || item.image || '');
                title = item.title;
                info = `${item.totalEpisode || '??'} Episode • Drama China`;
                id = item.id;
                break;
            case 'anime':
                image = API_CONFIG.imageProxy + encodeURIComponent(item.poster || item.image || '');
                title = item.title;
                info = `${item.episode || item.status || 'Ongoing'} • Anime`;
                id = item.slug || item.id;
                break;
            case 'komik':
                image = API_CONFIG.imageProxy + encodeURIComponent(item.thumbnail || item.cover || item.image || '');
                title = item.title;
                info = `${item.chapter || 'Ongoing'} • ${item.type || 'Manga'}`;
                id = item.slug || item.id;
                break;
        }
        
        return `
            <div class="trending-item" onclick="openDetail('${type}', '${id}')">
                <span class="trending-rank">${index + 1}</span>
                <img class="trending-img" src="${image}" alt="${title}" onerror="this.src='https://via.placeholder.com/70x100/1a1a1a/666?text=${index + 1}'">
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

function saveToHistory(type, id, title, episode) {
    const history = JSON.parse(localStorage.getItem('dado_history') || '[]');
    
    // Remove existing entry if any
    const existingIndex = history.findIndex(h => h.id === id && h.type === type);
    if (existingIndex !== -1) {
        history.splice(existingIndex, 1);
    }
    
    // Add to beginning
    history.unshift({
        type,
        id,
        title,
        episode,
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
    
    grid.innerHTML = history.map(item => `
        <div class="card" onclick="openDetail('${item.type}', '${item.id}')">
            <div class="card-image">
                <img src="https://via.placeholder.com/150x225/1a1a1a/7d5fff?text=${encodeURIComponent(item.title?.substring(0, 10) || 'Content')}" alt="${item.title}">
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
    `).join('');
}

function clearHistory() {
    if (confirm('Hapus semua riwayat?')) {
        localStorage.removeItem('dado_history');
        loadHistory();
        showToast('Riwayat telah dihapus', 'success');
    }
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
                <img src="${item.image || 'https://via.placeholder.com/150x225/1a1a1a/7d5fff?text=' + encodeURIComponent(item.title?.substring(0, 10) || 'Fav')}" alt="${item.title}" onerror="this.src='https://via.placeholder.com/150x225/1a1a1a/7d5fff?text=Fav'">
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
    
    if (videoHistory.length > 0) {
        $('#continue-watching-section').style.display = 'block';
        // Render continue watching cards
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
