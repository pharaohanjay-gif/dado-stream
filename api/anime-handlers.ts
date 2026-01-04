import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

const ANIME_API = 'https://www.sankavollerei.com/anime/samehadaku';

export async function handleAnime(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    // Latest anime episodes
    if (action === 'latest' || !action) {
        try {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/recent`, {
                ...config,
                params: { page }
            });
            
            const items = (response.data?.data || []).map((item: any) => ({
                id: item.animeId || item.episodeId,
                urlId: item.episodeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: 'Latest',
                releaseDate: item.releaseDate,
                type: 'Episode'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error('[Anime Latest Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch latest anime' });
        }
    }

    // Trending/Popular anime
    if (action === 'trending' || action === 'popular') {
        try {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/popular`, {
                ...config,
                params: { page }
            });
            
            const items = (response.data?.data || []).map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.tvInfo?.sub || item.tvInfo?.eps || '?',
                rating: item.rating || '?',
                type: item.type || 'TV'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error(`[Anime ${action} Error]:`, error.message);
            return res.status(500).json({ error: `Failed to fetch ${action} anime` });
        }
    }

    // Ongoing anime
    if (action === 'ongoing') {
        try {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/ongoing`, {
                ...config,
                params: { page, order: 'popular' }
            });
            
            const items = (response.data?.data || []).map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.tvInfo?.sub || '?',
                rating: item.rating || '?',
                type: 'Ongoing'
            }));
            
            return res.json(items);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to fetch ongoing anime' });
        }
    }

    // Search anime
    if (action === 'search') {
        try {
            const query = req.query.q || req.query.query;
            const page = req.query.page || '1';
            
            if (!query) {
                return res.status(400).json({ error: 'Query parameter required' });
            }
            
            const response = await axios.get(`${ANIME_API}/search`, {
                ...config,
                params: { q: query, page }
            });
            
            const items = (response.data?.data || []).map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.tvInfo?.sub || '?',
                rating: item.rating || '?',
                type: item.type || 'TV'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error('[Anime Search Error]:', error.message);
            return res.status(500).json({ error: 'Failed to search anime' });
        }
    }

    // Anime detail
    if (action === 'detail') {
        try {
            const urlId = req.query.urlId || req.query.id;
            if (!urlId) {
                return res.status(400).json({ error: 'urlId required' });
            }
            
            const response = await axios.get(`${ANIME_API}/anime/${urlId}`, config);
            const data = response.data?.data;
            
            if (!data) {
                return res.status(404).json({ error: 'Anime not found' });
            }
            
            // Parse episodes
            const episodes = (data.episodeList || []).map((ep: any) => ({
                id: ep.episodeId,
                chapterUrlId: ep.episodeId,
                title: ep.title,
                judul: ep.title,
                releaseDate: ep.releaseDate,
                releasedOn: ep.releaseDate
            }));
            
            const result = {
                id: data.animeId,
                urlId: data.animeId,
                title: data.title,
                judul: data.title,
                poster: data.poster,
                image: data.poster,
                thumbnail_url: data.poster,
                synopsis: data.synopsis?.paragraphs?.join('\n\n') || 'No synopsis available',
                rating: data.rating || '?',
                type: data.type || 'TV',
                status: data.status || 'Unknown',
                releaseDate: data.releaseDate || 'Unknown',
                totalEpisodes: episodes.length,
                genreList: (data.genreList || []).map((g: any) => g.title).join(', '),
                episodes: episodes
            };
            
            return res.json(result);
        } catch (error: any) {
            console.error('[Anime Detail Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch anime detail' });
        }
    }

    // Get video streaming links
    if (action === 'getvideo') {
        try {
            const episodeId = req.query.episodeId || req.query.episode_id || req.query.chapterUrlId;
            if (!episodeId) {
                return res.status(400).json({ error: 'episodeId required' });
            }
            
            console.log('[Anime Video] Fetching episode:', episodeId);
            
            // Get episode detail with streaming servers
            const response = await axios.get(`${ANIME_API}/episode/${episodeId}`, config);
            const data = response.data?.data;
            
            if (!data) {
                console.log('[Anime Video] Episode not found');
                return res.json({
                    data: [],
                    sources: [],
                    subtitles: [],
                    error: 'streaming_unavailable',
                    message: 'Episode tidak ditemukan'
                });
            }
            
            // Get default streaming URL
            const defaultStreamUrl = data.defaultStreamingUrl;
            
            // Get server qualities
            const servers: any[] = [];
            if (data.server?.qualities) {
                for (const quality of data.server.qualities) {
                    const qualityName = quality.title;
                    for (const server of (quality.serverList || [])) {
                        servers.push({
                            quality: qualityName,
                            server: server.title,
                            serverId: server.serverId
                        });
                    }
                }
            }
            
            console.log(`[Anime Video] Found ${servers.length} servers`);
            
            // If we have servers, get the first server's embed URL
            let videoUrl = defaultStreamUrl;
            if (servers.length > 0) {
                try {
                    const firstServer = servers[0];
                    const serverResponse = await axios.get(`${ANIME_API}/server/${firstServer.serverId}`, config);
                    videoUrl = serverResponse.data?.data?.url || defaultStreamUrl;
                    console.log('[Anime Video] Got server URL:', videoUrl?.substring(0, 50));
                } catch (err) {
                    console.error('[Anime Video] Server fetch error:', err);
                }
            }
            
            if (!videoUrl) {
                return res.json({
                    data: [],
                    sources: [],
                    subtitles: [],
                    error: 'streaming_unavailable',
                    message: 'Tidak ada link streaming tersedia'
                });
            }
            
            // Return in format expected by frontend
            const streamArray = [{
                link: videoUrl,
                reso: 'auto'
            }];
            
            return res.json({
                data: [{
                    stream: streamArray.map(s => `link=${s.link};reso=${s.reso}`)
                }],
                sources: [{ url: videoUrl, quality: 'auto' }],
                subtitles: [],
                servers: servers
            });
            
        } catch (error: any) {
            console.error('[Anime Video Error]:', error.message);
            return res.json({
                data: [],
                sources: [],
                subtitles: [],
                error: 'server_error',
                message: 'Gagal mengambil video anime'
            });
        }
    }

    return res.status(404).json({ error: 'Unknown anime action' });
}
