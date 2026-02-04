import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// API endpoints
const API_BASE = 'https://api.sansekai.my.id/api';
const ANIME_API = 'https://api.sansekai.my.id/api/anime'; // NEW: Using Sansekai anime API with working video
const KOMIK_BASE_URL = 'https://komikindo.ch';

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'dado-stream-secret-key-2024';
const MONGODB_URI = process.env.MONGODB_URI || '';

// ============ CACHING SYSTEM ============
// In-memory cache for API responses (survives within single serverless instance)
interface CacheEntry {
    data: any;
    timestamp: number;
    ttl: number;
}
const apiCache = new Map<string, CacheEntry>();
const CACHE_TTL = {
    LIST: 5 * 60 * 1000,      // 5 minutes for lists
    DETAIL: 30 * 60 * 1000,   // 30 minutes for detail
    VIDEO: 10 * 60 * 1000,    // 10 minutes for video URLs
    EPISODES: 15 * 60 * 1000  // 15 minutes for episode lists
};

function getCached(key: string): any | null {
    const entry = apiCache.get(key);
    if (entry && (Date.now() - entry.timestamp) < entry.ttl) {
        console.log(`[Cache] Hit: ${key}`);
        return entry.data;
    }
    return null;
}

function setCache(key: string, data: any, ttl: number): void {
    apiCache.set(key, { data, timestamp: Date.now(), ttl });
    // Clean old entries if cache gets too big
    if (apiCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of apiCache) {
            if (now - v.timestamp > v.ttl) {
                apiCache.delete(k);
            }
        }
    }
}

// ============ RETRY HELPER ============
async function fetchWithRetry(url: string, config: any = {}, retries = 3, delay = 1000): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                ...config
            });
            return response;
        } catch (error: any) {
            console.log(`[Retry] Attempt ${i + 1}/${retries} failed for ${url}: ${error.message}`);
            if (i < retries - 1) {
                await new Promise(r => setTimeout(r, delay * (i + 1)));
            } else {
                throw error;
            }
        }
    }
}

// Jikan API Cache (server-side to avoid rate limiting)
interface JikanCacheEntry {
    data: any;
    timestamp: number;
}
const jikanCache = new Map<string, JikanCacheEntry>();
const JIKAN_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const JIKAN_RATE_LIMIT_DELAY = 350; // 350ms between requests (max ~3 per second)
let lastJikanRequest = 0;

async function getJikanCoverWithCache(title: string): Promise<any> {
    const cacheKey = title.toLowerCase().trim();
    
    // Check cache first
    const cached = jikanCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < JIKAN_CACHE_TTL) {
        console.log('[Jikan Cache] Hit for:', title);
        return cached.data;
    }
    
    // Rate limiting - wait if needed
    const now = Date.now();
    const timeSinceLastRequest = now - lastJikanRequest;
    if (timeSinceLastRequest < JIKAN_RATE_LIMIT_DELAY) {
        await new Promise(resolve => setTimeout(resolve, JIKAN_RATE_LIMIT_DELAY - timeSinceLastRequest));
    }
    lastJikanRequest = Date.now();
    
    // Clean title for better search
    const cleanTitle = title
        .replace(/\s*(episode|ep\.?|eps?\.?)\s*\d+/gi, '')
        .replace(/\s*season\s*\d+/gi, '')
        .replace(/\s*\d+(st|nd|rd|th)\s*season/gi, '')
        .replace(/\([^)]*\)/g, '') // Remove parentheses content
        .replace(/[^\w\s]/g, ' ')
        .trim();
    
    try {
        console.log('[Jikan] Fetching for:', cleanTitle);
        const response = await axios.get('https://api.jikan.moe/v4/anime', {
            params: { q: cleanTitle, limit: 1 },
            timeout: 10000
        });
        
        const animeData = response.data?.data?.[0];
        if (animeData) {
            const result = {
                mal_id: animeData.mal_id,
                title: animeData.title,
                title_english: animeData.title_english,
                title_japanese: animeData.title_japanese,
                image: animeData.images?.jpg?.large_image_url || animeData.images?.jpg?.image_url,
                image_small: animeData.images?.jpg?.small_image_url,
                image_webp: animeData.images?.webp?.large_image_url,
                synopsis: animeData.synopsis,
                score: animeData.score,
                episodes: animeData.episodes,
                status: animeData.status
            };
            
            // Cache the result
            jikanCache.set(cacheKey, { data: result, timestamp: Date.now() });
            console.log('[Jikan] Cached:', title);
            return result;
        }
        
        // Cache null result too to avoid repeated failed requests
        jikanCache.set(cacheKey, { data: null, timestamp: Date.now() });
        return null;
    } catch (error: any) {
        console.error('[Jikan Error]:', error.message);
        // Don't cache errors - allow retry
        return null;
    }
}

// MongoDB Connection (cached for serverless)
let cachedDb: typeof mongoose | null = null;

async function connectDB() {
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }
    
    if (!MONGODB_URI) {
        console.log('MongoDB URI not configured, using fallback mode');
        return null;
    }

    try {
        cachedDb = await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 10000,
            maxPoolSize: 10,
            minPoolSize: 1,
        });
        console.log('MongoDB connected');
        return cachedDb;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        return null;
    }
}

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Analytics Schema
const analyticsSchema = new mongoose.Schema({
    eventType: { type: String, required: true },
    page: String,
    contentId: String,
    contentType: String,
    contentTitle: String,
    userAgent: String,
    ip: String,
    country: String,
    countryCode: String,
    region: String,
    regionName: String,
    city: String,
    zip: String,
    lat: Number,
    lon: Number,
    timezone: String,
    isp: String,
    org: String,
    device: String,
    browser: String,
    os: String,
    sessionId: String,
    timestamp: { type: Date, default: Date.now }
});

// Session Schema
const sessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    ip: String,
    userAgent: String,
    device: String,
    browser: String,
    os: String,
    country: String,
    countryCode: String,
    region: String,
    regionName: String,
    city: String,
    zip: String,
    lat: Number,
    lon: Number,
    timezone: String,
    isp: String,
    org: String,
    currentPage: String,
    currentContent: String,
    isActive: { type: Boolean, default: true },
    startTime: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now }
});

// Get or create models (avoid re-compilation in serverless)
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Analytics = mongoose.models.Analytics || mongoose.model('Analytics', analyticsSchema);
const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);

