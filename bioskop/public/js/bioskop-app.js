// ==========================================================================
// DADO STREAM BIOSKOP - Main Application JavaScript
// Using Rebahan API (zeldvorik.ru/apiv3)
// ==========================================================================

// PRODUCTION MODE - Disable all console output
(function() {
    const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
    if (isProduction) {
        const noop = function() {};
        console.log = noop;
        console.debug = noop;
        console.info = noop;
        console.warn = noop;
        // Keep console.error for critical issues
    }
})();

// API Configuration
const REBAHAN_API = 'https://zeldvorik.ru/apiv3/api.php';
const BOKEP_API = 'https://bokep-api.vercel.app/api';

// ==========================================================================
// Utility Functions for Adult Video Player
// ==========================================================================

// Convert video URL to embed format for iframe embedding
function convertToEmbedUrl(url) {
    // Kagefiles: convert /watch or direct links to /embed
    if (url.includes('kagefiles.com')) {
        // Extract file ID from various URL formats
        // https://kagefiles.com/qSB8fqNNDLQGHMN/watch -> https://kagefiles.com/embed/qSB8fqNNDLQGHMN
        // https://kagefiles.com/qSB8fqNNDLQGHMN -> https://kagefiles.com/embed/qSB8fqNNDLQGHMN
        const watchMatch = url.match(/kagefiles\.com\/([a-zA-Z0-9]+)\/watch/);
        if (watchMatch) {
            return `https://kagefiles.com/embed/${watchMatch[1]}`;
        }
        const directMatch = url.match(/kagefiles\.com\/([a-zA-Z0-9]+)$/);
        if (directMatch) {
            return `https://kagefiles.com/embed/${directMatch[1]}`;
        }
        // Already embed format
        if (url.includes('/embed/')) {
            return url;
        }
    }
    
    // Imaxstreams.com: convert /download/ to /embed/ for iframe embedding
    if (url.includes('imaxstreams.com')) {
        // https://imaxstreams.com/download/wbm8ruhw4vj1 -> https://imaxstreams.com/embed/wbm8ruhw4vj1
        const match = url.match(/imaxstreams\.com\/download\/([a-zA-Z0-9]+)/);
        if (match) {
            return `https://imaxstreams.com/embed/${match[1]}`;
        }
        // Already embed format
        if (url.includes('/embed/')) {
            return url;
        }
    }
    
    // Imaxstreams.net: No embed format available, keep original (will show error)
    // User should use other servers
    
    // Default: return as-is
    return url;
}

// State Management
const state = {
    currentPage: 'home',
    currentContent: null,
    theme: localStorage.getItem('bioskop_theme') || 'dark',
    pages: {
        'indonesian-movies': 1,
        'western-tv': 1,
        'indo-dub': 1,
        'adult-comedy': 1
    },
    hasMore: {
        'indonesian-movies': true,
        'western-tv': true,
        'indo-dub': true,
        'adult-comedy': true
    },
    cache: {},
    history: JSON.parse(localStorage.getItem('bioskop_history') || '[]'),
    favorites: JSON.parse(localStorage.getItem('bioskop_favorites') || '[]'),
    bannerIndex: 0,
    bannerInterval: null,
    navigationStack: ['home'] // Navigation history for proper back button
};

// App Version for cache busting
const APP_VERSION = Date.now();

// ==========================================================================
// Initialization
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Initialize theme
    initTheme();
    
    // Setup event listeners
    setupEventListeners();
    
    // Handle URL routing
    handleUrlRouting();
    
    // Load initial data with error handling
    try {
        await loadHomeData();
    } catch (error) {
        console.error('Error loading home data:', error);
    }
    
    // Show app immediately (no splash screen)
    const app = document.getElementById('app');
    if (app) {
        app.classList.remove('hidden');
    }
}

// ==========================================================================
// Theme Management
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
    if (icon) {
        icon.className = state.theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// ==========================================================================
// Event Listeners
// ==========================================================================

function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            const clearBtn = document.getElementById('search-clear');
            if (clearBtn) {
                clearBtn.classList.toggle('hidden', !query);
            }
            
            if (query.length >= 2) {
                searchTimeout = setTimeout(() => performSearch(query), 500);
            } else {
                hideSearchResults();
            }
        });
        
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = e.target.value.trim();
                if (query.length >= 2) {
                    performSearch(query, true);
                }
            }
        });
    }
    
    // Search clear button
    const searchClear = document.getElementById('search-clear');
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            const input = document.getElementById('search-input');
            if (input) input.value = '';
            searchClear.classList.add('hidden');
            hideSearchResults();
        });
    }
    
    // Mobile search
    const mobileSearchInput = document.getElementById('mobile-search-input');
    if (mobileSearchInput) {
        let mobileSearchTimeout;
        mobileSearchInput.addEventListener('input', (e) => {
            clearTimeout(mobileSearchTimeout);
            const query = e.target.value.trim();
            
            if (query.length >= 2) {
                mobileSearchTimeout = setTimeout(() => performMobileSearch(query), 500);
            } else {
                document.getElementById('mobile-search-results').innerHTML = '';
            }
        });
    }
    
    // Back to top button
    window.addEventListener('scroll', () => {
        const btn = document.getElementById('back-to-top');
        if (btn) {
            btn.classList.toggle('hidden', window.scrollY < 300);
        }
    });
    
    // Click outside to close search results
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-search')) {
            hideSearchResults();
        }
    });
}

// ==========================================================================
// API Functions
// ==========================================================================

async function fetchAPI(action, params = {}) {
    try {
        let url = `${REBAHAN_API}?action=${action}`;
        
        Object.entries(params).forEach(([key, value]) => {
            url += `&${key}=${encodeURIComponent(value)}`;
        });
        
        console.log('Fetching:', url);
        
        // Add timeout of 15 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.error('HTTP Error:', response.status);
            return null;
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log('API Success:', action, data.items?.length || 0, 'items');
            return data;
        } else {
            console.error('API Error:', data.error);
            return null;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('Fetch timeout:', action);
        } else {
            console.error('Fetch Error:', error);
        }
        return null;
    }
}

// ==========================================================================
// Load Data Functions
// ==========================================================================

// Cache untuk menghindari request duplikat
const apiCache = {};

async function loadHomeData() {
    console.log('Loading home data...');
    
    try {
        // Pre-fetch indonesian-movies sekali saja (untuk banner, featured, dan section)
        const indonesianMoviesData = await fetchAPI('indonesian-movies', { page: 1 });
        if (indonesianMoviesData) {
            apiCache['indonesian-movies-1'] = indonesianMoviesData;
        }
        
        // Load semua section secara parallel dengan error handling
        // Order: Film Indonesia, Film Dewasa (Bokep), Indo Dub, Western TV (paling bawah)
        await Promise.all([
            loadMultiFeatured().catch(e => console.error('Multi featured error:', e)),
            loadHomeSection('indonesian-movies', 'home-film-indonesia', indonesianMoviesData).catch(e => console.error('Indo movies error:', e)),
            loadAdultContentSection('home-adult-comedy').catch(e => console.error('Adult error:', e)),
            loadHomeSection('indo-dub', 'home-indo-dub').catch(e => console.error('Indo dub error:', e)),
            loadHomeSection('western-tv', 'home-western-tv').catch(e => console.error('Western TV error:', e)),
            loadBanners(indonesianMoviesData).catch(e => console.error('Banners error:', e))
        ]);
        
        // Load continue watching
        loadContinueWatching();
        console.log('Home data loaded successfully');
    } catch (error) {
        console.error('Failed to load home data:', error);
    }
}

// Load adult content from Bokep API
async function loadAdultContentSection(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    try {
        const response = await fetch(`${BOKEP_API}/videos?limit=10`);
        const data = await response.json();
        
        if (data.status && data.results && data.results.length > 0) {
            container.innerHTML = data.results.map(item => createAdultContentCard(item)).join('');
        } else {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Tidak ada konten tersedia</p>';
        }
    } catch (error) {
        console.error('Error loading adult content:', error);
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Gagal memuat konten</p>';
    }
}

