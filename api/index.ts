import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// API endpoints
const API_BASE = 'https://api.sansekai.my.id/api';
const ANIME_API = 'https://itzzzme-anime-api-lovat.vercel.app/api';
const KOMIK_API = 'https://api-manga-five.vercel.app';
const KOMIK_PROVIDER = 'shinigami';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { path } = req.query;
    const pathStr = Array.isArray(path) ? path.join('/') : path || '';

    try {
        // Route handling
        if (pathStr.startsWith('dramabox/')) {
            return await handleDramabox(pathStr.replace('dramabox/', ''), req, res);
        } else if (pathStr.startsWith('anime/')) {
            return await handleAnime(pathStr.replace('anime/', ''), req, res);
        } else if (pathStr.startsWith('komik/')) {
            return await handleKomik(pathStr.replace('komik/', ''), req, res);
        } else if (pathStr.startsWith('proxy/')) {
            return await handleProxy(pathStr.replace('proxy/', ''), req, res);
        }

        return res.status(404).json({ error: 'Not found' });
    } catch (error: any) {
        console.error('API Error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Dramabox handlers
async function handleDramabox(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    if (action === 'latest' || action === 'trending' || action === 'vip' || action === 'foryou') {
        const response = await axios.get(`${API_BASE}/dramabox/${action}`, config);
        // API returns array directly or { data: [...] }
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        return res.json(results);
    }

    if (action === 'dubindo') {
        const classify = req.query.classify || 'terbaru';
        const response = await axios.get(`${API_BASE}/dramabox/dubindo`, {
            ...config,
            params: { classify }
        });
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        return res.json(results);
    }

    if (action === 'search') {
        const q = req.query.q || req.query.query;
        if (!q) return res.status(400).json({ error: 'Query required' });
        const response = await axios.get(`${API_BASE}/dramabox/search`, {
            ...config,
            params: { query: q }
        });
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        return res.json(results);
    }

    if (action === 'detail') {
        const { bookId } = req.query;
        if (!bookId) return res.status(400).json({ error: 'bookId required' });
        const response = await axios.get(`${API_BASE}/dramabox/detail`, {
            ...config,
            params: { bookId }
        });
        // API can return { data: {...} } or object directly
        const result = response.data?.data || response.data;
        return res.json(result);
    }

    if (action === 'allepisode') {
        const { bookId } = req.query;
        if (!bookId) return res.status(400).json({ error: 'bookId required' });
        const response = await axios.get(`${API_BASE}/dramabox/allepisode`, {
            ...config,
            params: { bookId }
        });
        // API returns array directly, not { data: [...] }
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        return res.json(results);
    }

    return res.status(404).json({ error: 'Unknown dramabox action' });
}

// Anime handlers - Matching src/server.ts logic exactly
async function handleAnime(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } };

    // Helper to get home data (used by latest, trending, popular)
    const getHomeData = async () => {
        const response = await axios.get(`${ANIME_API}/`, config);
        return response.data?.results;
    };

    if (action === 'latest') {
        try {
            const homeData = await getHomeData();
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
            return res.json(items);
        } catch (error: any) {
            console.error('[Anime Latest Error]:', error.message);
            return res.status(500).json({ error: 'Failed' });
        }
    }

    if (action === 'trending') {
        try {
            const homeData = await getHomeData();
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
            return res.json(items);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed' });
        }
    }

    if (action === 'popular') {
        try {
            const homeData = await getHomeData();
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
            return res.json(items);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed' });
        }
    }

    if (action === 'movie') {
        try {
            const response = await axios.get(`${ANIME_API}/movie`, {
                ...config,
                params: { page: 1 }
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
            return res.json(items);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed' });
        }
    }

    if (action === 'search') {
        try {
            const q = req.query.q || req.query.query;
            if (!q) return res.json([]);
            
            const response = await axios.get(`${ANIME_API}/search`, {
                ...config,
                params: { keyword: q }  // Use 'keyword' parameter like server.ts
            });
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
            return res.json(items);
        } catch (error: any) {
            console.error('[Anime Search Error]:', error.message);
            return res.status(500).json({ error: 'Failed to search anime' });
        }
    }

    if (action === 'detail') {
        try {
            const idParam = req.query.urlId || req.query.id;
            if (!idParam) return res.status(400).json({ error: 'id required' });
            
            const response = await axios.get(`${ANIME_API}/info`, {
                ...config,
                params: { id: idParam }
            });
            const animeData = response.data?.results?.data || {};
            const animeInfo = animeData?.animeInfo || {};
            
            // Also try to get episodes
            let episodes: any[] = [];
            try {
                const epResponse = await axios.get(`${ANIME_API}/episodes/${idParam}`, config);
                episodes = epResponse.data?.results?.data || [];
            } catch {}
            
            return res.json({
                id: animeInfo.id || idParam,
                urlId: idParam,
                title: animeInfo.title || animeData.title,
                judul: animeInfo.title || animeData.title,
                image: animeInfo.poster || animeData.poster,
                description: animeInfo.description || animeData.overview,
                genres: animeInfo.genres || [],
                status: animeInfo.status,
                type: animeInfo.stats?.type || 'TV',
                rating: animeInfo.stats?.rating,
                episodes: episodes
            });
        } catch (error: any) {
            console.error('[Anime Detail Error]:', error.message);
            return res.status(500).json({ error: 'Failed' });
        }
    }

    if (action === 'getvideo') {
        try {
            const episodeId = req.query.episodeId || req.query.episode_id;
            if (!episodeId) return res.status(400).json({ error: 'episodeId required' });
            
            const response = await axios.get(`${ANIME_API}/stream`, {
                ...config,
                params: { id: episodeId }
            });
            const streamData = response.data?.results?.data?.streamingLink || response.data?.results || {};
            
            return res.json({
                sources: streamData.link?.file ? [{ url: streamData.link.file, quality: 'auto' }] : [],
                subtitles: streamData.tracks || []
            });
        } catch (error: any) {
            console.error('[Anime Video Error]:', error.message);
            return res.status(500).json({ error: 'Failed' });
        }
    }

    return res.status(404).json({ error: 'Unknown anime action' });
}

// Komik handlers
async function handleKomik(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    if (action === 'recommended' || action === 'popular') {
        try {
            const response = await axios.get(`${KOMIK_API}/popular`, {
                ...config,
                params: { provider: KOMIK_PROVIDER }
            });
            return res.json(response.data?.data || []);
        } catch (error: any) {
            console.error('[Komik Popular Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch popular komik' });
        }
    }

    if (action === 'search') {
        try {
            const q = req.query.q || req.query.query || req.query.keyword;
            if (!q) return res.status(400).json({ error: 'Query required' });
            const response = await axios.get(`${KOMIK_API}/search`, {
                ...config,
                params: { keyword: q, provider: KOMIK_PROVIDER }
            });
            return res.json(response.data?.data || []);
        } catch (error: any) {
            console.error('[Komik Search Error]:', error.message);
            return res.status(500).json({ error: 'Failed to search komik' });
        }
    }

    if (action === 'detail') {
        try {
            const mangaId = req.query.manga_id || req.query.mangaId || req.query.id;
            if (!mangaId) return res.status(400).json({ error: 'manga_id required' });
            
            const response = await axios.get(`${KOMIK_API}/detail/${mangaId}`, {
                ...config,
                params: { provider: KOMIK_PROVIDER }
            });
            
            const raw = response.data?.data;
            if (!raw) {
                return res.status(404).json({ error: 'Komik not found' });
            }
            
            // Map to detail format like server.ts
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
                genres: (raw.genre || []).map((g: any) => typeof g === 'string' ? g : g.title)
            };
            
            return res.json({ success: true, data: detail });
        } catch (error: any) {
            console.error('[Komik Detail Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch komik detail' });
        }
    }

    if (action === 'chapterlist') {
        try {
            const mangaId = req.query.manga_id || req.query.mangaId || req.query.id;
            if (!mangaId) return res.status(400).json({ error: 'manga_id required' });
            
            const response = await axios.get(`${KOMIK_API}/detail/${mangaId}`, {
                ...config,
                params: { provider: KOMIK_PROVIDER }
            });
            
            const chapters = (response.data?.data?.chapter || []).map((ch: any) => ({
                chapter_id: ch.href?.split('/').pop() || ch.id,
                title: ch.title,
                chapter_number: ch.number || ch.title,
                date: ch.date
            }));
            
            return res.json({ success: true, chapters });
        } catch (error: any) {
            console.error('[Komik Chapterlist Error]:', error.message);
            return res.json({ success: false, chapters: [] });
        }
    }

    if (action === 'getimage') {
        try {
            const chapterId = req.query.chapter_id || req.query.chapterId || req.query.id;
            if (!chapterId) return res.status(400).json({ error: 'chapter_id required' });
            
            // Try /read/ endpoint first (like server.ts), then /chapter/
            let response;
            try {
                response = await axios.get(`${KOMIK_API}/read/${chapterId}`, {
                    ...config,
                    params: { provider: KOMIK_PROVIDER }
                });
            } catch {
                response = await axios.get(`${KOMIK_API}/chapter/${chapterId}`, {
                    ...config,
                    params: { provider: KOMIK_PROVIDER }
                });
            }
            
            // Handle different response formats
            const panels = response.data?.data?.[0]?.panel || response.data?.data || [];
            return res.json({ success: true, images: panels });
        } catch (error: any) {
            console.error('[Komik Getimage Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch chapter images' });
        }
    }
        return res.json({ success: true, images: panels });
    }

    return res.status(404).json({ error: 'Unknown komik action' });
}

// Proxy handler
async function handleProxy(action: string, req: VercelRequest, res: VercelResponse) {
    if (action === 'image') {
        const { url } = req.query;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL required' });
        }

        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': new URL(url).origin
                }
            });

            const contentType = response.headers['content-type'] || 'image/jpeg';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(Buffer.from(response.data));
        } catch {
            return res.status(404).json({ error: 'Image not found' });
        }
    }

    if (action === 'video') {
        const { url } = req.query;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL required' });
        }

        // Determine referer based on URL pattern
        let referer = new URL(url).origin;
        if (url.includes('/_v7/') || url.includes('megacloud') || url.includes('rapid-cloud')) {
            referer = 'https://megacloud.tv';
        }

        try {
            const response = await axios.get(url, {
                responseType: 'stream',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': referer,
                    'Origin': referer
                }
            });

            res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
            res.setHeader('Access-Control-Allow-Origin', '*');
            response.data.pipe(res);
        } catch {
            return res.status(404).json({ error: 'Video not found' });
        }
    }

    return res.status(404).json({ error: 'Unknown proxy action' });
}