// Default admin credentials (fallback when no MongoDB)
const FALLBACK_ADMIN = {
    username: 'admin',
    password: 'admin123',
    role: 'superadmin'
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { path, action } = req.query;
    const pathStr = Array.isArray(path) ? path.join('/') : path || '';

    try {
        // Route handling - support both /api/drama?action=latest AND /api?path=dramabox/latest
        if (pathStr === 'drama' || pathStr.startsWith('drama/')) {
            // Handle /api/drama?action=xxx format
            const actionStr = (action as string) || pathStr.replace('drama/', '') || '';
            return await handleDrama(actionStr, req, res);
        } else if (pathStr === 'anime' || pathStr.startsWith('anime/')) {
            const actionStr = (action as string) || pathStr.replace('anime/', '') || '';
            return await handleAnimeNew(actionStr, req, res);
        } else if (pathStr === 'komik' || pathStr.startsWith('komik/')) {
            const actionStr = (action as string) || pathStr.replace('komik/', '') || '';
            return await handleKomikNew(actionStr, req, res);
        } else if (pathStr === 'donghua' || pathStr.startsWith('donghua/')) {
            const actionStr = (action as string) || pathStr.replace('donghua/', '') || '';
            return await handleDonghua(actionStr, req, res);
        } else if (pathStr.startsWith('auth/')) {
            return await handleAuth(pathStr.replace('auth/', ''), req, res);
        } else if (pathStr.startsWith('admin/')) {
            return await handleAdmin(pathStr.replace('admin/', ''), req, res);
        } else if (pathStr.startsWith('analytics/')) {
            return await handleAnalytics(pathStr.replace('analytics/', ''), req, res);
        } else if (pathStr.startsWith('dramabox/')) {
            return await handleDramabox(pathStr.replace('dramabox/', ''), req, res);
        } else if (pathStr === 'videos' || pathStr.startsWith('videos/')) {
            const actionStr = (action as string) || pathStr.replace('videos/', '') || '';
            return await handleVideos(actionStr, req, res);
        } else if (pathStr === 'proxy') {
            // Support /api?path=proxy&url=... convenience endpoint
            return await handleProxyDirect(req, res);
        } else if (pathStr.startsWith('proxy/')) {
            return await handleProxy(pathStr.replace('proxy/', ''), req, res);
        } else if (pathStr.startsWith('assets/') || pathStr.startsWith('lib/')) {
            // Anti-adblock: Serve ad scripts as first-party assets
            return await handleAdAssets(pathStr, req, res);
        }

        return res.status(404).json({ error: 'Not found', path: pathStr });
    } catch (error: any) {
        console.error('API Error:', error.message);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}

// ==================== AUTH HANDLERS ====================
async function handleAuth(action: string, req: VercelRequest, res: VercelResponse) {
    if (action === 'login' && req.method === 'POST') {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Check fallback admin FIRST (always works)
        if (username === FALLBACK_ADMIN.username && password === FALLBACK_ADMIN.password) {
            const token = jwt.sign(
                { id: 'fallback-admin', username: FALLBACK_ADMIN.username, role: FALLBACK_ADMIN.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json({
                success: true,
                token,
                user: {
                    id: 'fallback-admin',
                    username: FALLBACK_ADMIN.username,
                    email: 'admin@dadostream.com',
                    role: FALLBACK_ADMIN.role
                }
            });
        }

        await connectDB();

        // Try MongoDB for other users
        if (mongoose.connection.readyState === 1) {
            try {
                const user = await User.findOne({
                    $or: [{ username }, { email: username }]
                });

                if (!user) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                if (!user.isActive) {
                    return res.status(403).json({ error: 'Account is inactive' });
                }

                const isPasswordValid = await bcrypt.compare(password, user.password);
                if (!isPasswordValid) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                // Update last login
                user.lastLogin = new Date();
                await user.save();

                const token = jwt.sign(
                    { id: user._id, username: user.username, role: user.role },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );

                return res.json({
                    success: true,
                    token,
                    user: {
                        id: user._id,
                        username: user.username,
                        email: user.email,
                        role: user.role
                    }
                });
            } catch (error: any) {
                console.error('Login DB error:', error);
            }
        }

        return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (action === 'verify') {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            return res.json({ success: true, user: decoded });
        } catch (error) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    }

    if (action === 'logout') {
        return res.json({ success: true, message: 'Logged out successfully' });
    }

    return res.status(404).json({ error: 'Unknown auth action' });
}

// ==================== ADMIN HANDLERS ====================
async function handleAdmin(action: string, req: VercelRequest, res: VercelResponse) {
    // Verify admin token
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    await connectDB();

    if (action === 'dashboard') {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let totalUsers = 0, activeSessions = 0, todayPageviews = 0;

        if (mongoose.connection.readyState === 1) {
            try {
                [totalUsers, activeSessions, todayPageviews] = await Promise.all([
                    User.countDocuments(),
                    Session.countDocuments({ isActive: true, lastActivity: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
                    Analytics.countDocuments({ eventType: 'pageview', timestamp: { $gte: today } })
                ]);
            } catch (error) {
                console.error('Dashboard stats error:', error);
            }
        }

        return res.json({
            success: true,
            data: {
                totalUsers,
                activeSessions,
                todayPageviews,
                serverUptime: process.uptime()
            }
        });
    }

    if (action === 'watchers') {
        const limit = parseInt(req.query.limit as string) || 20;
        let watchers: any[] = [];

        if (mongoose.connection.readyState === 1) {
            try {
                const rawWatchers = await Session.find({
                    isActive: true,
                    lastActivity: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
                })
                .sort({ lastActivity: -1 })
                .limit(limit)
                .lean();
                
                // Format watchers for frontend with full location details
                watchers = rawWatchers.map((w: any) => ({
                    sessionId: w.sessionId,
                    ip: w.ip || 'Hidden',
                    country: w.country || 'Unknown',
                    countryCode: w.countryCode || '',
                    region: w.region || '',
                    regionName: w.regionName || '',
                    city: w.city || 'Unknown',
                    zip: w.zip || '',
                    lat: w.lat || 0,
                    lon: w.lon || 0,
                    timezone: w.timezone || '',
                    isp: w.isp || 'Unknown',
                    org: w.org || '',
                    currentPage: w.currentPage || '/',
                    currentContent: w.currentContent || null,
                    device: w.device || 'Unknown',
                    browser: w.browser || 'Unknown',
                    os: w.os || 'Unknown',
                    lastActivity: w.lastActivity,
                    startTime: w.startTime
                }));
            } catch (error) {
                console.error('Watchers error:', error);
            }
        }

        return res.json({ success: true, data: watchers });
    }

    if (action === 'stats') {
        const period = req.query.period as string || '7d';
        let stats: any = { pageviews: [], topContent: [], devices: [], countries: [] };

        if (mongoose.connection.readyState === 1) {
            try {
                const days = period === '30d' ? 30 : period === '24h' ? 1 : 7;
                const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

                // Get pageviews by day
                const pageviewsAgg = await Analytics.aggregate([
                    { $match: { eventType: 'pageview', timestamp: { $gte: startDate } } },
                    { $group: { 
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                        count: { $sum: 1 }
                    }},
                    { $sort: { _id: 1 } }
                ]);

                // Get top content
                const topContentAgg = await Analytics.aggregate([
                    { $match: { eventType: { $in: ['watch', 'read'] }, timestamp: { $gte: startDate } } },
                    { $group: { 
                        _id: { contentId: '$contentId', contentTitle: '$contentTitle', contentType: '$contentType' },
                        views: { $sum: 1 }
                    }},
                    { $sort: { views: -1 } },
                    { $limit: 10 }
                ]);

                // Get devices
                const devicesAgg = await Analytics.aggregate([
                    { $match: { timestamp: { $gte: startDate } } },
                    { $group: { _id: '$device', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]);

                // Get countries
                const countriesAgg = await Analytics.aggregate([
                    { $match: { timestamp: { $gte: startDate } } },
                    { $group: { _id: '$country', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ]);

                stats = {
                    pageviews: pageviewsAgg,
                    topContent: topContentAgg.map(item => ({
                        ...item._id,
                        views: item.views
                    })),
                    devices: devicesAgg,
                    countries: countriesAgg
                };
            } catch (error) {
                console.error('Stats error:', error);
            }
        }

        return res.json({ success: true, data: stats });
    }

    if (action === 'users') {
        let users: any[] = [];

        if (mongoose.connection.readyState === 1) {
            try {
                users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
            } catch (error) {
                console.error('Users error:', error);
            }
        }

        return res.json({ success: true, data: users });
    }

    if (action === 'users/create' && req.method === 'POST') {
        const { username, email, password, role } = req.body || {};

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email and password are required' });
        }

        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        try {
            // Check if user already exists
            const existingUser = await User.findOne({
                $or: [{ username }, { email }]
            });

            if (existingUser) {
                return res.status(400).json({ error: 'Username or email already exists' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create new user
            const newUser = new User({
                username,
                email,
                password: hashedPassword,
                role: role || 'admin',
                isActive: true,
                createdAt: new Date()
            });

            await newUser.save();

            return res.json({
                success: true,
                user: {
                    id: newUser._id,
                    username: newUser.username,
                    email: newUser.email,
                    role: newUser.role
                }
            });
        } catch (error: any) {
            console.error('Create user error:', error);
            return res.status(500).json({ error: 'Failed to create user' });
        }
    }

    return res.status(404).json({ error: 'Unknown admin action' });
}

// ==================== ANALYTICS HANDLERS ====================
async function handleAnalytics(action: string, req: VercelRequest, res: VercelResponse) {
    await connectDB();

    // GET /analytics/devices - Device distribution
    if (action === 'devices' && req.method === 'GET') {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, data: { desktop: 50, mobile: 40, tablet: 10 } });
        }
        
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const devices = await Analytics.aggregate([
                { $match: { timestamp: { $gte: thirtyDaysAgo } } },
                { $group: { _id: '$device', count: { $sum: 1 } } }
            ]);
            
            const result: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
            devices.forEach((d: any) => {
                const device = (d._id || 'desktop').toLowerCase();
                if (device.includes('mobile') || device.includes('phone')) {
                    result.mobile += d.count;
                } else if (device.includes('tablet') || device.includes('ipad')) {
                    result.tablet += d.count;
                } else {
                    result.desktop += d.count;
                }
            });
            
            return res.json({ success: true, data: result });
        } catch (error) {
            console.error('Devices error:', error);
            return res.json({ success: true, data: { desktop: 50, mobile: 40, tablet: 10 } });
        }
    }

    // GET /analytics/hourly - Hourly traffic distribution
    if (action === 'hourly' && req.method === 'GET') {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, data: { labels: [], values: [] } });
        }
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const hourly = await Analytics.aggregate([
                { $match: { timestamp: { $gte: today } } },
                { $group: { _id: { $hour: '$timestamp' }, count: { $sum: 1 } } },
                { $sort: { '_id': 1 } }
            ]);
            
            const labels = [];
            const values = [];
            for (let h = 0; h < 24; h++) {
                labels.push(`${h.toString().padStart(2, '0')}:00`);
                const found = hourly.find((x: any) => x._id === h);
                values.push(found ? found.count : 0);
            }
            
            return res.json({ success: true, data: { labels, values } });
        } catch (error) {
            console.error('Hourly error:', error);
            return res.json({ success: true, data: { labels: [], values: [] } });
        }
    }

    // GET /analytics/country-detail - Geographic distribution
    if (action === 'country-detail' && req.method === 'GET') {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, data: { countries: [], weekdayData: [] } });
        }
        
        try {
            // Country distribution
            const countries = await Analytics.aggregate([
                { $match: { country: { $exists: true, $ne: null } } },
                { $group: { _id: '$country', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]);
            
            // Weekday distribution
            const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const weekdayAgg = await Analytics.aggregate([
                { $group: { _id: { $dayOfWeek: '$timestamp' }, count: { $sum: 1 } } },
                { $sort: { '_id': 1 } }
            ]);
            
            const weekdayData = weekdays.map((day, idx) => {
                const found = weekdayAgg.find((x: any) => x._id === idx + 1);
                return { day, count: found ? found.count : 0 };
            });
            
            return res.json({
                success: true,
                data: {
                    countries: countries.map((c: any) => ({ country: c._id || 'Unknown', count: c.count })),
                    weekdayData
                }
            });
        } catch (error) {
            console.error('Country detail error:', error);
            return res.json({ success: true, data: { countries: [], weekdayData: [] } });
        }
    }

    // GET /analytics/geo - Geographic data for table
    if (action === 'geo' && req.method === 'GET') {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, data: [] });
        }
        
        try {
            const geo = await Analytics.aggregate([
                { $match: { country: { $exists: true, $ne: null } } },
                { $group: { _id: '$country', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]);
            
            return res.json({
                success: true,
                data: geo.map((g: any) => ({ country: g._id || 'Unknown', visitors: g.count }))
            });
        } catch (error) {
            console.error('Geo error:', error);
            return res.json({ success: true, data: [] });
        }
    }

    // GET /analytics/peak-hours - Peak hours by country
    if (action === 'peak-hours' && req.method === 'GET') {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, data: [] });
        }
        
        try {
            const peakHours = await Analytics.aggregate([
                { $match: { country: { $exists: true, $ne: null } } },
                { $group: { 
                    _id: { country: '$country', hour: { $hour: '$timestamp' } }, 
                    count: { $sum: 1 } 
                }},
                { $sort: { count: -1 } },
                { $group: {
                    _id: '$_id.country',
                    peakHour: { $first: '$_id.hour' },
                    visitors: { $sum: '$count' }
                }},
                { $sort: { visitors: -1 } },
                { $limit: 10 }
            ]);
            
            return res.json({
                success: true,
                data: peakHours.map((p: any) => ({
                    country: p._id || 'Unknown',
                    peakHour: `${p.peakHour.toString().padStart(2, '0')}:00`,
                    visitors: p.visitors
                }))
            });
        } catch (error) {
            console.error('Peak hours error:', error);
            return res.json({ success: true, data: [] });
        }
    }

    if (action === 'track' && req.method === 'POST') {
        const eventData = req.body || {};
        
        if (mongoose.connection.readyState === 1) {
            try {
                // Parse user agent
                const userAgent = (req.headers['user-agent'] || '').toString();
                const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                           req.headers['x-real-ip'] as string || 
                           'unknown';

                // Detect if this is a bot/crawler
                const botPatterns = [
                    /bot/i, /crawler/i, /spider/i, /scraper/i,
                    /curl/i, /wget/i, /python/i, /java\//i,
                    /headless/i, /phantom/i, /selenium/i,
                    /googlebot/i, /bingbot/i, /yandex/i, /baiduspider/i,
                    /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i,
                    /whatsapp/i, /telegrambot/i, /slackbot/i,
                    /pingdom/i, /uptimerobot/i, /statuscake/i,
                    /node-fetch/i, /axios/i, /got\//i
                ];
                
                const isBot = botPatterns.some(pattern => pattern.test(userAgent)) || userAgent.length < 20;
                
                // Skip tracking for bots
                if (isBot) {
                    return res.json({ success: true, filtered: 'bot' });
                }

                // Get detailed geolocation from IP (using free API)
                let geoData: any = {
                    country: 'Unknown',
                    countryCode: '',
                    region: '',
                    regionName: '',
                    city: 'Unknown',
                    zip: '',
                    lat: 0,
                    lon: 0,
                    timezone: '',
                    isp: '',
                    org: '',
                    isHosting: false
                };
                
                if (ip && ip !== 'unknown' && !ip.startsWith('127.') && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
                    try {
                        // Get all available fields from ip-api.com including hosting detection
                        const geoRes = await axios.get(
                            `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,hosting,query`,
                            { timeout: 3000 }
                        );
                        if (geoRes.data && geoRes.data.status === 'success') {
                            geoData = {
                                country: geoRes.data.country || 'Unknown',
                                countryCode: geoRes.data.countryCode || '',
                                region: geoRes.data.region || '',
                                regionName: geoRes.data.regionName || '',
                                city: geoRes.data.city || 'Unknown',
                                zip: geoRes.data.zip || '',
                                lat: geoRes.data.lat || 0,
                                lon: geoRes.data.lon || 0,
                                timezone: geoRes.data.timezone || '',
                                isp: geoRes.data.isp || '',
                                org: geoRes.data.org || '',
                                isHosting: geoRes.data.hosting || false
                            };
                            
                            // Filter out hosting/datacenter IPs (likely bots)
                            if (geoRes.data.hosting === true) {
                                return res.json({ success: true, filtered: 'datacenter' });
                            }
                            
                            // Filter known bot ISPs
                            const botISPs = ['digitalocean', 'amazon', 'google cloud', 'microsoft azure', 'linode', 'vultr', 'ovh', 'hetzner'];
                            const ispLower = (geoRes.data.isp || '').toLowerCase();
                            if (botISPs.some(bot => ispLower.includes(bot))) {
                                return res.json({ success: true, filtered: 'hosting-isp' });
                            }
                        }
                    } catch (geoErr) {
                        // Ignore geo errors, use default values
                    }
                }

                const analytics = new Analytics({
                    ...eventData,
                    userAgent,
                    ip,
                    ...geoData,
                    timestamp: new Date()
                });
                await analytics.save();

                // Update or create session with full geo data
                if (eventData.sessionId) {
                    await Session.findOneAndUpdate(
                        { sessionId: eventData.sessionId },
                        {
                            $set: {
                                lastActivity: new Date(),
                                currentPage: eventData.page,
                                currentContent: eventData.contentTitle,
                                isActive: true,
                                userAgent,
                                ip,
                                device: eventData.device,
                                browser: eventData.browser,
                                os: eventData.os,
                                ...geoData
                            },
                            $setOnInsert: {
                                startTime: new Date()
                            }
                        },
                        { upsert: true, new: true }
                    );
                }
            } catch (error) {
                console.error('Track error:', error);
            }
        }

        return res.json({ success: true });
    }

    if (action === 'heartbeat' && req.method === 'POST') {
        const { sessionId } = req.body || {};

        if (sessionId && mongoose.connection.readyState === 1) {
            try {
                await Session.findOneAndUpdate(
                    { sessionId },
                    { lastActivity: new Date(), isActive: true }
                );
            } catch (error) {
                console.error('Heartbeat error:', error);
            }
        }

        return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Unknown analytics action' });
}