// Default adult poster - stylish placeholder
const ADULT_POSTER_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="50%" style="stop-color:#16213e"/>
      <stop offset="100%" style="stop-color:#0f0f23"/>
    </linearGradient>
    <linearGradient id="badge" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#ff4444"/>
      <stop offset="100%" style="stop-color:#cc0000"/>
    </linearGradient>
  </defs>
  <rect fill="url(#bg)" width="300" height="450"/>
  <circle cx="150" cy="180" r="50" fill="none" stroke="#ff4444" stroke-width="3" opacity="0.5"/>
  <polygon points="140,160 140,200 175,180" fill="#ff4444" opacity="0.8"/>
  <rect x="100" y="260" width="100" height="35" rx="5" fill="url(#badge)"/>
  <text x="150" y="284" fill="white" text-anchor="middle" font-size="18" font-weight="bold" font-family="Arial">18+</text>
  <text x="150" y="330" fill="#666" text-anchor="middle" font-size="14" font-family="Arial">Film Dewasa</text>
</svg>`);

// Create card for adult content from Bokep API
function createAdultContentCard(item) {
    // Check if poster is the default LK21 placeholder
    const isDefaultPoster = !item.poster || item.poster.includes('layarkaca21') || item.poster.includes('L-K-2-1');
    const posterSrc = isDefaultPoster ? ADULT_POSTER_PLACEHOLDER : item.poster;
    
    return `
        <div class="content-card" onclick="showAdultDetail('${item.slug}')">
            <img src="${posterSrc}" alt="${item.title}" class="card-poster" loading="lazy" onerror="this.src='${ADULT_POSTER_PLACEHOLDER}'">
            <div class="card-badge" style="background: linear-gradient(135deg, #ff4444, #cc0000);">18+</div>
            <div class="card-overlay">
                <div class="card-play-btn"><i class="fas fa-play"></i></div>
            </div>
            <div class="card-info">
                <h4 class="card-title">${(item.title || 'Video').replace('Bokep Indo – ', '').replace('Bokep Indo - ', '')}</h4>
                <div class="card-meta">
                    <span><i class="fas fa-play-circle" style="color:#ff4444"></i> Dadok Server</span>
                </div>
            </div>
        </div>
    `;
}

async function loadBanners(cachedData = null) {
    const data = cachedData || await fetchAPI('indonesian-movies', { page: 1 });
    if (data && data.items) {
        const bannerItems = data.items.slice(0, 5);
        renderBanners(bannerItems);
        startBannerAutoplay();
    }
}

function renderBanners(items) {
    const slider = document.getElementById('hero-slider');
    const indicators = document.getElementById('hero-indicators');
    
    if (!slider || !indicators) return;
    
    slider.innerHTML = items.map((item, index) => `
        <div class="hero-slide" style="background-image: url('${item.poster}')" onclick="showDetail('${item.detailPath}')">
            <div class="hero-content">
                <span class="hero-badge">${item.type === 'tv' ? 'SERIES' : 'FILM'}</span>
                <h1 class="hero-title">${item.title}</h1>
                <div class="hero-meta">
                    <span class="rating"><i class="fas fa-star"></i> ${item.rating}</span>
                    <span><i class="fas fa-calendar"></i> ${item.year}</span>
                    <span><i class="fas fa-tag"></i> ${item.genre.split(',')[0]}</span>
                </div>
                <p class="hero-description">${item.description || 'Deskripsi tidak tersedia.'}</p>
                <div class="hero-buttons">
                    <button class="hero-btn primary" onclick="event.stopPropagation(); showDetail('${item.detailPath}')">
                        <i class="fas fa-play"></i> Tonton Sekarang
                    </button>
                    <button class="hero-btn secondary" onclick="event.stopPropagation(); addToFavorites('${item.detailPath}', '${item.title}', '${item.poster}')">
                        <i class="fas fa-plus"></i> Daftar Saya
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    indicators.innerHTML = items.map((_, index) => `
        <div class="hero-indicator ${index === 0 ? 'active' : ''}" onclick="goToBanner(${index})"></div>
    `).join('');
}

function startBannerAutoplay() {
    if (state.bannerInterval) clearInterval(state.bannerInterval);
    state.bannerInterval = setInterval(() => {
        nextBanner();
    }, 6000);
}

function nextBanner() {
    const slider = document.getElementById('hero-slider');
    const indicators = document.querySelectorAll('.hero-indicator');
    const totalSlides = indicators.length;
    
    if (totalSlides === 0) return;
    
    state.bannerIndex = (state.bannerIndex + 1) % totalSlides;
    updateBanner();
}

function prevBanner() {
    const indicators = document.querySelectorAll('.hero-indicator');
    const totalSlides = indicators.length;
    
    if (totalSlides === 0) return;
    
    state.bannerIndex = (state.bannerIndex - 1 + totalSlides) % totalSlides;
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
    
    if (slider) {
        slider.style.transform = `translateX(-${state.bannerIndex * 100}%)`;
    }
    
    indicators.forEach((ind, i) => {
        ind.classList.toggle('active', i === state.bannerIndex);
    });
}

// Load multi-category featured section (Film Indo, Bokep, Western, Sub Indo)
async function loadMultiFeatured() {
    const container = document.getElementById('featured-film');
    if (!container) {
        console.error('Featured film container not found');
        return;
    }
    
    console.log('Loading bokep viral & trending...');
    
    try {
        // Fetch bokep videos - get more to show variety
        const adultResponse = await fetch(`${BOKEP_API}/videos?limit=8`).then(r => r.json()).catch(() => null);
        
        if (adultResponse?.results?.length > 0) {
            const featuredItems = adultResponse.results.slice(0, 4).map((adult, index) => ({
                title: (adult.title || 'Video').replace('Bokep Indo – ', '').replace('Bokep Indo - ', ''),
                poster: adult.poster,
                slug: adult.slug,
                isAdult: true,
                category: index === 0 ? '🔥 Viral' : (index === 1 ? '📈 Trending' : (index === 2 ? '⭐ Populer' : '✨ Terbaru')),
                categoryIcon: index === 0 ? 'fa-fire' : (index === 1 ? 'fa-chart-line' : (index === 2 ? 'fa-star' : 'fa-sparkles')),
                categoryColor: index === 0 ? '#ff4444' : (index === 1 ? '#ff6b35' : (index === 2 ? '#ffd700' : '#ff69b4'))
            }));
            
            container.innerHTML = `
                <div class="multi-featured-grid">
                    ${featuredItems.map(item => {
                        const onclick = `showAdultDetail('${item.slug}')`;
                        
                        return `
                            <div class="featured-card" onclick="${onclick}" style="border-left: 3px solid ${item.categoryColor};">
                                <img src="${item.poster}" alt="${item.title}" class="featured-poster" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23222%22 width=%22300%22 height=%22450%22/></svg>'">
                                <div class="featured-info">
                                    <div class="featured-category" style="color: ${item.categoryColor};">
                                        <i class="fas ${item.categoryIcon}"></i> ${item.category}
                                    </div>
                                    <h3 class="featured-title">${item.title}</h3>
                                    <div class="featured-meta">
                                        <span style="color: #ff4444;"><i class="fas fa-fire-alt"></i> 18+</span>
                                        <span><i class="fas fa-tag"></i> Dewasa</span>
                                    </div>
                                    <button class="featured-btn" style="background: ${item.categoryColor};" onclick="event.stopPropagation(); ${onclick}">
                                        <i class="fas fa-play"></i> Tonton
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
            console.log('Bokep viral & trending loaded:', featuredItems.length, 'items');
        } else {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">Gagal memuat data viral & trending</p>';
        }
    } catch (error) {
        console.error('Failed to load bokep viral & trending:', error);
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">Gagal memuat data viral & trending</p>';
    }
}

async function loadFeaturedFilm(cachedData = null) {
    const container = document.getElementById('featured-film');
    if (!container) {
        console.error('Featured film container not found');
        return;
    }
    
    console.log('Loading featured film...');
    
    // Use cached data or fetch
    const data = cachedData || await fetchAPI('indonesian-movies', { page: 1 });
    
    if (data && data.items && data.items.length > 0) {
        // Get the first (latest) item as featured
        const item = data.items[0];
        const genres = item.genre ? item.genre.split(',').slice(0, 2).join(', ') : 'Drama';
        
        container.innerHTML = `
            <div class="algojo-card-inner" onclick="showDetail('${item.detailPath}')">
                <img src="${item.poster}" alt="${item.title}" class="algojo-poster" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23222%22 width=%22300%22 height=%22450%22/></svg>'">
                <div class="algojo-info">
                    <h3 class="algojo-title">${item.title}</h3>
                    <div class="algojo-meta">
                        <span><i class="fas fa-star" style="color: var(--primary);"></i> ${item.rating || '-'}</span>
                        <span><i class="fas fa-calendar"></i> ${item.year || '-'}</span>
                        <span><i class="fas fa-globe"></i> Indonesia</span>
                        <span><i class="fas fa-tag"></i> ${genres}</span>
                    </div>
                    <div class="algojo-episode-badge">
                        <i class="fas fa-film"></i>
                        Film Terbaru!
                    </div>
                    <p class="algojo-description">${item.description || 'Film Indonesia terbaru dengan kualitas HD. Tonton sekarang!'}</p>
                    <button class="algojo-btn" onclick="event.stopPropagation(); showDetail('${item.detailPath}')">
                        <i class="fas fa-play"></i>
                        Tonton Sekarang
                    </button>
                </div>
            </div>
        `;
        console.log('Featured film loaded:', item.title);
    } else {
        console.error('Failed to load featured film');
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">Gagal memuat data film terbaru</p>';
    }
}

