const https = require('https');
const http = require('http');

// TMDB API Configuration
const TMDB_API_KEY = '2dca580c2a14b55200e784d157207b4d';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

// Rebahan source
const REBAHAN_BASE = 'https://guidedumanifestant.org';
const REBAHAN_AJAX = REBAHAN_BASE + '/wp-admin/admin-ajax.php';

// In-memory cache
const cache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
    const entry = cache[key];
    if (entry && (Date.now() - entry.ts) < CACHE_TTL) return entry.data;
    return null;
}
function setCache(key, data) {
    cache[key] = { data, ts: Date.now() };
}

// Simple fetch using Node.js built-in
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        lib.get(url, { timeout: 12000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(new Error('Invalid JSON')); }
            });
        }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
    });
}

// Fetch HTML page
function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const opts = {
            timeout: 12000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        };
        const urlObj = new URL(url);
        opts.hostname = urlObj.hostname;
        opts.path = urlObj.pathname + urlObj.search;
        opts.port = urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80);

        lib.get(url, opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchHTML(res.headers.location));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
    });
}

// POST request (for AJAX)
function postData(url, body) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const opts = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            port: urlObj.port || 443,
            method: 'POST',
            timeout: 12000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
        req.write(body);
        req.end();
    });
}

// Adult-only category slugs (used to filter trending)
const ADULT_CATEGORIES = ['film-semi', 'film-bokep-jepang', 'semi-jepang', 'semi-indonesia', 'semi-korea', 'semi-filipina', 'vivamax', 'film-semi-jepang', 'film-jepang', 'kelas-bintang'];

// Parse articles from Rebahan HTML
function parseRebahanArticles(html) {
    const articles = [];
    const articleRegex = /<article[^>]*id="post-(\d+)"[^>]*>([\s\S]*?)<\/article>/g;
    let match;
    while ((match = articleRegex.exec(html)) !== null) {
        const postId = match[1];
        const content = match[2];

        const titleMatch = content.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/);
        const imgMatch = content.match(/<img[^>]*src="([^"]+)"/);
        const yearMatch = content.match(/rel="tag">(\d{4})<\/a>/);

        // Extract category slugs from article links
        const catMatches = [...content.matchAll(/category\/([a-z0-9-]+)/g)];
        const categories = [...new Set(catMatches.map(m => m[1]))];

        if (titleMatch) {
            const url = titleMatch[1];
            const slug = url.replace(REBAHAN_BASE, '').replace(/^\/|\/$/g, '');
            articles.push({
                id: postId,
                postId: postId,
                title: titleMatch[2].replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').replace(/&#038;/g, '&'),
                poster: imgMatch ? imgMatch[1] : '',
                url: url,
                slug: slug,
                year: yearMatch ? yearMatch[1] : '',
                type: 'rebahan',
                categories: categories
            });
        }
    }
    return articles;
}

// Get embed URLs from Rebahan AJAX
async function getRebahanEmbeds(postId) {
    const servers = [];
    for (let i = 1; i <= 5; i++) {
        try {
            const body = `action=muvipro_player_content&tab=p${i}&post_id=${postId}`;
            const result = await postData(REBAHAN_AJAX, body);
            const iframeMatch = result.match(/src="([^"]+)"/i);
            if (iframeMatch) {
                const serverNames = ['Server 1', 'Server 2', 'Server 3', 'Server 4', 'Server 5'];
                servers.push({
                    name: serverNames[i - 1],
                    url: iframeMatch[1],
                    index: i
                });
            }
        } catch (e) { /* skip failed server */ }
    }
    return servers;
}