// ==================== NEW HANDLERS FOR /api/drama, /api/anime, /api/komik ====================

// Drama handler (using dramabox API)
async function handleDrama(action: string, req: VercelRequest, res: VercelResponse) {
    try {
        // Debug endpoint to verify deployment
        if (action === 'test') {
            return res.json({ status: true, message: 'Drama API v2 - video from allepisode', timestamp: Date.now() });
        }
        
        if (action === 'latest' || action === 'trending' || action === 'vip' || action === 'foryou' || !action) {
            const endpoint = action || 'latest';
            
            // Check cache first
            const cacheKey = `drama_${endpoint}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            const response = await fetchWithRetry(`${API_BASE}/dramabox/${endpoint}`);
            // Handle various response formats from dramabox API
            const results = response.data?.value || response.data?.data || (Array.isArray(response.data) ? response.data : []);
            
            // Normalize data format - map dramabox fields correctly
            const items = results.map((item: any) => ({
                bookId: item.bookId || item.id,
                id: item.bookId || item.id,
                title: item.bookName || item.judul || item.title || 'Unknown',
                judul: item.bookName || item.judul || item.title || 'Unknown',
                image: item.coverWap || item.thumbnail_url || item.cover || item.image || '',
                cover: item.coverWap || item.thumbnail_url || item.cover || item.image || '',
                thumbnail_url: item.coverWap || item.thumbnail_url || item.cover || item.image || '',
                totalEpisode: item.chapterCount || item.total_episode || item.totalEpisode || 0,
                description: item.introduction || item.synopsis || item.description || '',
                tags: item.tags || [],
                rating: item.rating || '8.5',
                type: 'Drama'
            }));
            
            // Cache the result
            setCache(cacheKey, items, CACHE_TTL.LIST);
            
            return res.json({ status: true, data: items });
        }

        if (action === 'search') {
            const keyword = req.query.keyword || req.query.q || req.query.query;
            if (!keyword) return res.status(400).json({ status: false, error: 'Keyword required' });
            
            const cacheKey = `drama_search_${keyword}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            const response = await fetchWithRetry(`${API_BASE}/dramabox/search`, {
                params: { query: keyword }
            });
            const results = response.data?.value || response.data?.data || (Array.isArray(response.data) ? response.data : []);
            const items = results.map((item: any) => ({
                bookId: item.bookId || item.id,
                id: item.bookId || item.id,
                title: item.bookName || item.judul || item.title || 'Unknown',
                judul: item.bookName || item.judul || item.title || 'Unknown',
                image: item.coverWap || item.thumbnail_url || item.cover || item.image || '',
                cover: item.coverWap || item.thumbnail_url || item.cover || item.image || '',
                thumbnail_url: item.coverWap || item.thumbnail_url || item.cover || item.image || '',
                totalEpisode: item.chapterCount || item.total_episode || item.totalEpisode || 0,
                type: 'Drama'
            }));
            
            setCache(cacheKey, items, CACHE_TTL.LIST);
            return res.json({ status: true, data: items });
        }

        if (action === 'detail') {
            const { bookId } = req.query;
            if (!bookId) return res.status(400).json({ status: false, error: 'bookId required' });
            
            const cacheKey = `drama_detail_${bookId}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            const response = await fetchWithRetry(`${API_BASE}/dramabox/detail`, {
                params: { bookId }
            });
            // API returns data directly at root level (not in .data)
            const raw = response.data?.data || response.data;
            // Normalize field names for frontend compatibility
            const result = {
                ...raw,
                id: raw.bookId || bookId,
                bookId: raw.bookId || bookId,
                title: raw.bookName || raw.title || 'Unknown',
                judul: raw.bookName || raw.title || 'Unknown',
                image: raw.coverWap || raw.cover || raw.image || '',
                cover: raw.coverWap || raw.cover || raw.image || '',
                thumbnail_url: raw.coverWap || raw.cover || raw.image || '',
                description: raw.introduction || raw.synopsis || raw.description || '',
                synopsis: raw.introduction || raw.synopsis || raw.description || '',
                totalEpisode: raw.chapterCount || raw.totalEpisode || 0,
                rating: raw.rating || '8.5',
                type: 'Drama'
            };
            
            setCache(cacheKey, result, CACHE_TTL.DETAIL);
            return res.json({ status: true, data: result });
        }

        if (action === 'allepisode') {
            const { bookId } = req.query;
            if (!bookId) return res.status(400).json({ status: false, error: 'bookId required' });
            
            const cacheKey = `drama_episodes_${bookId}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            const response = await fetchWithRetry(`${API_BASE}/dramabox/allepisode`, {
                params: { bookId }
            });
            const results = Array.isArray(response.data) ? response.data : (response.data?.data || []);
            
            setCache(cacheKey, results, CACHE_TTL.EPISODES);
            return res.json({ status: true, data: results });
        }

        if (action === 'video') {
            const { episodeId, bookId } = req.query;
            if (!episodeId) return res.status(400).json({ status: false, error: 'episodeId required' });
            
            // Video URLs are embedded in allepisode response, not in separate endpoint
            // We need bookId to fetch all episodes and find the matching one
            if (!bookId) {
                return res.status(400).json({ status: false, error: 'bookId required for video' });
            }
            
            // Check video cache
            const cacheKey = `drama_video_${bookId}_${episodeId}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            try {
                const response = await fetchWithRetry(`${API_BASE}/dramabox/allepisode`, {
                    params: { bookId }
                });
                const episodes = Array.isArray(response.data) ? response.data : (response.data?.data || []);
                
                // Find the episode with matching chapterId
                const episode = episodes.find((ep: any) => ep.chapterId === episodeId || ep.chapterId === String(episodeId));
                
                if (!episode) {
                    return res.status(404).json({ status: false, error: 'Episode not found' });
                }
                
                // Extract video URL from cdnList
                let videoUrl = '';
                let servers: any[] = [];
                
                if (episode.cdnList && episode.cdnList.length > 0) {
                    const defaultCdn = episode.cdnList.find((cdn: any) => cdn.isDefault === 1) || episode.cdnList[0];
                    
                    if (defaultCdn.videoPathList && Array.isArray(defaultCdn.videoPathList)) {
                        // Get default quality or 720p
                        const defaultQuality = defaultCdn.videoPathList.find((v: any) => v.isDefault === 1);
                        const quality720 = defaultCdn.videoPathList.find((v: any) => v.quality === 720);
                        const quality540 = defaultCdn.videoPathList.find((v: any) => v.quality === 540);
                        const anyQuality = defaultCdn.videoPathList[0];
                        
                        const selectedQuality = defaultQuality || quality720 || quality540 || anyQuality;
                        if (selectedQuality) {
                            videoUrl = selectedQuality.videoPath;
                        }
                        
                        // Build servers list for quality selection
                        servers = defaultCdn.videoPathList.map((v: any) => ({
                            name: `${v.quality}p`,
                            quality: v.quality,
                            url: v.videoPath
                        }));
                    }
                }
                
                if (!videoUrl) {
                    return res.status(404).json({ status: false, error: 'Video URL not found' });
                }
                
                const result = {
                    video: videoUrl,
                    url: videoUrl,
                    playUrl: videoUrl,
                    servers: servers,
                    episode: episode.chapterName,
                    thumbnail: episode.chapterImg
                };
                
                // Cache the video URL
                setCache(cacheKey, result, CACHE_TTL.VIDEO);
                
                return res.json({ status: true, data: result });
            } catch (error: any) {
                console.error('[Drama Video Error]:', error.message);
                return res.status(500).json({ status: false, error: 'Failed to fetch video', details: error.message });
            }
        }

        return res.status(404).json({ status: false, error: 'Unknown drama action' });
    } catch (error: any) {
        console.error('[Drama Error]:', error.message);
        return res.status(500).json({ status: false, error: 'Failed to fetch drama data', details: error.message });
    }
}

// Anime handler (NEW - Using Sansekai API with working video streams)
async function handleAnimeNew(action: string, req: VercelRequest, res: VercelResponse) {
    try {
        // ONGOING anime - uses /anime/latest endpoint (latest updates = ongoing)
        if (action === 'ongoing') {
            const cacheKey = 'anime_ongoing';
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            const response = await fetchWithRetry(`${ANIME_API}/latest`);
            let animeList = response.data || [];
            
            // Parse if string
            if (typeof animeList === 'string') {
                try { animeList = JSON.parse(animeList); } catch(e) { animeList = []; }
            }
            
            const items = animeList.map((item: any) => ({
                urlId: item.url,
                id: item.url,
                title: item.judul,
                judul: item.judul,
                image: item.cover,
                thumbnail_url: item.cover,
                episode: item.lastch || 'Latest',
                status: 'Ongoing',
                type: 'Anime'
            }));
            
            setCache(cacheKey, items, CACHE_TTL.LIST);
            return res.json({ status: true, data: items });
        }

        // COMPLETED anime - uses /anime/recommended with status filter
        if (action === 'completed') {
            const page = req.query.page || '1';
            const cacheKey = `anime_completed_${page}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            const response = await fetchWithRetry(`${ANIME_API}/recommended`, {
                params: { page }
            });
            let animeList = response.data || [];
            
            // Parse if string
            if (typeof animeList === 'string') {
                try { animeList = JSON.parse(animeList); } catch(e) { animeList = []; }
            }
            
            // Filter only completed anime
            const completedList = animeList.filter((item: any) => 
                item.status?.toLowerCase() === 'completed' || 
                item.status?.toLowerCase() === 'complete' ||
                item.status?.toLowerCase() === 'tamat'
            );
            
            const items = completedList.map((item: any) => ({
                urlId: item.url,
                id: item.url || item.id,
                title: item.judul,
                judul: item.judul,
                image: item.cover,
                thumbnail_url: item.cover,
                episode: item.total_episode ? `${item.total_episode} Ep` : '',
                score: item.score,
                status: 'Completed',
                type: 'Anime'
            }));
            
            setCache(cacheKey, items, CACHE_TTL.LIST);
            return res.json({ status: true, data: items });
        }

        // Latest anime - uses /anime/latest endpoint
        if (action === 'latest' || !action) {
            const cacheKey = 'anime_latest';
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            const response = await fetchWithRetry(`${ANIME_API}/latest`);
            let animeList = response.data || [];
            
            // Parse if string
            if (typeof animeList === 'string') {
                try { animeList = JSON.parse(animeList); } catch(e) { animeList = []; }
            }
            
            const items = animeList.map((item: any) => ({
                urlId: item.url,
                id: item.url,
                title: item.judul,
                judul: item.judul,
                image: item.cover,
                thumbnail_url: item.cover,
                episode: item.lastch || 'Latest',
                type: 'Anime'
            }));
            
            return res.json({ status: true, data: items });
        }

        // Popular/Trending anime - uses /anime/recommended endpoint
        if (action === 'trending' || action === 'popular') {
            const page = req.query.page || '1';
            const response = await fetchWithRetry(`${ANIME_API}/recommended`, {
                params: { page }
            });
            // API returns array directly
            let animeList = response.data || [];
            
            // Parse if string
            if (typeof animeList === 'string') {
                try { animeList = JSON.parse(animeList); } catch(e) { animeList = []; }
            }
            
            // Ensure it's an array
            if (!Array.isArray(animeList)) {
                animeList = [];
            }
            
            const items = animeList.map((item: any) => ({
                urlId: item.url,
                id: item.url || item.id,
                title: item.judul,
                judul: item.judul,
                image: item.cover,
                thumbnail_url: item.cover,
                episode: item.total_episode ? `${item.total_episode} Ep` : '',
                score: item.score,
                status: item.status,
                type: 'Anime'
            }));
            
            return res.json({ status: true, data: items });
        }

        // Search anime - uses /anime/search endpoint
        if (action === 'search') {
            const keyword = req.query.keyword || req.query.q;
            if (!keyword) return res.status(400).json({ status: false, error: 'Keyword required' });
            
            try {
                const response = await fetchWithRetry(`${ANIME_API}/search`, {
                    params: { query: keyword }
                });
                
                // Response format: data[0].result[] array
                const searchData = response.data?.data?.[0] || {};
                const animeList = searchData.result || [];
                
                const items = animeList.map((item: any) => ({
                    urlId: item.url,
                    id: item.url || item.id,
                    title: item.judul,
                    judul: item.judul,
                    image: item.cover,
                    thumbnail_url: item.cover,
                    episode: item.total_episode ? `${item.total_episode} Ep` : '',
                    score: item.score,
                    status: item.status,
                    genre: item.genre,
                    type: 'Anime'
                }));
                
                return res.json({ status: true, data: items });
            } catch (searchError: any) {
                console.error('[Anime Search Error]:', searchError.message);
                return res.json({ status: true, data: [] });
            }
        }

        // Genre list endpoint
        if (action === 'genres') {
            const genres = [
                { id: 'action', name: 'Action', slug: 'action' },
                { id: 'adventure', name: 'Adventure', slug: 'adventure' },
                { id: 'comedy', name: 'Comedy', slug: 'comedy' },
                { id: 'drama', name: 'Drama', slug: 'drama' },
                { id: 'ecchi', name: 'Ecchi', slug: 'ecchi' },
                { id: 'fantasy', name: 'Fantasy', slug: 'fantasy' },
                { id: 'harem', name: 'Harem', slug: 'harem' },
                { id: 'horror', name: 'Horror', slug: 'horror' },
                { id: 'isekai', name: 'Isekai', slug: 'isekai' },
                { id: 'mecha', name: 'Mecha', slug: 'mecha' },
                { id: 'music', name: 'Music', slug: 'music' },
                { id: 'mystery', name: 'Mystery', slug: 'mystery' },
                { id: 'psychological', name: 'Psychological', slug: 'psychological' },
                { id: 'romance', name: 'Romance', slug: 'romance' },
                { id: 'school', name: 'School', slug: 'school' },
                { id: 'sci-fi', name: 'Sci-Fi', slug: 'sci-fi' },
                { id: 'shounen', name: 'Shounen', slug: 'shounen' },
                { id: 'slice-of-life', name: 'Slice of Life', slug: 'slice-of-life' },
                { id: 'sports', name: 'Sports', slug: 'sports' },
                { id: 'supernatural', name: 'Supernatural', slug: 'supernatural' },
                { id: 'thriller', name: 'Thriller', slug: 'thriller' }
            ];
            return res.json({ status: true, data: genres });
        }

        // Genre filter - search by genre keyword
        if (action === 'genre') {
            const genre = req.query.genre || req.query.g;
            if (!genre) return res.status(400).json({ status: false, error: 'Genre parameter required' });
            
            try {
                const response = await fetchWithRetry(`${ANIME_API}/search`, {
                    params: { query: genre }
                });
                
                const searchData = response.data?.data?.[0] || {};
                const animeList = searchData.result || [];
                
                const items = animeList.map((item: any) => ({
                    urlId: item.url,
                    id: item.url || item.id,
                    title: item.judul,
                    judul: item.judul,
                    image: item.cover,
                    thumbnail_url: item.cover,
                    episode: item.total_episode ? `${item.total_episode} Ep` : '',
                    type: 'Anime'
                }));
                
                return res.json({ status: true, data: items, genre });
            } catch (error: any) {
                console.error('[Anime Genre Error]:', error.message);
                return res.json({ status: true, data: [], genre });
            }
        }

        // Movie list - uses search with "movie" keyword as fallback
        if (action === 'movie') {
            try {
                // Use search endpoint as movie API has parsing issues
                const response = await fetchWithRetry(`${ANIME_API}/search`, {
                    params: { query: 'movie' }
                });
                
                const searchData = response.data?.data?.[0] || {};
                const movieList = searchData.result || [];
                
                const items = movieList.map((item: any) => ({
                    urlId: item.url,
                    id: item.url || item.id,
                    title: item.judul,
                    judul: item.judul,
                    image: item.cover,
                    thumbnail_url: item.cover,
                    episode: item.total_episode ? `${item.total_episode} Ep` : 'Movie',
                    type: 'Anime',
                    status: 'Movie'
                }));
                
                return res.json({ status: true, data: items });
            } catch (e: any) {
                console.error('[Anime Movie Error]:', e.message);
                return res.json({ status: true, data: [] });
            }
        }

        // Anime detail - uses /anime/detail?urlId=xxx endpoint
        if (action === 'detail') {
            const urlId = req.query.urlId || req.query.id;
            if (!urlId) return res.status(400).json({ status: false, error: 'urlId or id required' });
            
            // Check cache first
            const cacheKey = `anime_detail_${urlId}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            const response = await fetchWithRetry(`${ANIME_API}/detail`, {
                params: { urlId }
            });
            
            // Response format: data[0] contains anime info
            const rawData = response.data?.data?.[0] || response.data;
            
            // Map chapters to episodes format for frontend
            const episodes = (rawData.chapter || []).map((ch: any) => ({
                id: ch.url,
                episodeId: ch.url,
                episode: ch.ch,
                title: `Episode ${ch.ch}`,
                date: ch.date
            }));
            
            const result = {
                id: rawData.id,
                urlId: rawData.series_id || urlId,
                title: rawData.judul,
                judul: rawData.judul,
                image: rawData.cover,
                cover: rawData.cover,
                thumbnail_url: rawData.cover,
                type: rawData.type,
                status: rawData.status,
                rating: rawData.rating,
                score: rawData.rating,
                synopsis: rawData.sinopsis,
                description: rawData.sinopsis,
                genre: rawData.genre,
                studio: rawData.author,
                published: rawData.published,
                episodes
            };
            
            setCache(cacheKey, result, CACHE_TTL.DETAIL);
            return res.json({ status: true, data: result });
        }

        // Get video - uses /anime/getvideo?chapterUrlId=xxx endpoint
        if (action === 'getvideo') {
            const episodeId = req.query.episodeId || req.query.chapterUrlId;
            if (!episodeId) return res.status(400).json({ status: false, error: 'episodeId required' });
            
            // Check cache first
            const cacheKey = `anime_video_${episodeId}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached });
            }
            
            try {
                const reso = req.query.reso || '720p';
                // Use retry for reliability
                const response = await fetchWithRetry(`${ANIME_API}/getvideo`, {
                    params: { chapterUrlId: episodeId, reso }
                });
                
                const videoData = response.data?.data?.[0] || response.data;
                
                // Extract stream URLs - API returns stream[] array with different resolutions
                const streams = videoData.stream || [];
                let videoUrl = '';
                let servers: any[] = [];
                
                // Priority: Direct MP4 (most reliable) > Pixeldrain > HLS (often 404)
                const mp4Stream = streams.find((s: any) => 
                    s.link?.includes('.mp4') && 
                    !s.link?.includes('pixeldrain') &&
                    s.link?.includes('storage.animekita.org')
                );
                const pixeldrainStream = streams.find((s: any) => s.link?.includes('pixeldrain'));
                const hlsStream = streams.find((s: any) => s.link?.includes('.m3u8'));
                const anyMp4 = streams.find((s: any) => s.link?.includes('.mp4'));
                
                // Prioritize MP4 over HLS for reliability
                if (mp4Stream) {
                    videoUrl = mp4Stream.link;
                } else if (anyMp4) {
                    videoUrl = anyMp4.link;
                } else if (pixeldrainStream) {
                    videoUrl = pixeldrainStream.link;
                } else if (hlsStream) {
                    videoUrl = hlsStream.link;
                } else if (streams.length > 0) {
                    videoUrl = streams[0].link;
                }
                
                // Build servers list for quality selection (MP4 first)
                const sortedStreams = [
                    ...streams.filter((s: any) => s.link?.includes('.mp4') && !s.link?.includes('pixeldrain')),
                    ...streams.filter((s: any) => s.link?.includes('pixeldrain')),
                    ...streams.filter((s: any) => s.link?.includes('.m3u8'))
                ];
                
                servers = sortedStreams.map((s: any) => ({
                    name: s.reso || 'Default',
                    quality: s.reso,
                    url: s.link,
                    provider: s.provide,
                    type: s.link?.includes('.m3u8') ? 'hls' : 'mp4'
                }));
                
                // Determine video type for frontend player
                let videoType = 'mp4';
                if (videoUrl.includes('.m3u8')) {
                    videoType = 'hls';
                } else if (videoUrl.includes('pixeldrain')) {
                    videoType = 'direct';
                }
                
                const result = {
                    video: videoUrl,
                    url: videoUrl,
                    videoType,
                    resolutions: videoData.reso || [],
                    servers,
                    likeCount: videoData.likeCount,
                    dislikeCount: videoData.dislikeCount
                };
                
                // Cache the result
                if (videoUrl) {
                    setCache(cacheKey, result, CACHE_TTL.VIDEO);
                }
                
                return res.json({ status: true, data: result });
            } catch (error: any) {
                console.error('[Anime getvideo Error]:', error.message);
                return res.status(500).json({ 
                    status: false, 
                    error: 'Failed to get video',
                    message: error.message 
                });
            }
        }

        // Get video from specific server/quality
        if (action === 'getserver') {
            const { serverId, reso, chapterUrlId } = req.query;
            if (!chapterUrlId) return res.status(400).json({ status: false, error: 'chapterUrlId required' });
            
            try {
                const response = await fetchWithRetry(`${ANIME_API}/getvideo`, {
                    params: { chapterUrlId, reso: reso || '720p' }
                });
                
                const videoData = response.data?.data?.[0] || response.data;
                const streams = videoData.stream || [];
                
                // Find requested quality or first available
                const requestedStream = streams.find((s: any) => s.reso === reso) || streams[0];
                const videoUrl = requestedStream?.link || '';
                
                return res.json({
                    status: true,
                    data: {
                        url: videoUrl,
                        video: videoUrl,
                        quality: requestedStream?.reso
                    }
                });
            } catch (err: any) {
                console.error('[Anime Server Error]:', err.message);
                return res.status(500).json({ status: false, error: 'Failed to get server video' });
            }
        }

        // Jikan API cover lookup (keep existing functionality)
        if (action === 'jikan-cover') {
            const { title } = req.query;
            if (!title) return res.status(400).json({ status: false, error: 'Title required' });
            
            try {
                const result = await getJikanCoverWithCache(title as string);
                if (result) {
                    return res.json({ status: true, data: result });
                }
                return res.json({ status: false, error: 'Anime not found on Jikan' });
            } catch (jikanError: any) {
                console.error('[Jikan API Error]:', jikanError.message);
                return res.json({ status: false, error: 'Failed to fetch from Jikan API' });
            }
        }

        return res.status(404).json({ status: false, error: 'Unknown anime action' });
    } catch (error: any) {
        console.error('[Anime Error]:', error.message);
        return res.status(500).json({ status: false, error: 'Failed to fetch anime data', details: error.message });
    }
}