async function loadHomeSection(action, containerId, cachedData = null) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Container not found:', containerId);
        return;
    }
    
    console.log('Loading section:', action, containerId);
    
    const data = cachedData || await fetchAPI(action, { page: 1 });
    if (data && data.items && data.items.length > 0) {
        // Khusus untuk adult-comedy: cek apakah sudah verifikasi
        if (action === 'adult-comedy' && !isAdultVerified()) {
            // Tampilkan card terkunci
            renderLockedContentScroll(container, data.items);
        } else {
            renderContentScroll(container, data.items);
        }
    } else {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Tidak ada konten tersedia</p>';
    }
}

// Render scroll dengan card terkunci
function renderLockedContentScroll(container, items) {
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Tidak ada konten</p>';
        return;
    }
    container.innerHTML = items.map(item => createLockedContentCard(item)).join('');
}

function renderContentScroll(container, items) {
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Tidak ada konten</p>';
        return;
    }
    container.innerHTML = items.map(item => createContentCard(item)).join('');
}

function createContentCard(item) {
    const genre = item.genre ? item.genre.split(',')[0] : 'Drama';
    return `
        <div class="content-card" onclick="showDetail('${item.detailPath}')">
            <img src="${item.poster}" alt="${item.title}" class="card-poster" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23222%22 width=%22300%22 height=%22450%22/></svg>'">
            <div class="card-badge">${item.type === 'tv' ? 'SERIES' : 'FILM'}</div>
            <div class="card-rating"><i class="fas fa-star"></i> ${item.rating || '-'}</div>
            <div class="card-overlay">
                <div class="card-play-btn"><i class="fas fa-play"></i></div>
            </div>
            <div class="card-info">
                <h4 class="card-title">${item.title}</h4>
                <div class="card-meta">
                    <span>${item.year || '-'}</span>
                    <span>${genre}</span>
                </div>
            </div>
        </div>
    `;
}

// Card konten dewasa yang dikunci (blur + lock icon)
function createLockedContentCard(item) {
    const genre = item.genre ? item.genre.split(',')[0] : 'Drama';
    return `
        <div class="content-card locked-card" onclick="openAdultVerification()">
            <img src="${item.poster}" alt="${item.title}" class="card-poster locked-poster" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23222%22 width=%22300%22 height=%22450%22/></svg>'">
            <div class="card-badge" style="background: #ff4444;">18+</div>
            <div class="locked-overlay">
                <div class="lock-icon"><i class="fas fa-lock"></i></div>
                <span class="lock-text">Verifikasi Usia</span>
            </div>
            <div class="card-info">
                <h4 class="card-title">🔒 Konten Terkunci</h4>
                <div class="card-meta">
                    <span>18+</span>
                    <span>Verifikasi diperlukan</span>
                </div>
            </div>
        </div>
    `;
}

// ==========================================================================
// Navigation
// ==========================================================================

