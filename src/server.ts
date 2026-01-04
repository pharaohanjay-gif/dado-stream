import express, { Request, Response } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import axios from 'axios';
import dns from 'dns';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import compression from 'compression';

// Import database and services
import { connectDatabase } from './config/database';
import { initializeSocket } from './services/socket.service';

// Import middleware
import { trackAnalytics } from './middleware/track.middleware';
import { authenticateToken } from './middleware/auth.middleware';
import { requireAdmin } from './middleware/admin.middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import analyticsRoutes from './routes/analytics.routes';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const API_BASE = process.env.SANSEKAI_API_BASE || 'https://api.sansekai.my.id/api';

// Configure DNS for better connectivity
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

// ==========================================================================
// AGGRESSIVE IN-MEMORY CACHE (Speed Boost)
// ==========================================================================
interface CacheEntry {
    data: any;
    timestamp: number;
}

const apiCache: Map<string, CacheEntry> = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache
const SHORT_CACHE = 10 * 60 * 1000; // 10 minutes for search

function getCached(key: string): any | null {
    const entry = apiCache.get(key);
    if (entry && (Date.now() - entry.timestamp) < CACHE_DURATION) {
        console.log(`[CACHE HIT] ${key}`);
        return entry.data;
    }
    return null;
}

function setCache(key: string, data: any, duration: number = CACHE_DURATION): void {
    apiCache.set(key, { data, timestamp: Date.now() });
    // Auto cleanup old entries every 10 minutes
    if (apiCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of apiCache) {
            if (now - v.timestamp > duration * 2) apiCache.delete(k);
        }
    }
}

// ==========================================================================
// MIDDLEWARE
// ==========================================================================

// GZIP Compression - Makes responses 70% smaller
app.use(compression());

// Security
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '10000') // Increased for heavy usage
});
app.use('/api/', limiter);

// CORS
app.use(cors({
    origin: process.env.SOCKET_CORS_ORIGIN || '*',
    credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// Serve static files
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// Analytics tracking (for non-API routes)
app.use(trackAnalytics);

// ==========================================================================
// AUTHENTICATION ROUTES (Public)
// ==========================================================================

app.use('/api/auth', authRoutes);

// ==========================================================================
// PUBLIC ANALYTICS (Must be before protected routes)
// ==========================================================================
app.post('/api/analytics/track', (req, res) => {
    // Analytics is handled by the trackAnalytics middleware globally
    res.json({ success: true });
});

// ==========================================================================
// ADMIN & ANALYTICS ROUTES (Protected)
// ==========================================================================
app.use('/api/admin', authenticateToken, requireAdmin, adminRoutes);
app.use('/api/analytics', authenticateToken, requireAdmin, analyticsRoutes);

// ==========================================================================
// API REQUEST HELPER WITH RETRY
// ==========================================================================
const https = require('https');
const keepAliveAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });

async function fetchWithRetry(url: string, params: any = {}, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                params,
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                httpsAgent: keepAliveAgent
            });
            return response.data;
        } catch (error: any) {
            console.log(`[Retry ${i + 1}/${retries}] ${url} - ${error.message}`);
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }
}

// ==========================================================================
// DRAMABOX API ROUTES (Public with fallback)
// ==========================================================================