// Get embed URL for a movie/TV show using vidsrc.cc (vidsrc.xyz is dead)
function getEmbedUrl(tmdbId, type = 'movie', season, episode) {
    if (type === 'tv' && season && episode) {
        return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`;
    }
    if (type === 'tv') {
        return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/1/1`;
    }
    return `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
}

// Transform TMDB movie data to our format
function transformMovie(movie, type = 'movie') {
    const mediaType = type || movie.media_type || 'movie';
    const title = movie.title || movie.name || 'Unknown';
    const year = (movie.release_date || movie.first_air_date || '').split('-')[0];
    const poster = movie.poster_path ? `${TMDB_IMG}/w500${movie.poster_path}` : '';
    const backdrop = movie.backdrop_path ? `${TMDB_IMG}/w1280${movie.backdrop_path}` : '';
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '0';
    const genres = (movie.genre_ids || []).map(id => genreMap[id] || '').filter(Boolean).join(', ');

    return {
        id: movie.id,
        tmdbId: movie.id,
        title: title,
        year: year,
        poster: poster,
        backdrop: backdrop,
        rating: rating,
        genre: genres,
        description: movie.overview || '',
        type: mediaType,
        detailPath: `tmdb:${mediaType}:${movie.id}`,
        embedUrl: getEmbedUrl(movie.id, mediaType)
    };
}

// Genre ID to name mapping (TMDB)
const genreMap = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
    10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
    10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics'
};

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action || '';
    const page = parseInt(req.query.page || '1', 10);

    try {
        // ==================== REBAHAN CATEGORY LIST ====================
        if (action === 'rebahan-list') {
            const category = req.query.category || 'film-semi';
            const allowed = ['film-semi', 'film-bokep-jepang', 'semi-jepang', 'semi-indonesia', 'semi-korea', 'semi-filipina', 'trending', 'vivamax', 'film-semi-jepang', 'film-jepang', 'kelas-bintang'];
            if (!allowed.includes(category)) {
                return res.status(400).json({ success: false, error: 'Invalid category' });
            }

            const cacheKey = `rebahan-${category}-${page}`;
            const cached = getCached(cacheKey);
            if (cached) return res.json(cached);

            const catPath = ['semi-jepang', 'semi-indonesia', 'semi-korea', 'semi-filipina'].includes(category)
                ? `/category/film-semi/${category}/`
                : `/category/${category}/`;
            const url = page > 1
                ? `${REBAHAN_BASE}${catPath}page/${page}/`
                : `${REBAHAN_BASE}${catPath}`;

            const html = await fetchHTML(url);
            let articles = parseRebahanArticles(html);

            // Filter trending to adult-only content
            if (category === 'trending') {
                articles = articles.filter(item =>
                    item.categories && item.categories.some(c => ADULT_CATEGORIES.includes(c))
                );
            }

            // Check max pages
            const pageNums = [...html.matchAll(/page\/(\d+)/g)].map(m => parseInt(m[1]));
            const maxPage = pageNums.length > 0 ? Math.max(...pageNums) : 1;

            const result = {
                success: true,
                items: articles,
                hasMore: page < maxPage,
                totalPages: maxPage,
                category: category
            };
            setCache(cacheKey, result);
            return res.json(result);
        }

        // ==================== REBAHAN PLAYER (EMBEDS) ====================
        if (action === 'rebahan-player') {
            const postId = req.query.post_id;
            if (!postId || !/^\d+$/.test(postId)) {
                return res.status(400).json({ success: false, error: 'Invalid post_id' });
            }

            const cacheKey = `rebahan-player-${postId}`;
            const cached = getCached(cacheKey);
            if (cached) return res.json(cached);

            const servers = await getRebahanEmbeds(postId);
            const result = {
                success: true,
                postId: postId,
                servers: servers
            };
            setCache(cacheKey, result);
            return res.json(result);
        }

        // ==================== REBAHAN SEARCH ====================
        if (action === 'rebahan-search') {
            const q = req.query.q || '';
            if (!q) return res.json({ success: true, items: [] });

            const cacheKey = `rebahan-search-${q}-${page}`;
            const cached = getCached(cacheKey);
            if (cached) return res.json(cached);

            const url = page > 1
                ? `${REBAHAN_BASE}/page/${page}/?s=${encodeURIComponent(q)}`
                : `${REBAHAN_BASE}/?s=${encodeURIComponent(q)}`;

            const html = await fetchHTML(url);
            const articles = parseRebahanArticles(html);
            const pageNums = [...html.matchAll(/page\/(\d+)/g)].map(m => parseInt(m[1]));
            const maxPage = pageNums.length > 0 ? Math.max(...pageNums) : 1;

            const result = {
                success: true,
                items: articles,
                hasMore: page < maxPage,
                totalPages: maxPage
            };
            setCache(cacheKey, result);
            return res.json(result);
        }

        // ==================== INDONESIAN MOVIES ====================
        if (action === 'indonesian-movies') {
            const cacheKey = `indo-movies-${page}`;
            const cached = getCached(cacheKey);
            if (cached) return res.json(cached);

            const data = await fetchJSON(
                `${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&language=id-ID&with_original_language=id&sort_by=popularity.desc&page=${page}&vote_count.gte=5`
            );

            const result = {
                success: true,
                items: (data.results || []).map(m => transformMovie(m, 'movie')),
                hasMore: page < (data.total_pages || 1),
                totalPages: data.total_pages || 1
            };
            setCache(cacheKey, result);
            return res.json(result);
        }

        // ==================== WESTERN TV ====================
        if (action === 'western-tv') {
            const cacheKey = `western-tv-${page}`;
            const cached = getCached(cacheKey);
            if (cached) return res.json(cached);

            const data = await fetchJSON(
                `${TMDB_BASE}/discover/tv?api_key=${TMDB_API_KEY}&language=id-ID&with_original_language=en&sort_by=popularity.desc&page=${page}&vote_count.gte=50`
            );

            const result = {
                success: true,
                items: (data.results || []).map(m => transformMovie(m, 'tv')),
                hasMore: page < (data.total_pages || 1),
                totalPages: data.total_pages || 1
            };
            setCache(cacheKey, result);
            return res.json(result);
        }

        // ==================== INDO DUB (popular dubbed movies) ====================
        if (action === 'indo-dub') {
            const cacheKey = `indo-dub-${page}`;
            const cached = getCached(cacheKey);
            if (cached) return res.json(cached);

            // Popular action/animation movies likely dubbed to Indonesian
            const data = await fetchJSON(
                `${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&language=id-ID&sort_by=popularity.desc&page=${page}&vote_count.gte=100&with_genres=28,16,12`
            );

            const result = {
                success: true,
                items: (data.results || []).map(m => {
                    const item = transformMovie(m, 'movie');
                    item.title = item.title; // Already in Indonesian from TMDB
                    return item;
                }),
                hasMore: page < (data.total_pages || 1),
                totalPages: data.total_pages || 1
            };
            setCache(cacheKey, result);
            return res.json(result);
        }

        // ==================== DETAIL ====================
        if (action === 'detail') {
            const detailPath = req.query.detailPath || '';
            const match = detailPath.match(/^tmdb:(movie|tv):(\d+)$/);
            if (!match) {
                return res.status(400).json({ success: false, error: 'Invalid detailPath format' });
            }
            const type = match[1];
            const tmdbId = match[2];

            const cacheKey = `detail-${type}-${tmdbId}`;
            const cached = getCached(cacheKey);
            if (cached) return res.json(cached);

            const detail = await fetchJSON(
                `${TMDB_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=id-ID&append_to_response=credits,videos`
            );

            const title = detail.title || detail.name || '';
            const year = (detail.release_date || detail.first_air_date || '').split('-')[0];
            const poster = detail.poster_path ? `${TMDB_IMG}/w500${detail.poster_path}` : '';
            const backdrop = detail.backdrop_path ? `${TMDB_IMG}/w1280${detail.backdrop_path}` : '';
            const genres = (detail.genres || []).map(g => g.name).join(', ');
            const cast = (detail.credits?.cast || []).slice(0, 10).map(c => c.name).join(', ');

            // Build episodes for TV shows
            let episodes = [];
            if (type === 'tv') {
                const numSeasons = detail.number_of_seasons || 1;
                for (let s = 1; s <= Math.min(numSeasons, 5); s++) {
                    try {
                        const seasonData = await fetchJSON(
                            `${TMDB_BASE}/tv/${tmdbId}/season/${s}?api_key=${TMDB_API_KEY}&language=id-ID`
                        );
                        for (const ep of (seasonData.episodes || [])) {
                            episodes.push({
                                title: `S${s}E${ep.episode_number}: ${ep.name || ''}`,
                                season: s,
                                episode: ep.episode_number,
                                embedUrl: getEmbedUrl(tmdbId, 'tv', s, ep.episode_number)
                            });
                        }
                    } catch(e) { /* skip season */ }
                }
            } else {
                episodes = [{
                    title: 'Full Movie',
                    embedUrl: getEmbedUrl(tmdbId, 'movie')
                }];
            }

            const result = {
                success: true,
                data: {
                    id: detail.id,
                    tmdbId: detail.id,
                    title,
                    year,
                    poster,
                    backdrop,
                    rating: detail.vote_average ? detail.vote_average.toFixed(1) : '0',
                    genre: genres,
                    description: detail.overview || '',
                    type,
                    cast,
                    runtime: detail.runtime || (detail.episode_run_time && detail.episode_run_time[0]) || 0,
                    status: detail.status || '',
                    episodes,
                    detailPath: `tmdb:${type}:${tmdbId}`,
                    embedUrl: getEmbedUrl(tmdbId, type)
                }
            };
            setCache(cacheKey, result);
            return res.json(result);
        }

        // ==================== SEARCH ====================
        if (action === 'search') {
            const q = req.query.q || '';
            if (!q) return res.json({ success: true, items: [] });

            const cacheKey = `search-${q}-${page}`;
            const cached = getCached(cacheKey);
            if (cached) return res.json(cached);

            const data = await fetchJSON(
                `${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&language=id-ID&query=${encodeURIComponent(q)}&page=${page}`
            );

            const items = (data.results || [])
                .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
                .map(m => transformMovie(m, m.media_type));

            const result = {
                success: true,
                items,
                hasMore: page < (data.total_pages || 1)
            };
            setCache(cacheKey, result);
            return res.json(result);
        }

        return res.status(404).json({ error: 'Unknown action', action });
    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};