// Komik handler - Scraper Komikindo (CuymangaAPI style)
async function handleKomikNew(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { 
        timeout: 30000, 
        headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0'
        } 
    };

    // Helper function to get path from URL
    function getPathFromUrl(url: string): string {
        if (!url) return '';
        // Handle multiple possible komikindo domains
        const komikDomains = ['komikindo.ch', 'komikindo2.com', 'komikindo.co', 'komikindo.lol'];
        try {
            const parsedUrl = new URL(url);
            if (komikDomains.some(domain => parsedUrl.hostname.includes(domain))) {
                return parsedUrl.pathname;
            }
        } catch {
            // Not a valid URL, just return as-is
        }
        return url;
    }

    // Helper to extract manga_id from path
    function getMangaIdFromPath(path: string): string {
        return path.replace('/komik/', '').replace(/^\//, '').replace(/\/$/, '');
    }

    // Helper to clean text
    function cleanText(text: string): string {
        if (!text) return '';
        return text.replace(/\s+/g, ' ').trim();
    }

    try {
        // Latest/Popular komik
        if (action === 'popular' || action === 'latest' || !action) {
            const page = req.query.page || '1';
            
            // Check cache first
            const cacheKey = `komik_popular_${page}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ status: true, data: cached, cached: true });
            }
            
            const url = `${KOMIK_BASE_URL}/komik-terbaru/page/${page}`;
            
            const response = await axios.get(url, config);
            const $ = cheerio.load(response.data);
            
            const results: any[] = [];
            const komikPopuler: any[] = [];
            
            // Get latest manga - using correct selectors for new komikindo.ch structure
            $('.animepost').each((i, el) => {
                // Title is in .tt h3 a (not h4)
                const titleEl = $(el).find('.tt h3 a');
                const title = titleEl.text().trim() || $(el).find('a[rel="bookmark"]').attr('title')?.replace('Komik ', '') || 'Tidak ada judul';
                const link = getPathFromUrl(titleEl.attr('href') || $(el).find('a[rel="bookmark"]').attr('href') || '');
                const image = $(el).find('img[itemprop="image"]').attr('src') || '';
                const typeClass = $(el).find('.typeflag').attr('class') || '';
                const type = typeClass.split(' ').pop() || 'Manga';
                const color = $(el).find('.warnalabel').text().trim() || 'Hitam';
                
                const chapters: any[] = [];
                $(el).find('.lsch').each((j, chEl) => {
                    const chTitle = $(chEl).find('a').text().trim().replace('Ch.', 'Chapter') || 'Chapter';
                    const chLink = getPathFromUrl($(chEl).find('a').attr('href') || '');
                    const chDate = $(chEl).find('.datech').text().trim() || '';
                    chapters.push({ judul: chTitle, link: chLink, tanggal_rilis: chDate });
                });
                
                // Extract manga_id from link
                const manga_id = getMangaIdFromPath(link);
                
                results.push({
                    manga_id,
                    id: manga_id,
                    judul: title,
                    title: title,
                    link,
                    gambar: image,
                    image,
                    thumbnail: image,
                    tipe: type,
                    type,
                    warna: color,
                    chapter: chapters.length > 0 ? chapters[0].judul : '',
                    chapters
                });
            });
            
            // Get popular manga - using correct selectors for new structure
            $('.serieslist.pop li').each((i, el) => {
                const rank = $(el).find('.ctr').text().trim() || String(i + 1);
                // Title is in h3 a.series (not h4)
                const titleEl = $(el).find('h3 a.series');
                const title = titleEl.text().trim() || titleEl.attr('title')?.replace('Komik ', '') || 'Tidak ada judul';
                const link = getPathFromUrl(titleEl.attr('href') || $(el).find('a.series').attr('href') || '');
                const image = $(el).find('.imgseries img').attr('src') || '';
                const author = $(el).find('.author').text().trim() || '';
                const ratingText = $(el).find('.loveviews').text().trim() || '';
                const rating = ratingText.split(/\s+/).pop() || '';
                
                const manga_id = getMangaIdFromPath(link);
                
                komikPopuler.push({
                    manga_id,
                    id: manga_id,
                    peringkat: rank,
                    judul: title,
                    title: title,
                    link,
                    penulis: author,
                    rating,
                    gambar: image,
                    image,
                    thumbnail: image
                });
            });
            
            // Get pagination
            const pagination = $('.pagination a.page-numbers');
            const totalPages = pagination.length > 1 
                ? parseInt($(pagination[pagination.length - 2]).text().trim()) || 1 
                : 1;
            
            const resultData = results.length > 0 ? results : komikPopuler;
            setCache(cacheKey, resultData, CACHE_TTL.LIST);
            
            return res.json({ 
                status: true, 
                data: resultData,
                komik_populer: komikPopuler,
                total_halaman: totalPages
            });
        }

        // Search komik
        if (action === 'search') {
            const keyword = req.query.keyword || req.query.q;
            const page = req.query.page || '1';
            if (!keyword) return res.status(400).json({ status: false, error: 'Keyword required' });
            
            const url = `${KOMIK_BASE_URL}/page/${page}/?s=${encodeURIComponent(String(keyword))}`;
            const response = await axios.get(url, config);
            const $ = cheerio.load(response.data);
            
            const results: any[] = [];
            
            $('.animepost').each((i, el) => {
                // Title is in .tt h3 a (not h4)
                const titleEl = $(el).find('.tt h3 a');
                const title = titleEl.text().trim() || $(el).find('a[rel="bookmark"]').attr('title')?.replace('Komik ', '') || 'Tidak ada judul';
                const rating = $(el).find('.rating i').text().trim() || '0';
                const link = getPathFromUrl(titleEl.attr('href') || $(el).find('a[rel="bookmark"]').attr('href') || '');
                const image = $(el).find('img[itemprop="image"]').attr('src') || '';
                const typeClass = $(el).find('.typeflag').attr('class') || '';
                const type = typeClass.split(' ').pop() || 'Manga';
                
                const manga_id = getMangaIdFromPath(link);
                
                results.push({
                    manga_id,
                    id: manga_id,
                    judul: title,
                    title: title,
                    rating,
                    link,
                    gambar: image,
                    image,
                    thumbnail: image,
                    tipe: type,
                    type
                });
            });
            
            return res.json({ status: true, data: results });
        }

        // Detail komik
        if (action === 'detail') {
            const manga_id = req.query.manga_id;
            if (!manga_id) return res.status(400).json({ status: false, error: 'manga_id required' });
            
            const url = `${KOMIK_BASE_URL}/komik/${manga_id}`;
            const response = await axios.get(url, config);
            const $ = cheerio.load(response.data);
            
            const title = $('h1.entry-title').text().trim() || 'Tidak ada judul';
            const description = cleanText($('.entry-content.entry-content-single[itemprop="description"] p').text()) || 'Tidak ada deskripsi';
            const image = $('.thumb img').attr('src') || '';
            const rating = $('i[itemprop="ratingValue"]').text().trim() || '';
            const votes = $('.votescount').text().trim() || '';
            
            const detail: any = {
                judul_alternatif: null,
                status: null,
                pengarang: null,
                ilustrator: null,
                jenis_komik: null,
                tema: null
            };
            
            $('.spe span').each((i, el) => {
                const key = $(el).find('b').text().trim().replace(':', '').toLowerCase();
                let value = cleanText($(el).text().replace($(el).find('b').text(), ''));
                
                switch (key) {
                    case 'judul alternatif': detail.judul_alternatif = value; break;
                    case 'status': detail.status = value; break;
                    case 'pengarang': detail.pengarang = value; break;
                    case 'ilustrator': detail.ilustrator = value; break;
                    case 'tema': detail.tema = value; break;
                    case 'jenis komik': detail.jenis_komik = value; break;
                }
            });
            
            const genre: any[] = [];
            $('.genre-info a').each((i, el) => {
                genre.push({
                    nama: $(el).text().trim(),
                    link: getPathFromUrl($(el).attr('href') || '').replace('/genres/', '')
                });
            });
            
            const chapters: any[] = [];
            $('.listeps ul li').each((i, el) => {
                const chapterTitle = $(el).find('.lchx a').text().trim() || 'Chapter';
                const chapterLink = getPathFromUrl($(el).find('.lchx a').attr('href') || '');
                const releaseTime = $(el).find('.dt a').text().trim() || '';
                
                // Extract chapter ID from link
                const chapterId = chapterLink.replace(/^\//, '').replace(/\/$/, '');
                
                chapters.push({
                    judul_chapter: chapterTitle,
                    link_chapter: chapterLink,
                    chapterId: chapterId,
                    id: chapterId,
                    waktu_rilis: releaseTime
                });
            });
            
            const id = $('article').attr('id')?.replace('post-', '') || manga_id;
            
            return res.json({ 
                status: true, 
                data: {
                    id,
                    manga_id,
                    judul: title,
                    title: title,
                    gambar: image,
                    image,
                    thumbnail: image,
                    rating,
                    votes,
                    detail,
                    genre,
                    genres: genre.map(g => g.nama),
                    desk: description,
                    synopsis: description,
                    daftar_chapter: chapters,
                    chapters
                }
            });
        }

        // Read chapter
        if (action === 'chapter') {
            const chapterId = req.query.chapterId;
            if (!chapterId) return res.status(400).json({ status: false, error: 'chapterId required' });
            
            const url = `${KOMIK_BASE_URL}/${chapterId}`;
            const response = await axios.get(url, config);
            const $ = cheerio.load(response.data);
            
            const title = $('.entry-title').text().trim() || 'Chapter';
            const id = $('article').attr('id')?.replace('post-', '') || '';
            
            const navigasi = {
                sebelumnya: getPathFromUrl($('a[rel="prev"]').attr('href') || ''),
                selanjutnya: getPathFromUrl($('a[rel="next"]').attr('href') || '')
            };
            
            const images: any[] = [];
            $('.chapter-image img').each((index, el) => {
                const imgSrc = $(el).attr('src');
                if (imgSrc) {
                    images.push({
                        id: index + 1,
                        url: imgSrc
                    });
                }
            });
            
            // Info komik
            const infoKomik = {
                judul: $('.infox h2').text().trim() || '',
                desk: $('.shortcsc').text().trim() || ''
            };
            
            return res.json({ 
                status: true, 
                data: {
                    id,
                    judul: title,
                    title: title,
                    navigasi,
                    gambar: images,
                    images: images,
                    info_komik: infoKomik
                }
            });
        }

        return res.status(404).json({ status: false, error: 'Unknown komik action' });
    } catch (error: any) {
        console.error('[Komik Scraper Error]:', error.message);
        return res.status(500).json({ status: false, error: 'Failed to fetch komik data', details: error.message });
    }
}

// ==================== DONGHUA HANDLERS ====================
const AnichinScraper = require('@zhadev/anichin').default;
const donghuaScraper = new AnichinScraper({
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000
});

async function handleDonghua(action: string, req: VercelRequest, res: VercelResponse) {
    try {
        // GET /api/donghua/home - Get trending/featured donghua
        if (action === 'home' || !action) {
            const page = parseInt(req.query.page as string) || 1;
            const result = await donghuaScraper.home(page);
            
            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch donghua home',
                    message: result.message
                });
            }
            
            return res.json({
                success: true,
                data: result.data.home,
                page,
                source: 'anichin'
            });
        }
        
        // GET /api/donghua/ongoing - Get ongoing donghua series
        if (action === 'ongoing') {
            const page = parseInt(req.query.page as string) || 1;
            
            // Check cache first
            const cacheKey = `donghua_ongoing_${page}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ success: true, data: cached, page, source: 'anichin', cached: true });
            }
            
            const result = await donghuaScraper.ongoing(page);
            
            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch ongoing donghua',
                    message: result.message
                });
            }
            
            const data = result.data.lists || [];
            setCache(cacheKey, data, CACHE_TTL.LIST);
            
            return res.json({
                success: true,
                data,
                page,
                source: 'anichin'
            });
        }
        
        // GET /api/donghua/completed - Get completed donghua series
        if (action === 'completed') {
            const page = parseInt(req.query.page as string) || 1;
            const result = await donghuaScraper.completed(page);
            
            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch completed donghua',
                    message: result.message
                });
            }
            
            return res.json({
                success: true,
                data: result.data.lists || [],
                page,
                source: 'anichin'
            });
        }
        
        // GET /api/donghua/search?q=keyword - Search donghua
        if (action === 'search') {
            const query = req.query.q as string;
            const page = parseInt(req.query.page as string) || 1;
            
            if (!query) {
                return res.status(400).json({ success: false, error: 'Query parameter is required' });
            }
            
            const result = await donghuaScraper.search(query, page);
            
            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to search donghua',
                    message: result.message
                });
            }
            
            return res.json({
                success: true,
                query,
                data: result.data.search.items || [],
                page,
                source: 'anichin'
            });
        }
        
        // GET /api/donghua/schedule?day=monday - Get donghua schedule
        if (action === 'schedule') {
            const day = req.query.day as string;
            const result = await donghuaScraper.schedule(day);
            
            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch schedule',
                    message: result.message
                });
            }
            
            return res.json({
                success: true,
                data: result.data.schedule,
                source: 'anichin'
            });
        }
        
        // GET /api/donghua/detail/:slug - Get donghua detail by slug
        if (action === 'detail') {
            const slug = req.query.slug as string;
            
            if (!slug) {
                return res.status(400).json({ success: false, error: 'Slug parameter is required' });
            }
            
            // Check cache first
            const cacheKey = `donghua_detail_${slug}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ success: true, data: cached, source: 'anichin', cached: true });
            }
            
            const result = await donghuaScraper.series(slug);
            
            if (!result.success) {
                return res.status(404).json({
                    success: false,
                    error: 'Donghua not found',
                    message: result.message
                });
            }
            
            const detail = result.data.detail;
            setCache(cacheKey, detail, CACHE_TTL.DETAIL);
            
            return res.json({
                success: true,
                data: detail,
                source: 'anichin'
            });
        }
        
        // GET /api/donghua/watch?slug=xxx&episode=1 - Watch donghua episode
        if (action === 'watch') {
            const slug = req.query.slug as string;
            const episode = req.query.episode as string;
            
            if (!slug || !episode) {
                return res.status(400).json({ success: false, error: 'Slug and episode parameters are required' });
            }
            
            // Check cache first
            const cacheKey = `donghua_watch_${slug}_${episode}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json({ success: true, data: cached, source: 'anichin', cached: true });
            }
            
            const result = await donghuaScraper.watch(slug, episode);
            
            if (!result.success) {
                return res.status(404).json({
                    success: false,
                    error: 'Episode not found',
                    message: result.message
                });
            }
            
            // Decode base64 server URLs to actual iframe URLs
            const watch = result.data.watch;
            if (watch.servers && watch.servers.length > 0) {
                watch.servers = watch.servers.map((server: any) => {
                    try {
                        // Decode base64 URL
                        const decodedUrl = Buffer.from(server.server_url, 'base64').toString('utf-8');
                        return {
                            ...server,
                            server_url: decodedUrl,
                            server_url_encoded: server.server_url
                        };
                    } catch {
                        return server;
                    }
                });
            }
            
            // Cache the result
            setCache(cacheKey, watch, CACHE_TTL.VIDEO);
            
            return res.json({
                success: true,
                data: watch,
                source: 'anichin'
            });
        }
        
        return res.status(404).json({ success: false, error: 'Unknown donghua action' });
    } catch (error: any) {
        console.error('[Donghua] Error:', error.message);
        return res.status(500).json({ success: false, error: 'Server error', message: error.message });
    }
}