app.get('/api/dramabox/latest', async (req: Request, res: Response) => {
    const cacheKey = 'dramabox_latest';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const data = await fetchWithRetry(`${API_BASE}/dramabox/latest`);
        setCache(cacheKey, data);
        res.json(data);
    } catch (error: any) {
        console.error('[Dramabox Latest] All retries failed:', error.message);
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/dramabox/trending', async (req: Request, res: Response) => {
    const cacheKey = 'dramabox_trending';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const data = await fetchWithRetry(`${API_BASE}/dramabox/trending`);
        setCache(cacheKey, data);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/dramabox/vip', async (req: Request, res: Response) => {
    const cacheKey = 'dramabox_vip';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const data = await fetchWithRetry(`${API_BASE}/dramabox/vip`);
        setCache(cacheKey, data);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/dramabox/foryou', async (req: Request, res: Response) => {
    const cacheKey = 'dramabox_foryou';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const data = await fetchWithRetry(`${API_BASE}/dramabox/foryou`);
        setCache(cacheKey, data);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/dramabox/dubindo', async (req: Request, res: Response) => {
    const classify = (req.query.classify as string) || 'terbaru';
    const cacheKey = `dramabox_dubindo_${classify}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const data = await fetchWithRetry(`${API_BASE}/dramabox/dubindo?classify=${classify}`);
        setCache(cacheKey, data);
        res.json(data);
    } catch (error: any) {
        console.error('[Dubindo Error]:', error.message);
        res.status(500).json({ error: 'Failed to load dubindo' });
    }
});

app.get('/api/dramabox/detail', async (req: Request, res: Response) => {
    const { bookId } = req.query;
    const cacheKey = `dramabox_detail_${bookId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const response = await axios.get(`${API_BASE}/dramabox/detail`, {
            params: { bookId },
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        setCache(cacheKey, response.data, SHORT_CACHE);
        res.json(response.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/dramabox/allepisode', async (req: Request, res: Response) => {
    const { bookId } = req.query;
    const cacheKey = `dramabox_allepisode_${bookId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const response = await axios.get(`${API_BASE}/dramabox/allepisode`, {
            params: { bookId },
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        setCache(cacheKey, response.data, SHORT_CACHE);
        res.json(response.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/dramabox/search', async (req: Request, res: Response) => {
    try {
        const q = req.query.q || req.query.query;
        if (!q) return res.status(400).json({ error: 'Query parameter required' });
        
        const response = await axios.get(`${API_BASE}/dramabox/search`, {
            params: { query: q },
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        
        // API returns array directly, not wrapped in data property
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        res.json(results);
    } catch (error: any) {
        console.error('[Drama Search Error]:', error.message);
        res.status(500).json({ error: 'Failed to search dramas' });
    }
});

// ==========================================================================
// ==========================================================================
// ANIME API ROUTES (Using HiAnime API - Self-Hosted)
// ==========================================================================

const ANIME_API = 'https://itzzzme-anime-api-lovat.vercel.app/api';

// Cache the home data once and reuse for latest/trending/popular
app.get('/api/anime/latest', async (req: Request, res: Response) => {
    const cacheKey = 'anime_home';
    let homeData = getCached(cacheKey);

    if (!homeData) {
        try {
            const response = await axios.get(`${ANIME_API}/`, { timeout: 15000 });
            homeData = response.data?.results;
            setCache(cacheKey, homeData);
        } catch (error: any) {
            console.error('[Anime API] Home Error:', error.message);
            return res.status(500).json({ error: 'Failed' });
        }
    }

    const items = (homeData?.latestEpisode || []).map((item: any) => ({
        id: item.id,
        urlId: item.id,
        judul: item.title,
        title: item.title,
        image: item.poster,
        thumbnail_url: item.poster,
        episode: item.tvInfo?.sub || item.tvInfo?.eps || '?',
        rating: item.adultContent ? 'R' : 'PG',
        type: item.tvInfo?.showType || 'TV'
    }));
    res.json(items);
});

app.get('/api/anime/trending', async (req: Request, res: Response) => {
    const cacheKey = 'anime_home';
    let homeData = getCached(cacheKey);

    if (!homeData) {
        try {
            const response = await axios.get(`${ANIME_API}/`, { timeout: 15000 });
            homeData = response.data?.results;
            setCache(cacheKey, homeData);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed' });
        }
    }

    const trending = homeData?.trending || homeData?.topTen?.today || [];
    const items = trending.map((item: any) => ({
        id: item.id,
        urlId: item.id,
        judul: item.title,
        title: item.title,
        image: item.poster,
        thumbnail_url: item.poster,
        episode: item.tvInfo?.sub || '?',
        score: item.number || 'Hot',
        type: 'Trending'
    }));
    res.json(items);
});

app.get('/api/anime/popular', async (req: Request, res: Response) => {
    const cacheKey = 'anime_home';
    let homeData = getCached(cacheKey);

    if (!homeData) {
        try {
            const response = await axios.get(`${ANIME_API}/`, { timeout: 15000 });
            homeData = response.data?.results;
            setCache(cacheKey, homeData);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed' });
        }
    }

    const popular = homeData?.mostPopular || homeData?.topTen?.month || [];
    const items = popular.map((item: any) => ({
        id: item.id,
        urlId: item.id,
        judul: item.title,
        title: item.title,
        image: item.poster,
        thumbnail_url: item.poster,
        episode: item.tvInfo?.sub || '?',
        score: item.number || 'Top',
        type: 'Popular'
    }));
    res.json(items);
});

app.get('/api/anime/movie', async (req: Request, res: Response) => {
    try {
        // Get movie category
        const response = await axios.get(`${ANIME_API}/movie`, {
            params: { page: 1 },
            timeout: 15000
        });
        const items = (response.data?.results?.data || []).map((item: any) => ({
            id: item.id,
            urlId: item.id,
            judul: item.title,
            title: item.title,
            image: item.poster,
            thumbnail_url: item.poster,
            episode: 'Movie',
            type: 'Movie'
        }));
        res.json(items);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/anime/search', async (req: Request, res: Response) => {
    try {
        const { q, query } = req.query;
        const qParam = query || q;
        if (!qParam) {
            return res.json([]);
        }
        const response = await axios.get(`${ANIME_API}/search`, {
            params: { keyword: qParam },
            timeout: 15000
        });
        // Handle results.data structure from itzzzme API
        const rawData = response.data?.results?.data || response.data?.results || [];
        const items = rawData.map((item: any) => ({
            id: item.id,
            urlId: item.id,
            judul: item.title,
            title: item.title,
            image: item.poster,
            thumbnail_url: item.poster,
            episode: item.tvInfo?.sub || item.duration || '?',
            type: item.tvInfo?.showType || 'Anime'
        }));
        res.json(items);
    } catch (error: any) {
        console.error('[Anime Search Error]:', error.message);
        res.status(500).json({ error: 'Failed to search anime' });
    }
});

app.get('/api/anime/detail', async (req: Request, res: Response) => {
    try {
        const { id, urlId } = req.query;
        const idParam = (urlId || id) as string;
        
        // Get anime info using itzzzme API
        const response = await axios.get(`${ANIME_API}/info`, { 
            params: { id: idParam },
            timeout: 15000 
        });
        const animeData = response.data?.results?.data || {};
        const animeInfo = animeData?.animeInfo || {};

        let episodes: any[] = [];
        try {
            const epResponse = await axios.get(`${ANIME_API}/episodes/${idParam}`, { timeout: 15000 });
            episodes = (epResponse.data?.results?.episodes || []).map((ep: any) => ({
                id: ep.id,
                urlId: ep.id,
                judul: ep.title ? `Episode ${ep.episode_no}: ${ep.title}` : `Episode ${ep.episode_no}`,
                episode: ep.episode_no
            }));
        } catch (e: any) {
            console.error('[Anime Detail] Ep fetch failed:', e.message);
        }

        const mappedData = {
            id: animeData.id,
            urlId: animeData.id,
            judul: animeData.title,
            title: animeData.title,
            image: animeData.poster,
            cover_image_url: animeData.poster,
            synopsis: animeInfo.Overview || animeData.description,
            description: animeInfo.Overview || animeData.description,
            rating: animeInfo['MAL Score'],
            status: animeInfo.Status || 'Ongoing',
            type: animeData.showType || 'TV',
            genres: animeInfo.Genres || [],
            episodes: episodes
        };
        res.json(mappedData);
    } catch (error: any) {
        console.error('[Anime Detail] Failed:', error.message);
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/anime/getvideo', async (req: Request, res: Response) => {
    try {
        const { chapterUrlId } = req.query;
        if (!chapterUrlId) return res.status(400).json({ error: 'chapterUrlId required' });

        console.log('[Anime GetVideo] Request for:', chapterUrlId);

        // itzzzme API uses /stream endpoint
        // Format episode id: anime-id?ep=123456
        const episodeId = chapterUrlId as string;
        
        // Define servers to try - HiAnime uses hd-1, hd-2, etc.
        const servers = ['hd-1', 'hd-2', 'hd-3'];
        const types = ['sub', 'dub'];
        let videoData = null;

        // Try all servers in parallel for faster response
        for (const type of types) {
            const serverPromises = servers.map(async (server) => {
                try {
                    console.log(`[Anime GetVideo] Trying ${server} (${type})`);
                    const response = await axios.get(`${ANIME_API}/stream`, {
                        params: { 
                            id: episodeId, 
                            server: server, 
                            type: type 
                        },
                        timeout: 30000
                    });
                    
                    const streamingLink = response.data?.results?.streamingLink;
                    if (streamingLink && streamingLink.link?.file) {
                        console.log(`[Anime GetVideo] ${server} (${type}): Got stream!`);
                        return { 
                            streamingLink,
                            server
                        };
                    }
                } catch (e: any) {
                    console.log(`[Anime GetVideo] ${server} (${type}) failed:`, e.message);
                }
                return null;
            });

            const results = await Promise.all(serverPromises);
            videoData = results.find(r => r !== null);
            
            if (videoData) break; // Found sources, exit type loop
        }

        if (!videoData || !videoData.streamingLink) {
            console.log('[Anime GetVideo] No sources found for:', chapterUrlId);
            return res.status(404).json({ error: 'No video sources found for this episode' });
        }

        console.log('[Anime GetVideo] Found stream from server:', videoData.server);

        const stream = videoData.streamingLink;
        
        // Map to format app.js expects: { data: [ { stream: [ { link: '', reso: '' } ] } ] }
        const formatted = {
            data: [{
                stream: [{
                    link: stream.link?.file,
                    reso: 'Auto',
                    isM3U8: stream.link?.type === 'hls'
                }],
                tracks: stream.tracks,
                intro: stream.intro,
                outro: stream.outro
            }]
        };
        res.json(formatted);
    } catch (error: any) {
        console.error('[Anime GetVideo] Failed:', error.message);
        res.status(500).json({ error: 'Failed to get video' });
    }
});

// ==========================================================================
// KOMIK API ROUTES
// ==========================================================================

const KOMIK_API = 'https://api-manga-five.vercel.app';
const KOMIK_PROVIDER = 'shinigami';

app.get('/api/komik/latest', async (req: Request, res: Response) => {
    const cacheKey = 'komik_latest';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const response = await axios.get(`${KOMIK_API}/terbaru`, {
            params: { provider: KOMIK_PROVIDER, page: 1 },
            timeout: 5000
        });

        const mappedData = (response.data?.data || []).map((item: any) => ({
            id: item.href.split('/').pop(),
            manga_id: item.href.split('/').pop(),
            title: item.title,
            judul: item.title,
            image: item.thumbnail,
            cover_image_url: item.thumbnail,
            status: item.status || 'Ongoing',
            type: item.type || 'Manhwa',
            episode: item.chapter || '?'
        }));

        setCache(cacheKey, mappedData);
        res.json(mappedData);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/komik/recommended', async (req: Request, res: Response) => {
    const cacheKey = 'komik_recommended';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const response = await axios.get(`${KOMIK_API}/recommended`, {
            params: { provider: KOMIK_PROVIDER },
            timeout: 5000
        });
        const mappedData = (response.data?.data || []).map((item: any) => ({
            manga_id: item.href.split('/').pop(),
            title: item.title,
            judul: item.title,
            image: item.thumbnail,
            cover_image_url: item.thumbnail
        }));
        setCache(cacheKey, mappedData);
        res.json(mappedData);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/komik/popular', async (req: Request, res: Response) => {
    const cacheKey = 'komik_popular';
    const cached = getCached(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    try {
        const response = await axios.get(`${KOMIK_API}/popular`, {
            params: { provider: KOMIK_PROVIDER },
            timeout: 5000
        });
        const mappedData = (response.data?.data || []).map((item: any) => ({
            id: item.href.split('/').pop(),
            manga_id: item.href.split('/').pop(),
            title: item.title,
            judul: item.title,
            image: item.thumbnail,
            cover_image_url: item.thumbnail
        }));
        setCache(cacheKey, mappedData);
        res.json({ success: true, data: mappedData });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/komik/search', async (req: Request, res: Response) => {
    try {
        const { q, query } = req.query;
        const qParam = query || q;
        const response = await axios.get(`${KOMIK_API}/search`, {
            params: { keyword: qParam, provider: KOMIK_PROVIDER },
            timeout: 12000
        });
        const mappedData = (response.data?.data || []).map((item: any) => ({
            id: item.href.split('/').pop(),
            manga_id: item.href.split('/').pop(),
            title: item.title,
            judul: item.title,
            image: item.thumbnail,
            cover_image_url: item.thumbnail,
            type: item.type || 'Manga',
            episode: item.chapter || '?'
        }));
        res.json(mappedData);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/komik/detail', async (req: Request, res: Response) => {
    try {
        const mangaId = req.query.manga_id || req.query.mangaId || req.query.id;
        if (!mangaId) return res.status(400).json({ error: 'manga_id required' });

        const response = await axios.get(`${KOMIK_API}/detail/${mangaId}`, {
            params: { provider: KOMIK_PROVIDER },
            timeout: 15000
        });

        const raw = response.data?.data;
        if (!raw) return res.status(404).json({ error: 'Not found' });

        // Map to detail format
        const detail = {
            title: raw.title,
            judul: raw.title,
            description: raw.description,
            synopsis: raw.description,
            status: raw.status,
            author: raw.author,
            rating: raw.rating,
            cover: raw.thumbnail,
            thumbnail: raw.thumbnail,
            genres: (raw.genre || []).map((g: any) => g.title)
        };

        res.json({ success: true, data: detail });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/komik/chapterlist', async (req: Request, res: Response) => {
    try {
        const mangaId = req.query.manga_id || req.query.mangaId || req.query.id;
        const response = await axios.get(`${KOMIK_API}/detail/${mangaId}`, {
            params: { provider: KOMIK_PROVIDER },
            timeout: 15000
        });

        const chapters = (response.data?.data?.chapter || []).map((ch: any) => ({
            chapter_id: ch.href.split('/').pop(),
            title: ch.title,
            chapter_number: ch.number || ch.title,
            date: ch.date
        }));

        res.json({ success: true, chapters });
    } catch (error: any) {
        res.status(500).json({ success: false, chapters: [] });
    }
});

app.get('/api/komik/chapter', async (req: Request, res: Response) => {
    try {
        // Accept chapter_id, chapterId, or id
        const chapterId = req.query.chapter_id || req.query.chapterId || req.query.id;
        if (!chapterId) {
            return res.status(400).json({ error: 'chapter_id required' });
        }

        const response = await axios.get(`${API_BASE}/komik/chapter`, {
            params: { chapter_id: chapterId, type: 'mirror' },
            timeout: 15000
        });
        res.json(response.data);
    } catch (error: any) {
        console.error('[Komik Chapter Error]:', error.message);
        res.status(500).json({ error: 'Failed to fetch chapter', message: error.message });
    }
});

// Get komik chapter images
app.get('/api/komik/getimage', async (req: Request, res: Response) => {
    const chapterId = req.query.chapter_id || req.query.chapterId || req.query.id;
    if (!chapterId) return res.status(400).json({ error: 'chapter_id required' });

    try {
        const response = await axios.get(`${KOMIK_API}/read/${chapterId}`, {
            params: { provider: KOMIK_PROVIDER },
            timeout: 20000
        });

        const panels = response.data?.data?.[0]?.panel || [];
        // Return both array and joined string for compatibility
        res.json({
            success: true,
            images: panels,
            data: {
                chapter: {
                    data: panels
                }
            }
        });
    } catch (error: any) {
        console.error('[New Komik API] Read Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch chapter images' });
    }
});

// ==========================================================================
// PROXY ROUTES
// ==========================================================================

app.get('/api/proxy/image', async (req: Request, res: Response) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).send('URL required');
        }

        let referer = 'https://www.google.com/';
        const urlStr = String(url);
        if (urlStr.includes('shngm.id') || urlStr.includes('shinigami')) {
            referer = 'https://shngm.id/';
        } else if (urlStr.includes('mangadex')) {
            referer = 'https://mangadex.org/';
        }

        const response = await axios.get(url as string, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': referer
            }
        });

        res.set('Content-Type', response.headers['content-type']);
        res.send(response.data);
    } catch (error: any) {
        console.error('[Proxy Error] Image:', error.message);
        res.status(500).send('Failed to proxy image');
    }
});

app.get('/api/proxy/video', async (req: Request, res: Response) => {
    try {
        const { url, referer: customReferer } = req.query;
        if (!url) {
            return res.status(400).send('URL required');
        }

        const videoUrl = url as string;
        const isM3U8 = videoUrl.includes('.m3u8');

        // HiAnime CDN detection - use URL pattern instead of domain list
        // All HiAnime CDN URLs have /_v7/ path pattern
        const isHiAnimeCDN = videoUrl.includes('/_v7/') || 
            videoUrl.includes('megacloud') || 
            videoUrl.includes('rabbitstream') ||
            videoUrl.includes('dokicloud') ||
            videoUrl.includes('vidstream');

        // Determine referer based on URL or use custom
        let referer = customReferer as string || 'https://www.dramabox.com/';
        if (videoUrl.includes('animekita')) {
            referer = 'https://animekita.org/';
        } else if (videoUrl.includes('skuy.co.id')) {
            referer = 'https://anichin.mom/';
        } else if (isHiAnimeCDN) {
            referer = 'https://megacloud.blog/';
        }

        console.log(`[Proxy Video] URL: ${videoUrl.substring(0, 50)}... Referer: ${referer}`);

        // For M3U8 files, we need to rewrite URLs inside the playlist
        if (isM3U8) {
            const response = await axios.get(videoUrl, {
                responseType: 'text',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': referer,
                    'Origin': new URL(referer).origin,
                    'Accept': '*/*'
                },
                maxRedirects: 5,
                validateStatus: (status) => status >= 200 && status < 400
            });

            let m3u8Content = response.data as string;
            
            // Get base URL for resolving relative paths
            const baseUrl = videoUrl.substring(0, videoUrl.lastIndexOf('/') + 1);
            
            // Rewrite URLs in M3U8 to go through proxy
            // Match lines that are URLs (not starting with #)
            const lines = m3u8Content.split('\n');
            const rewrittenLines = lines.map(line => {
                const trimmedLine = line.trim();
                // Skip empty lines and comment lines (starting with #)
                if (!trimmedLine || trimmedLine.startsWith('#')) {
                    // But check for URI in EXT-X-KEY or EXT-X-MAP
                    if (trimmedLine.includes('URI="')) {
                        return trimmedLine.replace(/URI="([^"]+)"/g, (match, uri) => {
                            const absoluteUri = uri.startsWith('http') ? uri : baseUrl + uri;
                            return `URI="/api/proxy/video?url=${encodeURIComponent(absoluteUri)}"`;
                        });
                    }
                    return line;
                }
                // This is a segment URL
                const absoluteUrl = trimmedLine.startsWith('http') ? trimmedLine : baseUrl + trimmedLine;
                return `/api/proxy/video?url=${encodeURIComponent(absoluteUrl)}`;
            });
            
            const modifiedContent = rewrittenLines.join('\n');
            
            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            res.set('Access-Control-Allow-Origin', '*');
            res.send(modifiedContent);
            return;
        }

        // For non-M3U8 files (video segments, etc.), stream directly
        const response = await axios.get(videoUrl, {
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': referer,
                'Origin': new URL(referer).origin,
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
                'Range': req.headers.range || ''
            },
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400
        });

        // Set response headers
        let contentType = response.headers['content-type'] || 'video/mp4';
        if (videoUrl.includes('.ts')) {
            contentType = 'video/mp2t';
        }
        
        res.set('Content-Type', contentType);
        res.set('Accept-Ranges', 'bytes');
        res.set('Access-Control-Allow-Origin', '*');

        if (response.headers['content-length']) {
            res.set('Content-Length', response.headers['content-length']);
        }

        if (response.headers['content-range']) {
            res.set('Content-Range', response.headers['content-range']);
            res.status(206);
        } else {
            res.status(200);
        }

        // Pipe video stream
        response.data.pipe(res);

        // Handle stream errors
        response.data.on('error', (err: any) => {
            console.error('[Video Stream Error]:', err.message);
            if (!res.headersSent) {
                res.status(500).send('Video stream error');
            }
        });

    } catch (error: any) {
        console.error('[Proxy Error] Video:', error.message);
        console.error('URL:', req.query.url);
        if (!res.headersSent) {
            res.status(500).send('Failed to proxy video: ' + error.message);
        }
    }
});

// ==========================================================================
// INITIALIZE & START SERVER
// ==========================================================================

// ==========================================================================
// PRELOAD/WARM CACHE - Data langsung tersedia saat user akses
// ==========================================================================
async function warmUpCache() {
    console.log('[CACHE WARMUP] Starting background preload...');
    
    const preloadTasks = [
        { name: 'dramabox_latest', url: `${API_BASE}/dramabox/latest` },
        { name: 'dramabox_trending', url: `${API_BASE}/dramabox/trending` },
        { name: 'anime_home', url: `${ANIME_API}/` },
        { name: 'komik_popular', url: `${KOMIK_API}/popular?provider=${KOMIK_PROVIDER}` },
    ];

    for (const task of preloadTasks) {
        try {
            // Skip if already cached
            if (getCached(task.name)) {
                console.log(`[CACHE WARMUP] ${task.name} already cached`);
                continue;
            }

            const response = await axios.get(task.url, { 
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            if (task.name === 'komik_popular') {
                // Map komik data
                const mappedData = (response.data?.data || []).map((item: any) => ({
                    id: item.href?.split('/').pop() || '',
                    manga_id: item.href?.split('/').pop() || '',
                    title: item.title,
                    judul: item.title,
                    image: item.thumbnail,
                    cover_image_url: item.thumbnail
                }));
                setCache(task.name, mappedData);
            } else if (task.name === 'anime_home') {
                // Store the results object from itzzzme API
                setCache(task.name, response.data?.results);
            } else {
                setCache(task.name, response.data);
            }
            
            console.log(`[CACHE WARMUP] ✅ ${task.name} preloaded`);
        } catch (error: any) {
            console.log(`[CACHE WARMUP] ⚠️ ${task.name} failed: ${error.message}`);
        }
    }
    
    console.log('[CACHE WARMUP] Done! Data ready for instant access.');
}

// Refresh cache periodically (every 30 minutes)
function startCacheRefresh() {
    setInterval(async () => {
        console.log('[CACHE REFRESH] Refreshing data in background...');
        // Clear old cache
        apiCache.clear();
        await warmUpCache();
    }, 30 * 60 * 1000);
}

async function startServer() {
    try {
        // Connect to MongoDB
        await connectDatabase();

        // Initialize Socket.IO
        initializeSocket(httpServer);

        // Start HTTP server
        httpServer.listen(PORT, async () => {
            console.log('');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🎬 WIBUSTREAM 2.0 - FULL SYSTEM ACTIVE');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            console.log(`🏠 User App: http://localhost:${PORT}`);
            console.log(`🔐 Admin Panel: http://localhost:${PORT}/admin`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('');
            console.log('✅ Features Active:');
            console.log('  - MongoDB Analytics');
            console.log('  - Real-time Viewer Tracking');
            console.log('  - GeoIP Location (Offline)');
            console.log('  - JWT Authentication');
            console.log('  - Admin Dashboard');
            console.log('  - 🚀 Instant Cache Warmup');
            console.log('');
            
            // Preload data in background after server starts
            warmUpCache();
            startCacheRefresh();
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
