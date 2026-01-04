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
        return res.json(response.data?.data || []);
    }

    if (action === 'dubindo') {
        const classify = req.query.classify || 'terbaru';
        const response = await axios.get(`${API_BASE}/dramabox/dubindo`, {
            ...config,
            params: { classify }
        });
        return res.json(response.data?.data || []);
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
        return res.json(response.data?.data || response.data);
    }

    if (action === 'allepisode') {
        const { bookId } = req.query;
        if (!bookId) return res.status(400).json({ error: 'bookId required' });
        const response = await axios.get(`${API_BASE}/dramabox/allepisode`, {
            ...config,
            params: { bookId }
        });
        return res.json(response.data?.data || []);
    }

    return res.status(404).json({ error: 'Unknown dramabox action' });
}

// Anime handlers
async function handleAnime(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    if (action === 'latest') {
        const response = await axios.get(`${ANIME_API}/latest`, config);
        return res.json(response.data?.results?.data || response.data?.data || []);
    }

    if (action === 'trending' || action === 'popular') {
        const response = await axios.get(`${ANIME_API}/${action}`, config);
        return res.json(response.data?.results?.data || response.data?.data || []);
    }

    if (action === 'movie') {
        const response = await axios.get(`${ANIME_API}/movies`, config);
        return res.json(response.data?.results?.data || response.data?.data || []);
    }

    if (action === 'search') {
        const q = req.query.q || req.query.query;
        if (!q) return res.status(400).json({ error: 'Query required' });
        const response = await axios.get(`${ANIME_API}/search`, {
            ...config,
            params: { q }
        });
        const results = response.data?.results?.data || response.data?.results || response.data?.data || [];
        return res.json(results);
    }

    if (action === 'detail') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });
        const response = await axios.get(`${ANIME_API}/info`, {
            ...config,
            params: { id }
        });
        return res.json(response.data?.results || response.data);
    }

    if (action === 'getvideo') {
        const { episodeId } = req.query;
        if (!episodeId) return res.status(400).json({ error: 'episodeId required' });
        const response = await axios.get(`${ANIME_API}/source`, {
            ...config,
            params: { episodeId, server: 'vidstreaming', category: 'sub' }
        });
        return res.json(response.data?.results || response.data);
    }

    return res.status(404).json({ error: 'Unknown anime action' });
}

// Komik handlers
async function handleKomik(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    if (action === 'recommended' || action === 'popular') {
        const response = await axios.get(`${KOMIK_API}/popular`, {
            ...config,
            params: { provider: KOMIK_PROVIDER }
        });
        return res.json(response.data?.data || []);
    }

    if (action === 'search') {
        const q = req.query.q || req.query.query || req.query.keyword;
        if (!q) return res.status(400).json({ error: 'Query required' });
        const response = await axios.get(`${KOMIK_API}/search`, {
            ...config,
            params: { keyword: q, provider: KOMIK_PROVIDER }
        });
        return res.json(response.data?.data || []);
    }

    if (action === 'detail') {
        const mangaId = req.query.manga_id || req.query.mangaId || req.query.id;
        if (!mangaId) return res.status(400).json({ error: 'manga_id required' });
        const response = await axios.get(`${KOMIK_API}/detail/${mangaId}`, {
            ...config,
            params: { provider: KOMIK_PROVIDER }
        });
        return res.json({ success: true, data: response.data?.data });
    }

    if (action === 'chapterlist') {
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
    }

    if (action === 'getimage') {
        const chapterId = req.query.chapter_id || req.query.chapterId || req.query.id;
        if (!chapterId) return res.status(400).json({ error: 'chapter_id required' });
        const response = await axios.get(`${KOMIK_API}/chapter/${chapterId}`, {
            ...config,
            params: { provider: KOMIK_PROVIDER }
        });
        const panels = response.data?.data || [];
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