// Dramabox handlers (legacy)
async function handleDramabox(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    if (action === 'latest' || action === 'trending' || action === 'vip' || action === 'foryou') {
        const response = await axios.get(`${API_BASE}/dramabox/${action}`, config);
        // API returns array directly or { data: [...] } or { value: [...] }
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || response.data?.value || []);
        return res.json(results);
    }

    if (action === 'dubindo') {
        const classify = req.query.classify || 'terbaru';
        const response = await axios.get(`${API_BASE}/dramabox/dubindo`, {
            ...config,
            params: { classify }
        });
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || response.data?.value || []);
        return res.json(results);
    }

    if (action === 'search') {
        const q = req.query.q || req.query.query;
        if (!q) return res.status(400).json({ error: 'Query required' });
        const response = await axios.get(`${API_BASE}/dramabox/search`, {
            ...config,
            params: { query: q }
        });
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || response.data?.value || []);
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

// Anime handlers
async function handleAnime(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    // Latest anime episodes
    if (action === 'latest' || !action) {
        try {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/recent`, {
                ...config,
                params: { page }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes || 'Latest',
                releaseDate: item.releasedOn,
                type: 'Anime'
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
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes || '?',
                rating: item.rating || '?',
                type: 'Anime'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error(`[Anime ${action} Error]:`, error.message);
            return res.status(500).json({ error: `Failed to fetch ${action} anime` });
        }
    }

    // Movie anime
    if (action === 'movie') {
        try {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/movies`, {
                ...config,
                params: { page }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: 'Movie',
                type: 'Movie'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error('[Anime Movie Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch anime movies' });
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
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes || '?',
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
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes || '?',
                rating: item.rating || '?',
                type: 'Anime'
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
                synopsis: data.synopsis?.paragraphs?.join('\\n\\n') || 'No synopsis available',
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

// Legacy Komik handlers - Not used (using handleKomikNew instead)
// Keeping stub for backwards compatibility if needed
async function handleKomik(action: string, req: VercelRequest, res: VercelResponse) {
    // Redirect to new handler
    return await handleKomikNew(action, req, res);
}

// Proxy handler
async function handleProxy(action: string, req: VercelRequest, res: VercelResponse) {
    if (action === 'image') {
        const { url } = req.query;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL required' });
        }

        try {
            // Determine referer based on URL
            let referer = '';
            try {
                referer = new URL(url).origin;
            } catch {
                referer = 'https://otakudesu.best';
            }
            
            // Special handling for various domains
            if (url.includes('shngm.id') || url.includes('shinigami')) {
                referer = 'https://shinigami.id';
            } else if (url.includes('otakudesu')) {
                referer = 'https://otakudesu.best';
            } else if (url.includes('animekita')) {
                referer = 'https://animekita.org';
            } else if (url.includes('myanimelist')) {
                referer = 'https://myanimelist.net';
            } else if (url.includes('komikindo')) {
                referer = 'https://komikindo.ch';
            } else if (url.includes('wp.com')) {
                // WordPress CDN - needs original site as referer
                // Extract the original domain from the URL path
                const wpMatch = url.match(/wp\.com\/([^\/]+)/);
                if (wpMatch) {
                    referer = 'https://' + wpMatch[1];
                } else {
                    referer = 'https://otakudesu.best';
                }
            }
            
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': referer,
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
                }
            });

            const contentType = response.headers['content-type'] || 'image/jpeg';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours cache
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.send(Buffer.from(response.data));
        } catch (error: any) {
            console.error('[Image Proxy Error]:', error.message, 'URL:', url);
            return res.status(404).json({ error: 'Image not found' });
        }
    }

    if (action === 'video') {
        const { url } = req.query;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL required' });
        }

        // Determine referer based on URL pattern
        let referer = 'https://www.dramabox.com';
        let origin = 'https://www.dramabox.com';
        
        if (url.includes('dramabox')) {
            referer = 'https://www.dramabox.com';
            origin = 'https://www.dramabox.com';
        } else if (url.includes('/_v7/') || url.includes('megacloud') || url.includes('rapid-cloud')) {
            referer = 'https://megacloud.tv';
            origin = 'https://megacloud.tv';
        } else {
            try {
                referer = new URL(url).origin;
                origin = referer;
            } catch {}
        }

        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxContentLength: 100 * 1024 * 1024, // 100MB max
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': referer,
                    'Origin': origin,
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Range': req.headers.range || 'bytes=0-'
                }
            });

            const contentType = response.headers['content-type'] || 'video/mp4';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }
            if (response.headers['accept-ranges']) {
                res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            }
            return res.send(Buffer.from(response.data));
        } catch (error: any) {
            console.error('[Video Proxy Error]:', error.message);
            return res.status(404).json({ error: 'Video not found', details: error.message });
        }
    }

    // direct proxy endpoint: /api?path=proxy&url=...
    // Allows simple proxying of arbitrary http(s) resources (for players)
    if (req.method === 'GET' && req.query && req.query.url && typeof req.query.url === 'string') {
        const url = req.query.url as string;
        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).json({ error: 'Invalid url' });
        }
        try {
            const referer = new URL(url).origin;
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxContentLength: 200 * 1024 * 1024,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': referer,
                    'Range': req.headers.range || 'bytes=0-'
                }
            });
            // Forward headers
            const contentType = response.headers['content-type'] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
            if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            return res.send(Buffer.from(response.data));
        } catch (err: any) {
            console.error('[Direct Proxy Error]:', err.message);
            return res.status(502).json({ error: 'Upstream fetch failed', details: err.message });
        }
    }

    return res.status(404).json({ error: 'Unknown proxy action' });
}