function navigateTo(page, addToStack = true) {
    // BLOCK: Jika navigasi ke adult-comedy tapi belum verifikasi
    if (page === 'adult-comedy' && !isAdultVerified()) {
        openAdultVerification();
        return; // Stop navigation
    }
    
    // Add to navigation stack for back button
    if (addToStack && page !== state.currentPage) {
        state.navigationStack.push(page);
    }
    
    // Update URL for bookmarking (only for main pages)
    if (addToStack && window.updateUrlForPage) {
        window.updateUrlForPage(page);
    }
    
    // Update sidebar/nav active states
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Show target page
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
        targetPage.classList.add('active');
        state.currentPage = page;
        
        // Load page data if needed
        loadPageData(page);
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function goBack() {
    // Show social bar when leaving video page
    if (window._showSocialBar) window._showSocialBar();
    
    // Remove current page from stack
    if (state.navigationStack.length > 1) {
        state.navigationStack.pop();
        const previousPage = state.navigationStack[state.navigationStack.length - 1];
        navigateTo(previousPage, false);
    } else {
        navigateTo('home', false);
    }
}

async function loadPageData(page) {
    // Handle special pages first
    if (page === 'history') {
        loadHistory();
        return;
    }
    if (page === 'favorites') {
        loadFavorites();
        return;
    }
    
    // Handle adult-comedy from Bokep API
    if (page === 'adult-comedy') {
        await loadAdultPage();
        return;
    }
    
    const actionMap = {
        'film-indonesia': 'indonesian-movies',
        'western-tv': 'western-tv',
        'indo-dub': 'indo-dub'
    };
    
    const action = actionMap[page];
    if (!action) return;
    
    const gridId = `${page}-grid`;
    const grid = document.getElementById(gridId);
    if (!grid) {
        console.error('Grid not found:', gridId);
        return;
    }
    
    // Check if already loaded
    if (grid.querySelector('.content-card')) return;
    
    console.log('Loading page data:', page, action);
    
    // Show loading skeleton
    grid.innerHTML = `
        <div class="skeleton-container grid">
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
        </div>
    `;
    
    const data = await fetchAPI(action, { page: 1 });
    if (data && data.items && data.items.length > 0) {
        grid.innerHTML = data.items.map(item => createContentCard(item)).join('');
        state.hasMore[action] = data.hasMore !== false;
        
        // Hide load more button if no more content
        const btnId = `load-more-${page}`;
        const btn = document.getElementById(btnId);
        if (btn && !data.hasMore) {
            btn.style.display = 'none';
        }
    } else {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-film"></i><p>Tidak ada konten tersedia</p></div>';
        
        // Hide load more button if no content
        const btnId = `load-more-${page}`;
        const btn = document.getElementById(btnId);
        if (btn) btn.style.display = 'none';
    }
}

// Load adult page from Bokep API
let adultPage = 1;
async function loadAdultPage() {
    const grid = document.getElementById('adult-comedy-grid');
    if (!grid) return;
    
    // Check if already loaded
    if (grid.querySelector('.content-card')) return;
    
    grid.innerHTML = `
        <div class="skeleton-container grid">
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
        </div>
    `;
    
    try {
        const response = await fetch(`${BOKEP_API}/videos?page=1&limit=30`);
        const data = await response.json();
        
        if (data.status && data.results && data.results.length > 0) {
            grid.innerHTML = data.results.map(item => createAdultContentCard(item)).join('');
            adultPage = 1;
        } else {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-fire-alt"></i><p>Tidak ada konten tersedia</p></div>';
        }
    } catch (error) {
        console.error('Error loading adult page:', error);
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Gagal memuat konten</p></div>';
    }
}

// Load more adult content
async function loadMoreAdultContent() {
    const grid = document.getElementById('adult-comedy-grid');
    const btn = document.getElementById('load-more-adult-comedy');
    if (!grid || !btn) return;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...';
    
    try {
        adultPage++;
        const response = await fetch(`${BOKEP_API}/videos?page=${adultPage}&limit=30`);
        const data = await response.json();
        
        if (data.status && data.results && data.results.length > 0) {
            const newCards = data.results.map(item => createAdultContentCard(item)).join('');
            grid.insertAdjacentHTML('beforeend', newCards);
        }
        
        if (adultPage >= data.totalPages) {
            btn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading more adult content:', error);
        adultPage--;
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus"></i> Muat Lebih Banyak';
}

async function loadMoreContent(action) {
    console.log('loadMoreContent called with:', action);
    
    // Map page names to API actions
    const actionToApiMap = {
        'indonesian-movies': 'indonesian-movies',
        'western-tv': 'western-tv',
        'indo-dub': 'indo-dub',
        'adult-comedy': 'adult-comedy',
        'film-indonesia': 'indonesian-movies'
    };
    
    const apiAction = actionToApiMap[action] || action;
    console.log('API action:', apiAction, 'Current page:', state.pages[apiAction], 'Has more:', state.hasMore[apiAction]);
    
    if (!state.hasMore[apiAction]) {
        console.log('No more content to load');
        return;
    }
    
    // Show loading on button
    const pageMap = {
        'indonesian-movies': 'film-indonesia',
        'western-tv': 'western-tv',
        'indo-dub': 'indo-dub',
        'adult-comedy': 'adult-comedy'
    };
    
    const btnId = `load-more-${pageMap[apiAction]}`;
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...';
    }
    
    state.pages[apiAction]++;
    
    const data = await fetchAPI(apiAction, { page: state.pages[apiAction] });
    console.log('Loaded data:', data?.items?.length, 'items');
    
    if (data && data.items) {
        const gridId = `${pageMap[apiAction]}-grid`;
        const grid = document.getElementById(gridId);
        
        if (grid) {
            grid.insertAdjacentHTML('beforeend', data.items.map(item => createContentCard(item)).join(''));
        }
        
        state.hasMore[apiAction] = data.hasMore !== false;
        
        if (btn) {
            if (!data.hasMore) {
                btn.style.display = 'none';
            } else {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-plus"></i> Muat Lebih Banyak';
            }
        }
    } else {
        // Restore button on error
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Muat Lebih Banyak';
        }
    }
}

// ==========================================================================
// Detail Page
// ==========================================================================

async function showDetail(detailPath) {
    showPageTransition();
    
    const data = await fetchAPI('detail', { detailPath });
    
    if (data && data.data) {
        renderDetail(data.data);
        navigateTo('detail');
        
        // Add to history
        addToHistory(data.data);
    } else {
        showToast('Gagal memuat detail', 'error');
    }
    
    hidePageTransition();
}

// Show adult content detail from Bokep API
async function showAdultDetail(slug) {
    showPageTransition();
    
    try {
        const response = await fetch(`${BOKEP_API}/videos/${slug}`);
        const data = await response.json();
        
        if (data.status && data.data) {
            // Store for player use
            window.currentAdultContent = data.data;
            renderAdultDetail(data.data);
            navigateTo('detail');
        } else {
            showToast('Gagal memuat detail', 'error');
        }
    } catch (error) {
        console.error('Error loading adult detail:', error);
        showToast('Gagal memuat konten', 'error');
    }
    
    hidePageTransition();
}

// Render adult content detail
function renderAdultDetail(item) {
    const container = document.getElementById('detail-container');
    if (!container) return;
    
    const title = (item.title || 'Video').replace('Bokep Indo – ', '');
    const sources = item.sources || [];
    
    container.innerHTML = `
        <button class="back-btn" onclick="goBack()">
            <i class="fas fa-arrow-left"></i> Kembali
        </button>
        <div class="detail-header">
            <img src="${item.poster || ''}" alt="${title}" class="detail-poster" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23222%22 width=%22300%22 height=%22450%22/><text x=%22150%22 y=%22225%22 fill=%22%23ff4444%22 text-anchor=%22middle%22 font-size=%2248%22>18+</text></svg>'">
            <div class="detail-info">
                <h1 class="detail-title">${title}</h1>
                <div class="detail-meta">
                    <div class="detail-meta-item" style="color: #ff4444;">
                        <i class="fas fa-fire-alt"></i>
                        <span>18+</span>
                    </div>
                    <div class="detail-meta-item">
                        <i class="fas fa-play-circle"></i>
                        <span>Dadok Server</span>
                    </div>
                </div>
                <div class="detail-genres">
                    ${(item.categories || []).slice(0, 5).map(c => `<span class="genre-tag">${c}</span>`).join('')}
                </div>
                <p class="detail-description">${item.description || 'Konten dewasa 18+'}</p>
                <div class="detail-actions">
                    <button class="detail-btn primary" onclick="playAdultVideo('${item.slug}', 0)">
                        <i class="fas fa-play"></i> Tonton Sekarang
                    </button>
                </div>
            </div>
        </div>
        
        <div class="episodes-section">
            <h2><i class="fas fa-play-circle"></i> Server Streaming</h2>
            <div class="episodes-list" style="display: flex; flex-wrap: wrap; gap: 10px;">
                <button class="episode-btn" onclick="playAdultVideo('${item.slug}', 0)" style="padding: 12px 20px; background: linear-gradient(135deg, #ff4444, #cc0000); border: none; border-radius: 8px; color: white; cursor: pointer; transition: all 0.3s; font-weight: bold;">
                    <i class="fas fa-play-circle"></i> Dadok Server
                </button>
            </div>
        </div>
        
        <div class="episodes-section" style="margin-top: 20px;">
            <h2><i class="fas fa-heart"></i> Simpan Video</h2>
            <div style="display: flex; gap: 10px;">
                <button class="episode-btn" onclick="toggleAdultFavorite('${item.slug}', '${title.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', '${item.poster || ''}')" style="padding: 12px 20px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-color); cursor: pointer;">
                    <i class="fas fa-bookmark"></i> Favorit
                </button>
            </div>
        </div>
        
        <!-- Ad container for adult detail page -->
        <div id="ad-adult-detail" class="ad-container"></div>
    `;
    
    // Store current adult content for player
    window.currentAdultContent = item;
    
    // Load ad for adult detail page
    if (window._loadDetailAd) {
        window._loadDetailAd('ad-adult-detail');
    }
}

// Play adult video - uses watch page like other categories
async function playAdultVideo(slug, serverIndex = 0) {
    // Hide social bar while watching video - don't disturb user
    if (window._hideSocialBar) window._hideSocialBar();
    
    showPageTransition();
    
    let item = window.currentAdultContent;
    
    // If no cached content or different slug, fetch it
    if (!item || item.slug !== slug) {
        try {
            const response = await fetch(`${BOKEP_API}?path=videos/${slug}`);
            const data = await response.json();
            if (data.status && data.data) {
                item = data.data;
                window.currentAdultContent = item;
            } else {
                hidePageTransition();
                showToast('Video tidak ditemukan', 'error');
                return;
            }
        } catch (error) {
            hidePageTransition();
            console.error('Error fetching video:', error);
            showToast('Gagal memuat video', 'error');
            return;
        }
    }
    
    if (!item || !item.sources || !item.sources[serverIndex]) {
        hidePageTransition();
        showToast('Video tidak tersedia', 'error');
        return;
    }
    
    const source = item.sources[serverIndex];
    const title = (item.title || 'Video').replace('Bokep Indo – ', '');
    
    // Store for server switching
    window.currentAdultSources = item.sources;
    window.currentAdultTitle = title;
    window.currentAdultSlug = slug;
    window.currentServerIndex = serverIndex;
    
    // Render adult player in watch container (same as other categories)
    renderAdultPlayer(source.url, title, item.sources, serverIndex);
    navigateTo('watch');
    
    hidePageTransition();
}

// Render adult video player in watch page - uses Imax 1 only
async function renderAdultPlayer(url, title, allSources, currentIndex) {
    const container = document.getElementById('watch-container');
    if (!container) return;
    
    // Find Imax 1 source (imaxstreams.com)
    let imaxSource = allSources.find(src => src.url.includes('imaxstreams.com'));
    let imaxIndex = allSources.findIndex(src => src.url.includes('imaxstreams.com'));
    
    // If no Imax 1, fallback to first available
    if (!imaxSource) {
        imaxSource = allSources[0];
        imaxIndex = 0;
    }
    
    // Update current index to Imax 1
    currentIndex = imaxIndex;
    window.currentServerIndex = imaxIndex;
    
    // Save to history for adult content
    if (window.currentAdultContent) {
        addToHistory({
            title: title,
            poster: window.currentAdultContent.poster,
            detailPath: `adult:${window.currentAdultContent.slug}`,
            slug: window.currentAdultContent.slug,
            type: 'adult',
            isAdult: true
        });
    }
    
    // Initial loading state with player placeholder
    container.innerHTML = `
        <button class="back-btn" onclick="goBack()">
            <i class="fas fa-arrow-left"></i> Kembali
        </button>
        
        <div class="video-player-container adult-player" id="adult-player-wrapper">
            <div class="loading-video">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Memuat video...</p>
            </div>
        </div>
        
        <div class="video-info">
            <h2 class="video-title">${title}</h2>
            <div class="video-meta adult-meta">
                <span class="adult-badge"><i class="fas fa-fire"></i> Film Dewasa</span>
            </div>
        </div>
        
        <!-- Ad container for adult watch page -->
        <div id="ad-adult-watch" class="ad-container"></div>
    `;
    
    // Add styles if not exist
    addAdultPlayerStyles();
    
    // Load ad for adult watch page
    if (window._loadWatchAd) {
        window._loadWatchAd('ad-adult-watch');
    }
    
    // Load Imax 1 video embed
    await loadAdultVideo(imaxSource.url, currentIndex);
}

// Load adult video - use embed directly (API extraction too slow)
async function loadAdultVideo(sourceUrl, serverIndex) {
    const wrapper = document.getElementById('adult-player-wrapper');
    if (!wrapper) return;
    
    // Use embed iframe directly - faster and more reliable
    console.log('[Adult Player] Loading embed for:', sourceUrl);
    useEmbedFallback(wrapper, sourceUrl);
}

// Render native HTML5 video player
function renderNativeVideoPlayer(wrapper, videoUrl) {
    wrapper.innerHTML = `
        <video 
            id="adult-video-player"
            controls 
            autoplay
            playsinline
            poster="${window.currentAdultContent?.poster || ''}"
        >
            <source src="${videoUrl}" type="video/mp4">
            Browser tidak mendukung video tag.
        </video>
    `;
    
    // Handle video errors - fallback to embed
    const video = document.getElementById('adult-video-player');
    if (video) {
        video.onerror = () => {
            console.log('[Adult Player] Native video failed, using embed');
            const sources = window.currentAdultSources;
            const index = window.currentServerIndex || 0;
            if (sources && sources[index]) {
                useEmbedFallback(wrapper, sources[index].url);
            }
        };
    }
}

// Fallback to iframe embed
function useEmbedFallback(wrapper, sourceUrl) {
    const embedUrl = convertToEmbedUrl(sourceUrl);
    const isImax = sourceUrl.includes('imaxstreams');
    
    // Warning moved outside/below video - less intrusive
    let warningHtml = '';
    if (isImax) {
        warningHtml = `
            <div class="imax-warning-below" id="imax-ad-warning">
                <i class="fas fa-info-circle"></i>
                <span>Jika muncul iklan, tutup lalu klik play lagi</span>
                <button onclick="this.parentElement.style.display='none'"><i class="fas fa-times"></i></button>
            </div>
        `;
    }
    
    wrapper.innerHTML = `
        <iframe 
            id="adult-video-iframe"
            src="${embedUrl}" 
            allowfullscreen 
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        ></iframe>
        ${warningHtml}
    `;
}

// Add adult player styles
function addAdultPlayerStyles() {
    if (document.getElementById('adult-player-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'adult-player-styles';
    styles.textContent = `
        .adult-server-selector {
            display: flex;
            gap: 10px;
            padding: 15px;
            background: #111;
            border-radius: 8px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }
        .adult-server-btn {
            padding: 10px 20px;
            background: #222;
            border: 1px solid #333;
            color: #fff;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s;
            font-size: 0.95rem;
            font-weight: 500;
        }
        .adult-server-btn:hover:not(.disabled-server) {
            background: #333;
            transform: translateY(-2px);
        }
        .adult-server-btn.active {
            background: linear-gradient(135deg, #ff4444, #cc0000);
            border-color: #ff4444;
        }
        .adult-server-btn.disabled-server {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .adult-player {
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            width: 100%;
            padding-top: 56.25%;
            background: #000;
        }
        .adult-player video,
        .adult-player iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
        }
        .adult-player video {
            background: #000;
        }
        .adult-guide {
            background: linear-gradient(135deg, rgba(255,68,68,0.1), rgba(204,0,0,0.1));
            border-left: 3px solid #ff4444;
        }
        .adult-meta {
            margin-top: 10px;
        }
        .adult-badge {
            background: linear-gradient(135deg, #ff4444, #cc0000);
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
        }
        .loading-video {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #fff;
        }
        .loading-video i {
            font-size: 3rem;
            margin-bottom: 15px;
            color: #ff4444;
        }
        .loading-video p {
            margin: 0;
            font-size: 1rem;
        }
        .imax-warning {
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 152, 0, 0.95);
            color: #000;
            padding: 10px 15px;
            border-radius: 8px;
            z-index: 100;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.85rem;
            max-width: 90%;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
        .imax-warning i {
            color: #d84315;
        }
        .imax-warning button {
            background: none;
            border: none;
            color: #000;
            cursor: pointer;
            padding: 5px;
            margin-left: auto;
        }
        /* Warning below video - non-intrusive */
        .imax-warning-below {
            background: rgba(40, 40, 40, 0.95);
            color: #ccc;
            padding: 8px 15px;
            border-radius: 0 0 8px 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.75rem;
        }
        .imax-warning-below i {
            color: #ff9800;
            font-size: 0.85rem;
        }
        .imax-warning-below span {
            flex: 1;
        }
        .imax-warning-below button {
            background: none;
            border: none;
            color: #888;
            cursor: pointer;
            padding: 3px 8px;
            font-size: 0.75rem;
        }
        .imax-warning-below button:hover {
            color: #fff;
        }
        @media (max-width: 768px) {
            .imax-warning-below {
                font-size: 0.7rem;
                padding: 6px 10px;
            }
        }
        .open-new-tab {
            background: linear-gradient(135deg, #4CAF50, #2E7D32) !important;
            border-color: #4CAF50 !important;
        }
        .open-new-tab:hover {
            background: linear-gradient(135deg, #66BB6A, #43A047) !important;
        }
    `;
    document.head.appendChild(styles);
}

// Open adult video in new tab (as fallback)
function openAdultVideoNewTab() {
    const sources = window.currentAdultSources;
    const index = window.currentServerIndex || 0;
    
    if (!sources || !sources[index]) {
        showToast('Video tidak tersedia', 'error');
        return;
    }
    
    const url = sources[index].url;
    window.open(url, '_blank');
}

// Switch server for adult video
async function switchAdultServer(index) {
    const sources = window.currentAdultSources;
    if (!sources || !sources[index]) return;
    
    // Don't allow switching to disabled server (imaxstreams.net)
    if (sources[index].url.includes('imaxstreams.net')) {
        showToast('Server ini tidak tersedia', 'error');
        return;
    }
    
    window.currentServerIndex = index;
    
    // Update active button - exclude the "open new tab" button
    document.querySelectorAll('.adult-server-btn:not(.open-new-tab)').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === index);
    });
    
    // Show loading state
    const wrapper = document.getElementById('adult-player-wrapper');
    if (wrapper) {
        wrapper.innerHTML = `
            <div class="loading-video">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Memuat video...</p>
            </div>
        `;
    }
    
    // Load new video
    await loadAdultVideo(sources[index].url, index);
}

