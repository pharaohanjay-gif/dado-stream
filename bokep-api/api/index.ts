import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

interface Video {
    id: string;
    title: string;
    slug: string;
    poster: string;
    categories: string[];
    sources: { url: string; quality: string }[];
    extracted_at?: string;
    page_url?: string;
    createdAt?: string;
}

// Cache videos in memory with TTL (5 minutes)
let videosCache: Video[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// GitHub raw URL for videos.json
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/pharaohanjay-gif/dado-stream/master/bokep-api/videos.json';

async function loadVideos(): Promise<Video[]> {
    const now = Date.now();
    
    // Return cache if still valid
    if (videosCache && (now - cacheTimestamp) < CACHE_TTL) {
        return videosCache;
    }
    
    try {
        // Fetch fresh data from GitHub
        const response = await axios.get(GITHUB_RAW_URL, {
            timeout: 10000,
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        videosCache = response.data;
        cacheTimestamp = now;
        console.log(`[Videos] Loaded ${videosCache?.length || 0} videos from GitHub`);
        return videosCache || [];
    } catch (e: any) {
        console.error('[Videos] GitHub fetch error:', e.message);
        // Return stale cache if available
        if (videosCache) return videosCache;
        return [];
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Parse path from query or URL
    const pathParam = (req.query.path as string) || '';
    console.log('[API] Path:', pathParam);
    
    try {
        // Root path - show API info
        if (pathParam === '') {
            const videos = await loadVideos();
            return res.json({
                name: 'Bokep API - Dadok Stream',
                version: '1.0.0',
                total_videos: videos.length,
                endpoints: {
                    list: '/api/videos',
                    detail: '/api/videos/:slug',
                    search: '/api/videos?q=keyword',
                    stats: '/api/stats'
                },
                source: 'mcdowellforcongress.com'
            });
        }
        
        // Routes
        if (pathParam === 'videos') {
            return await handleVideosList(req, res);
        }
        
        // Match videos/:slug pattern
        const videoMatch = pathParam.match(/^videos\/(.+)$/);
        if (videoMatch) {
            return await handleVideoDetail(videoMatch[1], res);
        }
        
        if (pathParam === 'stats') {
            const videos = await loadVideos();
            return res.json({
                total: videos.length,
                categories: [...new Set(videos.flatMap(v => v.categories || []))],
                lastUpdate: videos[0]?.extracted_at || null,
                source: 'mcdowellforcongress.com'
            });
        }
        
        return res.status(404).json({ error: 'Not found', path: pathParam });
    } catch (error: any) {
        console.error('API Error:', error.message);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}

async function handleVideosList(req: VercelRequest, res: VercelResponse) {
    const videos = await loadVideos();
    const q = (req.query.q as string) || '';
    const category = (req.query.category as string) || '';
    const page = parseInt((req.query.page as string) || '1', 10) || 1;
    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 200);
    
    let filtered = videos;
    
    // Search filter
    if (q) {
        const ql = q.toLowerCase();
        filtered = filtered.filter(v => 
            (v.title || '').toLowerCase().includes(ql)
        );
    }
    
    // Category filter
    if (category) {
        const cl = category.toLowerCase();
        filtered = filtered.filter(v => 
            (v.categories || []).some(c => c.toLowerCase().includes(cl))
        );
    }
    
    const total = filtered.length;
    const start = (page - 1) * limit;
    const results = filtered.slice(start, start + limit);
    
    return res.json({
        status: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        results: results.map(v => ({
            id: v.id,
            title: v.title,
            slug: v.slug,
            poster: v.poster,
            categories: v.categories,
            sources_count: v.sources?.length || 0
        }))
    });
}

async function handleVideoDetail(slug: string, res: VercelResponse) {
    const videos = await loadVideos();
    const video = videos.find(v => v.slug === slug || v.id === slug);
    
    if (!video) {
        return res.status(404).json({ error: 'Video not found', slug });
    }
    
    // Filter sources to only include imaxstreams.com (Imax 1)
    const sources = (video.sources || [])
        .filter(src => src.url.includes('imaxstreams.com'))
        .map((src) => ({
            ...src,
            name: 'Imax 1',
            embed_url: src.url.replace('/download/', '/embed/')
        }));
    
    return res.json({
        status: true,
        data: {
            ...video,
            sources: sources.length > 0 ? sources : video.sources,
            page_url: video.page_url
        }
    });
}