// ==================== DIRECT PROXY HANDLER ====================
// Support /api?path=proxy&url=... convenience endpoint
async function handleProxyDirect(req: VercelRequest, res: VercelResponse) {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL required' });
    }
    
    try {
        // Determine referer from URL
        let referer = '';
        try {
            referer = new URL(url).origin;
        } catch {
            referer = 'https://memenesia.web.id';
        }
        
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': referer,
                'Origin': referer,
                'Accept': '*/*'
            },
            maxRedirects: 5
        });
        
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
        return res.send(Buffer.from(response.data));
    } catch (err: any) {
        console.error('[Direct Proxy Error]:', err.message);
        return res.status(502).json({ error: 'Upstream fetch failed', details: err.message });
    }
}

// ==================== VIDEOS API HANDLER ====================
// Video data cache (loaded once per cold start)
let videosCache: any[] | null = null;
let videosCacheTime = 0;
const VIDEOS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadVideosData(): Promise<any[]> {
    const now = Date.now();
    if (videosCache && (now - videosCacheTime) < VIDEOS_CACHE_TTL) {
        return videosCache;
    }
    
    // Try loading from filesystem first (works in dev/local)
    try {
        const dataPath = path.join(process.cwd(), 'data', 'videos.json');
        if (fs.existsSync(dataPath)) {
            const raw = fs.readFileSync(dataPath, 'utf-8');
            videosCache = JSON.parse(raw || '[]');
            videosCacheTime = now;
            console.log('[Videos] Loaded from filesystem:', videosCache?.length);
            return videosCache || [];
        }
    } catch (e) {
        console.log('[Videos] Filesystem load failed, trying public folder');
    }
    
    // Try loading from public folder (works on Vercel)
    try {
        const publicPath = path.join(process.cwd(), 'public', 'data', 'videos.json');
        if (fs.existsSync(publicPath)) {
            const raw = fs.readFileSync(publicPath, 'utf-8');
            videosCache = JSON.parse(raw || '[]');
            videosCacheTime = now;
            console.log('[Videos] Loaded from public folder:', videosCache?.length);
            return videosCache || [];
        }
    } catch (e) {
        console.log('[Videos] Public folder load failed');
    }
    
    console.log('[Videos] No data file found');
    return [];
}