// Legacy functions for backward compatibility (not used anymore)
function showEmbeddedPlayer() {}
function switchServer() {}
function closeEmbeddedPlayer() {}

function renderDetail(item) {
    const container = document.getElementById('detail-container');
    if (!container) return;
    
    const hasEpisodes = item.seasons && item.seasons.length > 0;
    
    // Default avatar placeholder
    const defaultAvatar = 'https://ui-avatars.com/api/?background=FFD700&color=000&name=';
    
    container.innerHTML = `
        <button class="back-btn" onclick="goBack()">
            <i class="fas fa-arrow-left"></i> Kembali
        </button>
        <div class="detail-header">
            <img src="${item.poster}" alt="${item.title}" class="detail-poster" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23222%22 width=%22300%22 height=%22450%22/></svg>'">
            <div class="detail-info">
                <h1 class="detail-title">${item.title}</h1>
                <div class="detail-meta">
                    <div class="detail-meta-item">
                        <i class="fas fa-star"></i>
                        <span>${item.rating || '-'}</span>
                    </div>
                    <div class="detail-meta-item">
                        <i class="fas fa-calendar"></i>
                        <span>${item.year || '-'}</span>
                    </div>
                    <div class="detail-meta-item">
                        <i class="fas fa-globe"></i>
                        <span>${item.country || 'Indonesia'}</span>
                    </div>
                    ${item.duration ? `
                        <div class="detail-meta-item">
                            <i class="fas fa-clock"></i>
                            <span>${item.duration} menit</span>
                        </div>
                    ` : ''}
                    ${hasEpisodes ? `
                        <div class="detail-meta-item">
                            <i class="fas fa-list"></i>
                            <span>${item.totalSeasons || 1} Season, ${item.seasons.reduce((acc, s) => acc + (s.totalEpisodes || s.episodes?.length || 0), 0)} Episode</span>
                        </div>
                    ` : ''}
                </div>
                <div class="detail-genres">
                    ${(item.genre || '').split(',').map(g => `<span class="genre-tag">${g.trim()}</span>`).join('')}
                </div>
                <p class="detail-description">${item.description || 'Deskripsi tidak tersedia.'}</p>
                <div class="detail-actions">
                    ${hasEpisodes ? `
                        <button class="detail-btn primary" onclick="playEpisode('${item.detailPath}', 1, 1)">
                            <i class="fas fa-play"></i> Tonton Episode 1
                        </button>
                    ` : `
                        <button class="detail-btn primary" onclick="playMovieFromDetail()">
                            <i class="fas fa-play"></i> Tonton Sekarang
                        </button>
                    `}
                    <button class="detail-btn secondary" onclick="toggleFavorite('${item.detailPath}', '${item.title}', '${item.poster}')">
                        <i class="fas fa-heart"></i> Favorit
                    </button>
                </div>
            </div>
        </div>
        
        ${item.cast && item.cast.length > 0 ? `
            <div class="cast-section">
                <h2><i class="fas fa-users"></i> Pemeran</h2>
                <div class="cast-grid">
                    ${item.cast.slice(0, 12).map(c => {
                        const avatarUrl = c.avatar && c.avatar.trim() !== '' 
                            ? c.avatar 
                            : defaultAvatar + encodeURIComponent(c.name || 'Unknown');
                        return `
                            <div class="cast-card">
                                <div class="cast-avatar-wrapper">
                                    <img src="${avatarUrl}" alt="${c.name}" class="cast-avatar" onerror="this.src='${defaultAvatar}${encodeURIComponent(c.name || 'U')}'">
                                </div>
                                <div class="cast-info">
                                    <p class="cast-name">${c.name || 'Unknown'}</p>
                                    <p class="cast-character">${c.character || '-'}</p>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        ` : ''}
        
        ${item.trailerUrl ? `
            <div class="trailer-section">
                <h2><i class="fas fa-video"></i> Trailer</h2>
                <div class="trailer-wrapper">
                    <video class="trailer-video" controls playsinline poster="${item.poster}" preload="metadata">
                        <source src="${item.trailerUrl}" type="video/mp4">
                        Browser Anda tidak mendukung video.
                    </video>
                </div>
            </div>
        ` : ''}
        
        ${hasEpisodes ? `
            <div class="episodes-section">
                <div class="episodes-header">
                    <h2><i class="fas fa-list"></i> Daftar Episode</h2>
                    ${(item.totalSeasons || 1) > 1 ? `
                        <select class="season-select" onchange="changeSeason(this.value, '${item.detailPath}')">
                            ${item.seasons.map(s => `<option value="${s.season}">Season ${s.season}</option>`).join('')}
                        </select>
                    ` : ''}
                </div>
                <div class="episodes-grid" id="episodes-grid">
                    ${renderEpisodes(item.seasons[0].episodes, item.detailPath, 1)}
                </div>
            </div>
        ` : ''}
        
        <!-- Ad container for detail page -->
        <div id="ad-detail" class="ad-container"></div>
    `;
    
    // Store current content for later use
    state.currentContent = item;
    
    // Load ad for detail page
    if (window._loadDetailAd) {
        window._loadDetailAd('ad-detail');
    }
}

function renderEpisodes(episodes, detailPath, season) {
    return episodes.map(ep => {
        // Use the episode's playerUrl directly if available
        const clickHandler = ep.playerUrl 
            ? `playDirectUrl('${ep.playerUrl}', 'Episode ${ep.episode}')`
            : `playEpisode('${detailPath}', ${season}, ${ep.episode})`;
        
        return `
            <div class="episode-card" onclick="${clickHandler}">
                <img src="${ep.cover}" alt="Episode ${ep.episode}" class="episode-thumb" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 160 90%22><rect fill=%22%23222%22 width=%22160%22 height=%2290%22/></svg>'">
                <div class="episode-info">
                    <h4>Episode ${ep.episode}</h4>
                    <p>${ep.title || `Episode ${ep.episode}`}</p>
                </div>
            </div>
        `;
    }).join('');
}

async function changeSeason(season, detailPath) {
    if (!state.currentContent) return;
    
    const seasonData = state.currentContent.seasons.find(s => s.season === parseInt(season));
    if (seasonData) {
        const grid = document.getElementById('episodes-grid');
        if (grid) {
            grid.innerHTML = renderEpisodes(seasonData.episodes, detailPath, season);
        }
    }
}

// ==========================================================================
// Video Player
// ==========================================================================

function playEpisode(detailPath, season, episode) {
    showPageTransition();
    
    let playerUrl = '';
    
    // Try to get playerUrl from cached content
    if (state.currentContent && state.currentContent.seasons) {
        const seasonData = state.currentContent.seasons.find(s => s.season === parseInt(season));
        if (seasonData && seasonData.episodes) {
            const episodeData = seasonData.episodes.find(e => e.episode === parseInt(episode));
            if (episodeData && episodeData.playerUrl) {
                playerUrl = episodeData.playerUrl;
            }
        }
    }
    
    // Fallback: construct URL with id if available
    if (!playerUrl && state.currentContent) {
        const id = state.currentContent.id;
        if (id) {
            playerUrl = `https://zeldvorik.ru/apiv3/player.php?id=${id}&detailPath=${detailPath}&season=${season}&episode=${episode}`;
        } else {
            playerUrl = `https://zeldvorik.ru/apiv3/player.php?detailPath=${detailPath}&season=${season}&episode=${episode}`;
        }
    }
    
    console.log('Playing episode:', playerUrl);
    
    renderPlayer(playerUrl, `Season ${season} Episode ${episode}`, false);
    navigateTo('watch');
    
    hidePageTransition();
}

