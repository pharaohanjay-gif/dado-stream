import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as cheerio from 'cheerio';

// API endpoints
const API_BASE = 'https://api.sansekai.my.id/api';
const ANIME_API = 'https://www.sankavollerei.com/anime/samehadaku';
const KOMIK_BASE_URL = 'https://komikindo.ch';

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'dado-stream-secret-key-2024';
const MONGODB_URI = process.env.MONGODB_URI || '';

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
        } else if (pathStr.startsWith('auth/')) {
            return await handleAuth(pathStr.replace('auth/', ''), req, res);
        } else if (pathStr.startsWith('admin/')) {
            return await handleAdmin(pathStr.replace('admin/', ''), req, res);
        } else if (pathStr.startsWith('analytics/')) {
            return await handleAnalytics(pathStr.replace('analytics/', ''), req, res);
        } else if (pathStr.startsWith('dramabox/')) {
            return await handleDramabox(pathStr.replace('dramabox/', ''), req, res);
        } else if (pathStr.startsWith('proxy/')) {
            return await handleProxy(pathStr.replace('proxy/', ''), req, res);
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
    const config = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    try {
        if (action === 'latest' || action === 'trending' || action === 'vip' || action === 'foryou' || !action) {
            const endpoint = action || 'latest';
            const response = await axios.get(`${API_BASE}/dramabox/${endpoint}`, config);
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
            
            return res.json({ status: true, data: items });
        }

        if (action === 'search') {
            const keyword = req.query.keyword || req.query.q || req.query.query;
            if (!keyword) return res.status(400).json({ status: false, error: 'Keyword required' });
            const response = await axios.get(`${API_BASE}/dramabox/search`, {
                ...config,
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
            return res.json({ status: true, data: items });
        }

        if (action === 'detail') {
            const { bookId } = req.query;
            if (!bookId) return res.status(400).json({ status: false, error: 'bookId required' });
            const response = await axios.get(`${API_BASE}/dramabox/detail`, {
                ...config,
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
            return res.json({ status: true, data: result });
        }

        if (action === 'allepisode') {
            const { bookId } = req.query;
            if (!bookId) return res.status(400).json({ status: false, error: 'bookId required' });
            const response = await axios.get(`${API_BASE}/dramabox/allepisode`, {
                ...config,
                params: { bookId }
            });
            const results = Array.isArray(response.data) ? response.data : (response.data?.data || []);
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
            
            try {
                const response = await axios.get(`${API_BASE}/dramabox/allepisode`, {
                    ...config,
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
                
                return res.json({ 
                    status: true, 
                    data: {
                        video: videoUrl,
                        url: videoUrl,
                        playUrl: videoUrl,
                        servers: servers,
                        episode: episode.chapterName,
                        thumbnail: episode.chapterImg
                    }
                });
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

// Anime handler (new format)
async function handleAnimeNew(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    try {
        if (action === 'latest' || !action) {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/recent`, {
                ...config,
                params: { page }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                urlId: item.animeId,
                id: item.animeId,
                title: item.title,
                judul: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes || 'Latest',
                releaseDate: item.releasedOn,
                type: 'Anime'
            }));
            
            return res.json({ status: true, data: items });
        }

        if (action === 'trending' || action === 'popular') {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/popular`, {
                ...config,
                params: { page }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                urlId: item.animeId,
                id: item.animeId,
                title: item.title,
                judul: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes,
                type: 'Anime'
            }));
            
            return res.json({ status: true, data: items });
        }

        if (action === 'search') {
            const keyword = req.query.keyword || req.query.q;
            if (!keyword) return res.status(400).json({ status: false, error: 'Keyword required' });
            
            const response = await axios.get(`${ANIME_API}/search`, {
                ...config,
                params: { q: keyword }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                urlId: item.animeId,
                id: item.animeId,
                title: item.title,
                judul: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                type: 'Anime'
            }));
            
            return res.json({ status: true, data: items });
        }

        if (action === 'detail') {
            const { urlId } = req.query;
            if (!urlId) return res.status(400).json({ status: false, error: 'urlId required' });
            
            // Correct endpoint format: /anime/{animeId} not /detail/{animeId}
            const response = await axios.get(`${ANIME_API}/anime/${urlId}`, config);
            const data = response.data?.data || response.data;
            
            // Get episode list
            const episodes = data?.episodeList || [];
            
            return res.json({ 
                status: true, 
                data: {
                    ...data,
                    urlId,
                    episodes: episodes.map((ep: any) => ({
                        id: ep.episodeId,
                        episodeId: ep.episodeId,
                        episode: ep.title || ep.episode,
                        title: ep.title
                    }))
                }
            });
        }

        if (action === 'getvideo') {
            const { episodeId } = req.query;
            if (!episodeId) return res.status(400).json({ status: false, error: 'episodeId required' });
            
            // Correct endpoint format: /episode/{episodeId} not /watch/{episodeId}
            const response = await axios.get(`${ANIME_API}/episode/${episodeId}`, config);
            const data = response.data?.data || response.data;
            
            // Extract video URL from defaultStreamingUrl or server list
            let videoUrl = data?.defaultStreamingUrl;
            let servers: any[] = [];
            
            // Extract server list
            if (data?.server?.qualities) {
                data.server.qualities.forEach((q: any) => {
                    if (q.serverList && q.serverList.length > 0) {
                        q.serverList.forEach((s: any) => {
                            servers.push({
                                name: s.title,
                                quality: q.title,
                                serverId: s.serverId,
                                href: s.href
                            });
                        });
                    }
                });
            }
            
            return res.json({ 
                status: true, 
                data: {
                    ...data,
                    video: videoUrl,
                    url: videoUrl,
                    servers
                }
            });
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
            
            return res.json({ 
                status: true, 
                data: results.length > 0 ? results : komikPopuler,
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
            // Determine referer based on URL
            let referer = '';
            try {
                referer = new URL(url).origin;
            } catch {
                referer = 'https://shinigami.id';
            }
            
            // Special handling for shinigami/shngm images
            if (url.includes('shngm.id') || url.includes('shinigami')) {
                referer = 'https://shinigami.id';
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
            res.setHeader('Cache-Control', 'public, max-age=86400');
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

    return res.status(404).json({ error: 'Unknown proxy action' });
}