async function handleVideos(action: string, req: VercelRequest, res: VercelResponse) {
    const videos = await loadVideosData();

    // GET list -> /api/videos or /api/videos?action=list
    if (!action || action === 'list') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const q = (req.query.q as string) || '';
        const category = (req.query.category as string) || '';
        const page = parseInt((req.query.page as string) || '1', 10) || 1;
        const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 200);

        let filtered = videos;
        if (q) {
            const ql = q.toLowerCase();
            filtered = filtered.filter(v => (v.title || '').toLowerCase().includes(ql) || (v.description || '').toLowerCase().includes(ql));
        }
        if (category) {
            const cl = category.toLowerCase();
            filtered = filtered.filter(v => (v.categories || []).some((c: string) => c.toLowerCase().includes(cl)));
        }

        const total = filtered.length;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pageItems = filtered.slice(start, end);

        return res.json({ total, page, limit, results: pageItems });
    }

    // GET detail -> /api/videos/:id where action is id
    if (req.method === 'GET') {
        const vid = action;
        const found = videos.find(v => v.id === vid || v.slug === vid);
        if (!found) return res.status(404).json({ error: 'Not found' });
        return res.json(found);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// ==================== ANTI-ADBLOCK: AD ASSETS PROXY ====================
// Serve ad scripts as first-party content to bypass adblockers
async function handleAdAssets(pathStr: string, req: VercelRequest, res: VercelResponse) {
    // Map obfuscated paths to actual ad scripts
    const adScriptMap: { [key: string]: { url: string; type: string } } = {
        // Monetag scripts
        'assets/core.js': { url: 'https://nap5k.com/tag.min.js', type: 'application/javascript' },
        'assets/vg.js': { url: 'https://gizokraijaw.net/vignette.min.js', type: 'application/javascript' },
        'lib/analytics.js': { url: 'https://nap5k.com/tag.min.js', type: 'application/javascript' },
        
        // Adsterra Native Banner (legacy)
        'assets/native.js': { 
            url: 'https://pl28403034.effectivegatecpm.com/ebbbe73e25be8893e3d2fec6992015fa/invoke.js', 
            type: 'application/javascript' 
        },
        
        // Adsterra Display Banner 468x60
        'assets/banner1.js': { 
            url: 'https://www.highperformanceformat.com/346f68ab1f24fb193dcebf3cbec5a2d9/invoke.js', 
            type: 'application/javascript' 
        },
        
        // Adsterra Display Banner 300x250
        'assets/banner2.js': { 
            url: 'https://www.highperformanceformat.com/25711230aa5051aa49e41d777b0b95e8/invoke.js', 
            type: 'application/javascript' 
        },
        
        // Alternative paths for redundancy
        'lib/widget.js': { url: 'https://nap5k.com/tag.min.js', type: 'application/javascript' },
        'lib/display.js': { url: 'https://gizokraijaw.net/vignette.min.js', type: 'application/javascript' },
    };

    const mapping = adScriptMap[pathStr];
    
    if (!mapping) {
        return res.status(404).json({ error: 'Asset not found' });
    }

    try {
        const response = await axios.get(mapping.url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            responseType: 'text'
        });

        let scriptContent = response.data;
        
        // Set headers to look like a normal JS file
        res.setHeader('Content-Type', mapping.type);
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        return res.send(scriptContent);
    } catch (error: any) {
        console.error('[Ad Assets Proxy Error]:', error.message);
        // Return empty script on error to prevent page breaks
        res.setHeader('Content-Type', 'application/javascript');
        return res.send('/* asset loading */');
    }
}