function playMovieFromDetail() {
    if (!state.currentContent) {
        showToast('Data film tidak tersedia', 'error');
        return;
    }
    
    showPageTransition();
    
    const item = state.currentContent;
    let playerUrl = item.playerUrl;
    
    // If no playerUrl, construct one with id
    if (!playerUrl) {
        if (item.id) {
            playerUrl = `https://zeldvorik.ru/apiv3/player.php?id=${item.id}&detailPath=${item.detailPath}`;
        } else {
            playerUrl = `https://zeldvorik.ru/apiv3/player.php?detailPath=${item.detailPath}`;
        }
    }
    
    console.log('Playing movie:', playerUrl);
    
    renderPlayer(playerUrl, item.title, true);
    navigateTo('watch');
    
    hidePageTransition();
}

function playMovie(playerUrl, title) {
    showPageTransition();
    
    renderPlayer(playerUrl, title, true);
    navigateTo('watch');
    
    hidePageTransition();
}

function playDirectUrl(playerUrl, subtitle) {
    showPageTransition();
    
    console.log('Playing direct URL:', playerUrl);
    
    renderPlayer(playerUrl, subtitle, false);
    navigateTo('watch');
    
    hidePageTransition();
}

function renderPlayer(playerUrl, subtitle, isMovie = false) {
    // Hide social bar while watching video - don't disturb user
    if (window._hideSocialBar) window._hideSocialBar();
    
    const container = document.getElementById('watch-container');
    if (!container) return;
    
    const title = state.currentContent?.title || 'Video Player';
    const hasEpisodes = state.currentContent?.seasons && state.currentContent.seasons.length > 0 && state.currentContent.seasons[0]?.episodes;
    
    // Save to history when watching
    if (state.currentContent) {
        addToHistory(state.currentContent);
    }
    
    container.innerHTML = `
        <button class="back-btn" onclick="goBack()">
            <i class="fas fa-arrow-left"></i> Kembali
        </button>
        
        <!-- Instruksi Panduan -->
        <div class="player-guide">
            <i class="fas fa-info-circle"></i>
            <span>Jika video stuck loading/buffering, tekan tombol <strong>Play ▶</strong> di sebelah tombol volume atau tunggu beberapa detik.</span>
            <button class="guide-close" onclick="this.parentElement.style.display='none'">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="video-player-container">
            <iframe src="${playerUrl}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>
        </div>
        <div class="video-info">
            <h2 class="video-title">${title}</h2>
            <p class="video-subtitle">${subtitle}</p>
            <div class="video-meta">
                <span><i class="fas fa-star" style="color: var(--primary);"></i> ${state.currentContent?.rating || '-'}</span>
                <span><i class="fas fa-calendar"></i> ${state.currentContent?.year || '-'}</span>
            </div>
        </div>
        
        ${!isMovie && hasEpisodes ? `
            <div class="more-episodes">
                <h3><i class="fas fa-list"></i> Episode Lainnya</h3>
                <div class="episodes-grid">
                    ${state.currentContent.seasons[0].episodes.slice(0, 10).map(ep => `
                        <div class="episode-card" onclick="playEpisode('${state.currentContent.detailPath}', 1, ${ep.episode})">
                            <img src="${ep.cover}" alt="Episode ${ep.episode}" class="episode-thumb" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 160 90%22><rect fill=%22%23222%22 width=%22160%22 height=%2290%22/></svg>'">
                            <div class="episode-info">
                                <h4>Episode ${ep.episode}</h4>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        <!-- Ad container for watch page -->
        <div id="ad-watch" class="ad-container"></div>
    `;
    
    // Load ad for watch page
    if (window._loadWatchAd) {
        window._loadWatchAd('ad-watch');
    }
}

// ==========================================================================
// Search
// ==========================================================================

async function performSearch(query, showPage = false) {
    if (showPage) {
        // Navigate to search page
        navigateTo('search');
        document.getElementById('search-query-display').textContent = `Hasil untuk: "${query}"`;
        
        const grid = document.getElementById('search-grid');
        if (grid) {
            grid.innerHTML = '<div class="skeleton-container grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
        }
    }
    
    // Search from main API
    const data = await fetchAPI('search', { q: query });
    
    // Also search from Bokep API
    let adultResults = [];
    try {
        console.log('[Search] Fetching adult content for:', query);
        const adultResponse = await fetch(`${BOKEP_API}/videos?q=${encodeURIComponent(query)}&limit=20`);
        const adultData = await adultResponse.json();
        console.log('[Search] Adult API response:', adultData);
        if (adultData.status && adultData.results) {
            adultResults = adultData.results.map(item => ({
                ...item,
                isAdult: true,
                type: 'adult',
                detailPath: `adult:${item.slug}`
            }));
            console.log('[Search] Adult results mapped:', adultResults.length, 'items');
        }
    } catch (e) {
        console.error('[Search] Adult search error:', e);
    }
    
    let allItems = [];
    
    if (data && data.items) {
        // Filter out adult content from main API if user is not verified
        let filteredItems = data.items;
        if (!isAdultVerified()) {
            filteredItems = data.items.filter(item => !isAdultContent(item));
        }
        allItems = [...filteredItems];
    }
    
    // Add adult results
    allItems = [...allItems, ...adultResults];
    console.log('[Search] Total combined results:', allItems.length, '(adult:', adultResults.length, ')');
    
    if (showPage) {
        const grid = document.getElementById('search-grid');
        if (grid) {
            if (allItems.length > 0) {
                grid.innerHTML = allItems.map(item => {
                    if (item.isAdult || item.type === 'adult') {
                        return createAdultContentCard(item);
                    }
                    return createContentCard(item);
                }).join('');
            } else {
                grid.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada hasil ditemukan</p></div>';
            }
        }
    } else {
        // Show in dropdown - combine results
        showSearchResults(allItems, adultResults);
    }
}

// Check if content is adult content
function isAdultContent(item) {
    const adultKeywords = ['open bo', 'sugar baby', 'scandal', 'sexy', 'turn on', 'bombam', 'bestie', 'world of the married', 'love affairs', 'jejak duka'];
    const title = (item.title || '').toLowerCase();
    const genre = (item.genre || '').toLowerCase();
    
    // Check if title contains adult keywords
    for (const keyword of adultKeywords) {
        if (title.includes(keyword)) return true;
    }
    
    // Check if it's from adult category
    if (item.category === 'adult-comedy' || item.isAdult) return true;
    
    return false;
}

function showSearchResults(items, adultItems = []) {
    const container = document.getElementById('search-results');
    if (!container) {
        console.error('[Search] No search-results container found!');
        return;
    }
    
    console.log('[Search] showSearchResults called with', items.length, 'items,', adultItems.length, 'adult items');
    const allItems = [...items.slice(0, 6), ...adultItems.slice(0, 2)];
    
    if (allItems.length === 0) {
        container.innerHTML = '<div class="search-no-results"><p>Tidak ada hasil ditemukan</p></div>';
    } else {
        container.innerHTML = allItems.slice(0, 8).map(item => {
            const isAdult = item.isAdult || item.type === 'adult';
            const onclick = isAdult ? `showAdultDetail('${item.slug}')` : `showDetail('${item.detailPath}')`;
            const title = isAdult ? (item.title || 'Video').replace('Bokep Indo – ', '').replace('Bokep Indo - ', '') : item.title;
            
            return `
                <div class="search-result-item" onclick="${onclick}">
                    <img src="${item.poster}" alt="${title}" class="search-result-img">
                    <div class="search-result-info">
                        <h4>${title}</h4>
                        <p>${isAdult ? '18+ • Dewasa' : `${item.year} • ${item.genre?.split(',')[0] || 'Drama'}`}</p>
                        <span class="search-result-type" ${isAdult ? 'style="background: #ff4444; color: white;"' : ''}>${isAdult ? '18+' : (item.type === 'tv' ? 'Series' : 'Film')}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    container.classList.remove('hidden');
}

function hideSearchResults() {
    const container = document.getElementById('search-results');
    if (container) {
        container.classList.add('hidden');
    }
}

async function performMobileSearch(query) {
    const container = document.getElementById('mobile-search-results');
    if (!container) return;
    
    // Show loading
    container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Mencari...</p></div>';
    
    // Search from main API
    const data = await fetchAPI('search', { q: query });
    
    // Also search from Bokep API
    let adultResults = [];
    try {
        const adultResponse = await fetch(`${BOKEP_API}/videos?q=${encodeURIComponent(query)}&limit=10`);
        const adultData = await adultResponse.json();
        if (adultData.status && adultData.results) {
            adultResults = adultData.results.map(item => ({
                ...item,
                isAdult: true,
                type: 'adult'
            }));
        }
    } catch (e) {
        console.error('Adult mobile search error:', e);
    }
    
    let allItems = [];
    
    if (data && data.items) {
        allItems = [...data.items.slice(0, 6)];
    }
    
    // Add adult results
    allItems = [...allItems, ...adultResults.slice(0, 4)];
    
    if (allItems.length > 0) {
        container.innerHTML = allItems.map(item => {
            const isAdult = item.isAdult || item.type === 'adult';
            const onclick = isAdult 
                ? `closeMobileSearch(); showAdultDetail('${item.slug}')`
                : `closeMobileSearch(); showDetail('${item.detailPath}')`;
            const title = isAdult 
                ? (item.title || 'Video').replace('Bokep Indo – ', '').replace('Bokep Indo - ', '')
                : item.title;
            
            return `
                <div class="search-result-item" onclick="${onclick}">
                    <img src="${item.poster}" alt="${title}" class="search-result-img" onerror="this.src='https://via.placeholder.com/80x120?text=18%2B'">
                    <div class="search-result-info">
                        <h4>${title}</h4>
                        <p>${isAdult ? '18+ • Dewasa' : `${item.year || ''} • ${item.genre?.split(',')[0] || 'Drama'}`}</p>
                        <span class="search-result-type" ${isAdult ? 'style="background: #ff4444; color: white;"' : ''}>${isAdult ? '18+' : (item.type === 'tv' ? 'Series' : 'Film')}</span>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada hasil</p></div>';
    }
}

function openMobileSearch() {
    const overlay = document.getElementById('mobile-search-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        const input = document.getElementById('mobile-search-input');
        if (input) input.focus();
    }
}

function closeMobileSearch() {
    const overlay = document.getElementById('mobile-search-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// ==========================================================================
// History & Favorites
// ==========================================================================

function addToHistory(item) {
    if (!item || !item.detailPath) {
        console.warn('Invalid item for history:', item);
        return;
    }
    
    const historyItem = {
        detailPath: item.detailPath,
        title: item.title || 'Unknown Title',
        poster: item.poster || '',
        timestamp: Date.now()
    };
    
    console.log('Adding to history:', historyItem);
    
    // Remove if already exists
    state.history = state.history.filter(h => h.detailPath !== item.detailPath);
    
    // Add to beginning
    state.history.unshift(historyItem);
    
    // Keep only last 50
    state.history = state.history.slice(0, 50);
    
    // Save to localStorage
    try {
        localStorage.setItem('bioskop_history', JSON.stringify(state.history));
        console.log('History saved, total items:', state.history.length);
    } catch (e) {
        console.error('Failed to save history:', e);
    }
}

function loadContinueWatching() {
    const section = document.getElementById('continue-watching-section');
    const container = document.getElementById('continue-watching');
    
    if (!section || !container) return;
    
    if (state.history.length > 0) {
        section.style.display = 'block';
        container.innerHTML = state.history.slice(0, 10).map(item => {
            // Check if it's adult content
            const isAdult = item.isAdult || item.type === 'adult' || (item.detailPath && item.detailPath.startsWith('adult:'));
            const slug = isAdult ? (item.slug || item.detailPath?.replace('adult:', '')) : null;
            const onclick = isAdult ? `showAdultDetail('${slug}')` : `showDetail('${item.detailPath}')`;
            
            return `
                <div class="content-card" onclick="${onclick}">
                    <img src="${item.poster}" alt="${item.title}" class="card-poster" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23222%22 width=%22300%22 height=%22450%22/></svg>'">
                    ${isAdult ? '<div class="card-badge" style="background: linear-gradient(135deg, #ff4444, #cc0000);">18+</div>' : ''}
                    <div class="card-overlay">
                        <div class="card-play-btn"><i class="fas fa-play"></i></div>
                    </div>
                    <div class="card-info">
                        <h4 class="card-title">${item.title}</h4>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        section.style.display = 'none';
    }
}

function toggleFavorite(detailPath, title, poster) {
    const index = state.favorites.findIndex(f => f.detailPath === detailPath);
    
    if (index > -1) {
        state.favorites.splice(index, 1);
        showToast('Dihapus dari favorit', 'info');
    } else {
        state.favorites.push({ detailPath, title, poster });
        showToast('Ditambahkan ke favorit', 'success');
    }
    
    localStorage.setItem('bioskop_favorites', JSON.stringify(state.favorites));
    loadFavorites();
}

// Toggle adult content favorites
function toggleAdultFavorite(slug, title, poster) {
    const detailPath = `adult:${slug}`;
    const index = state.favorites.findIndex(f => f.detailPath === detailPath);
    
    if (index > -1) {
        state.favorites.splice(index, 1);
        showToast('Dihapus dari favorit', 'info');
    } else {
        state.favorites.push({ 
            detailPath, 
            title, 
            poster,
            slug,
            isAdult: true,
            type: 'adult'
        });
        showToast('Ditambahkan ke favorit ❤️', 'success');
    }
    
    localStorage.setItem('bioskop_favorites', JSON.stringify(state.favorites));
    loadFavorites();
}

function addToFavorites(detailPath, title, poster) {
    if (!state.favorites.find(f => f.detailPath === detailPath)) {
        state.favorites.push({ detailPath, title, poster });
        localStorage.setItem('bioskop_favorites', JSON.stringify(state.favorites));
        showToast('Ditambahkan ke daftar saya', 'success');
    } else {
        showToast('Sudah ada di daftar saya', 'info');
    }
}

function loadFavorites() {
    const grid = document.getElementById('favorites-grid');
    if (!grid) return;
    
    if (state.favorites.length > 0) {
        grid.innerHTML = state.favorites.map(item => {
            // Check if it's adult content
            const isAdult = item.isAdult || item.type === 'adult' || (item.detailPath && item.detailPath.startsWith('adult:'));
            const slug = isAdult ? (item.slug || item.detailPath?.replace('adult:', '')) : null;
            const onclick = isAdult ? `showAdultDetail('${slug}')` : `showDetail('${item.detailPath}')`;
            
            return `
                <div class="content-card" onclick="${onclick}">
                    <img src="${item.poster}" alt="${item.title}" class="card-poster" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23222%22 width=%22300%22 height=%22450%22/></svg>'">
                    ${isAdult ? '<div class="card-badge" style="background: linear-gradient(135deg, #ff4444, #cc0000);">18+</div>' : ''}
                    <div class="card-overlay">
                        <div class="card-play-btn"><i class="fas fa-play"></i></div>
                    </div>
                    <div class="card-info">
                        <h4 class="card-title">${item.title}</h4>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-heart"></i><p>Belum ada favorit</p></div>';
    }
}

function loadHistory() {
    const grid = document.getElementById('history-grid');
    if (!grid) return;
    
    // Always reload from localStorage to get latest data
    try {
        const stored = localStorage.getItem('bioskop_history');
        if (stored) {
            state.history = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load history:', e);
        state.history = [];
    }
    
    console.log('Loading history, items:', state.history.length);
    
    if (state.history.length > 0) {
        grid.innerHTML = state.history.map(item => {
            // Check if it's adult content
            const isAdult = item.isAdult || item.type === 'adult' || (item.detailPath && item.detailPath.startsWith('adult:'));
            const slug = isAdult ? (item.slug || item.detailPath?.replace('adult:', '')) : null;
            const onclick = isAdult ? `showAdultDetail('${slug}')` : `showDetail('${item.detailPath}')`;
            
            return `
                <div class="content-card" onclick="${onclick}">
                    <img src="${item.poster}" alt="${item.title}" class="card-poster" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23222%22 width=%22300%22 height=%22450%22/></svg>'">
                    ${isAdult ? '<div class="card-badge" style="background: linear-gradient(135deg, #ff4444, #cc0000);">18+</div>' : ''}
                    <div class="card-overlay">
                        <div class="card-play-btn"><i class="fas fa-play"></i></div>
                    </div>
                    <div class="card-info">
                        <h4 class="card-title">${item.title}</h4>
                    </div>
                </div>
            `;
        }).join('');
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
    const transition = document.getElementById('page-transition');
    if (transition) {
        transition.classList.add('active');
    }
}

function hidePageTransition() {
    const transition = document.getElementById('page-transition');
    if (transition) {
        setTimeout(() => {
            transition.classList.remove('active');
        }, 300);
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
    if (overlay) {
        overlay.classList.toggle('active');
    }
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) {
        sidebar.classList.remove('open');
    }
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// ==========================================================================
// URL Routing for Category Pages
// ==========================================================================

function handleUrlRouting() {
    const path = window.location.pathname.toLowerCase().replace(/\/$/, '');
    
    // Map URL paths to internal page names
    const routeMap = {
        '/filmindonesia': 'film-indonesia',
        '/film-indonesia': 'film-indonesia',
        '/westerntv': 'western-tv',
        '/western-tv': 'western-tv',
        '/indodub': 'indo-dub',
        '/indo-dub': 'indo-dub',
        '/candadewasa': 'adult-comedy',
        '/canda-dewasa': 'adult-comedy',
        '/adult-comedy': 'adult-comedy',
        '/history': 'history',
        '/riwayat': 'history',
        '/favorites': 'favorites',
        '/favorit': 'favorites'
    };
    
    const targetPage = routeMap[path];
    
    if (targetPage) {
        // Delay navigation to allow DOM to be ready
        setTimeout(() => {
            // IMPORTANT: Jika akses halaman adult-comedy, HARUS verifikasi dulu
            if (targetPage === 'adult-comedy') {
                if (isAdultVerified()) {
                    navigateTo(targetPage);
                } else {
                    // Redirect ke home dan tampilkan modal verifikasi
                    navigateTo('home');
                    setTimeout(() => {
                        openAdultVerification();
                    }, 500);
                }
            } else {
                navigateTo(targetPage);
            }
        }, 100);
    }
    
    // Update URL when navigating (for bookmarking)
    window.updateUrlForPage = function(page) {
        const pageToUrl = {
            'home': '/',
            'film-indonesia': '/filmindonesia',
            'western-tv': '/westerntv',
            'indo-dub': '/indodub',
            'adult-comedy': '/candadewasa',
            'history': '/riwayat',
            'favorites': '/favorit'
        };
        
        const newUrl = pageToUrl[page] || '/';
        if (window.history && window.history.pushState) {
            window.history.pushState({ page: page }, '', newUrl);
        }
    };
}

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.page) {
        navigateTo(event.state.page, false);
    }
});

// Handle page-specific data loading
window.addEventListener('hashchange', () => {
    const page = window.location.hash.replace('#', '') || 'home';
    if (page === 'history') loadHistory();
    if (page === 'favorites') loadFavorites();
});

// ==========================================================================
// WhatsApp Age Verification System with REAL OTP via WhatsApp
// ==========================================================================
// Adult Content Verification (DISABLED - Direct Access)
// ==========================================================================

const VERIFIED_KEY = 'bioskop_adult_verified';

function isAdultVerified() {
    // BYPASS: Always return true for direct access
    return true;
}

function openAdultVerification() {
    // BYPASS: Direct navigation to adult-comedy without verification
    navigateTo('adult-comedy');
}
