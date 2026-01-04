import { Analytics } from '../models/Analytics';
import { ViewLog } from '../models/ViewLog';
import { Session } from '../models/Session';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

export interface VisitorStats {
    today: number;
    week: number;
    month: number;
    year: number;
}

export interface TrendData {
    labels: string[];
    values: number[];
}

export interface PopularContent {
    drama: Array<{ id: string; title: string; views: number }>;
    anime: Array<{ id: string; title: string; views: number }>;
    komik: Array<{ id: string; title: string; views: number }>;
}

export interface GeoStats {
    country: string;
    countryCode: string;
    count: number;
    percentage: number;
}

/**
 * Get visitor count for different time periods
 */
export async function getVisitorStats(): Promise<VisitorStats> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = subDays(now, 7);
    const monthStart = subDays(now, 30);
    const yearStart = subDays(now, 365);

    const [today, week, month, year] = await Promise.all([
        Analytics.countDocuments({
            eventType: 'pageview',
            timestamp: { $gte: todayStart }
        }),
        Analytics.countDocuments({
            eventType: 'pageview',
            timestamp: { $gte: weekStart }
        }),
        Analytics.countDocuments({
            eventType: 'pageview',
            timestamp: { $gte: monthStart }
        }),
        Analytics.countDocuments({
            eventType: 'pageview',
            timestamp: { $gte: yearStart }
        })
    ]);

    return { today, week, month, year };
}

/**
 * Get visitor trend for last N days
 */
export async function getVisitorTrend(days: number = 7): Promise<TrendData> {
    const dates: string[] = [];
    const values: number[] = [];

    for (let i = days - 1; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, 'yyyy-MM-dd');
        dates.push(format(date, 'MMM dd'));

        const count = await Analytics.countDocuments({
            eventType: 'pageview',
            date: dateStr
        });
        values.push(count);
    }

    return { labels: dates, values };
}

/**
 * Get hourly visitor distribution for today
 */
export async function getHourlyStats(): Promise<TrendData> {
    const today = format(new Date(), 'yyyy-MM-dd');
    const labels: string[] = [];
    const values: number[] = [];

    for (let hour = 0; hour < 24; hour++) {
        labels.push(`${hour}:00`);
        const count = await Analytics.countDocuments({
            date: today,
            hour: hour,
            eventType: 'pageview'
        });
        values.push(count);
    }

    return { labels, values };
}

/**
 * Get currently active viewers
 */
export async function getActiveViewers(): Promise<number> {
    // Sessions active in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return await Session.countDocuments({
        isActive: true,
        lastActivity: { $gte: fiveMinutesAgo }
    });
}

/**
 * Get current watching sessions with details
 */
export async function getCurrentWatchers(limit: number = 20) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    return await Session.find({
        isActive: true,
        lastActivity: { $gte: fiveMinutesAgo },
        'currentContent.type': { $exists: true }
    })
        .select('location currentContent device lastActivity')
        .sort({ lastActivity: -1 })
        .limit(limit)
        .lean();
}

/**
 * Get popular content by views
 */
export async function getPopularContent(days: number = 7): Promise<PopularContent> {
    const since = format(subDays(new Date(), days), 'yyyy-MM-dd');

    const [drama, anime, komik] = await Promise.all([
        ViewLog.aggregate([
            { $match: { contentType: 'drama', date: { $gte: since } } },
            {
                $group: {
                    _id: '$contentId',
                    title: { $first: '$contentTitle' },
                    views: { $sum: 1 }
                }
            },
            { $sort: { views: -1 } },
            { $limit: 10 },
            { $project: { _id: 0, id: '$_id', title: 1, views: 1 } }
        ]),
        ViewLog.aggregate([
            { $match: { contentType: 'anime', date: { $gte: since } } },
            {
                $group: {
                    _id: '$contentId',
                    title: { $first: '$contentTitle' },
                    views: { $sum: 1 }
                }
            },
            { $sort: { views: -1 } },
            { $limit: 10 },
            { $project: { _id: 0, id: '$_id', title: 1, views: 1 } }
        ]),
        ViewLog.aggregate([
            { $match: { contentType: 'komik', date: { $gte: since } } },
            {
                $group: {
                    _id: '$contentId',
                    title: { $first: '$contentTitle' },
                    views: { $sum: 1 }
                }
            },
            { $sort: { views: -1 } },
            { $limit: 10 },
            { $project: { _id: 0, id: '$_id', title: 1, views: 1 } }
        ])
    ]);

    return { drama, anime, komik };
}

/**
 * Get geographic distribution of visitors
 */
export async function getGeoStats(limit: number = 10): Promise<GeoStats[]> {
    const total = await Analytics.countDocuments({ eventType: 'pageview' });

    const stats = await Analytics.aggregate([
        { $match: { eventType: 'pageview' } },
        {
            $group: {
                _id: '$location.countryCode',
                country: { $first: '$location.country' },
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: limit }
    ]);

    return stats.map(s => ({
        country: s.country || s._id,
        countryCode: s._id,
        count: s.count,
        percentage: total > 0 ? (s.count / total) * 100 : 0
    }));
}

/**
 * Get device distribution
 */
export async function getDeviceStats() {
    const stats = await Analytics.aggregate([
        { $match: { eventType: 'pageview' } },
        {
            $group: {
                _id: '$device.type',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);

    return stats.map(s => ({
        device: s._id || 'unknown',
        count: s.count
    }));
}

/**
 * Get total counts (all time)
 */
export async function getTotalCounts() {
    const [pageviews, uniqueSessions, contentViews] = await Promise.all([
        Analytics.countDocuments({ eventType: 'pageview' }),
        Session.countDocuments(),
        ViewLog.countDocuments()
    ]);

    return {
        pageviews,
        uniqueSessions,
        contentViews
    };
}

/**
 * Get peak hours by country - When website is most visited per country
 */
export async function getPeakHoursByCountry(limit: number = 10) {
    const stats = await Analytics.aggregate([
        { $match: { eventType: 'pageview' } },
        {
            $group: {
                _id: {
                    country: '$location.country',
                    countryCode: '$location.countryCode',
                    hour: '$hour'
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.country': 1, count: -1 } },
        {
            $group: {
                _id: { country: '$_id.country', countryCode: '$_id.countryCode' },
                peakHour: { $first: '$_id.hour' },
                peakCount: { $first: '$count' },
                totalVisits: { $sum: '$count' },
                hourlyBreakdown: {
                    $push: {
                        hour: '$_id.hour',
                        count: '$count'
                    }
                }
            }
        },
        { $sort: { totalVisits: -1 } },
        { $limit: limit }
    ]);

    return stats.map(s => ({
        country: s._id.country || 'Unknown',
        countryCode: s._id.countryCode || 'XX',
        peakHour: s.peakHour,
        peakHourFormatted: `${String(s.peakHour).padStart(2, '0')}:00 - ${String((s.peakHour + 1) % 24).padStart(2, '0')}:00`,
        peakCount: s.peakCount,
        totalVisits: s.totalVisits,
        hourlyBreakdown: s.hourlyBreakdown.slice(0, 5) // Top 5 hours
    }));
}

/**
 * Get detailed country analytics with time patterns
 */
export async function getDetailedCountryAnalytics(countryCode?: string) {
    const match: any = { eventType: 'pageview' };
    if (countryCode) {
        match['location.countryCode'] = countryCode;
    }

    // Get visits by day of week
    const weekdayStats = await Analytics.aggregate([
        { $match: match },
        {
            $group: {
                _id: { $dayOfWeek: '$timestamp' },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Map day numbers to names
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayData = weekdayStats.map(s => ({
        day: dayNames[s._id - 1],
        count: s.count
    }));

    // Get hourly distribution
    const hourlyStats = await Analytics.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$hour',
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        hour: `${String(i).padStart(2, '0')}:00`,
        count: hourlyStats.find(h => h._id === i)?.count || 0
    }));

    // Find peak times
    const peakHour = hourlyData.reduce((max, h) => h.count > max.count ? h : max, { hour: '00:00', count: 0 });
    const peakDay = weekdayData.reduce((max, d) => d.count > max.count ? d : max, { day: 'Mon', count: 0 });

    return {
        peakHour: peakHour.hour,
        peakDay: peakDay.day,
        weekdayData,
        hourlyData,
        summary: {
            busiestTime: `${peakDay.day} at ${peakHour.hour}`,
            recommendation: `Best time to post: ${peakHour.hour} on ${peakDay.day}`
        }
    };
}

/**
 * Get realtime dashboard data (all in one call for efficiency)
 */
export async function getRealtimeDashboard() {
    const now = new Date();
    const todayStart = startOfDay(now);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const weekStart = subDays(now, 7);
    const monthStart = subDays(now, 30);

    const [
        todayCount,
        weekCount,
        monthCount,
        activeCount,
        geoStats,
        deviceStats,
        peakHours
    ] = await Promise.all([
        Analytics.countDocuments({ eventType: 'pageview', timestamp: { $gte: todayStart } }),
        Analytics.countDocuments({ eventType: 'pageview', timestamp: { $gte: weekStart } }),
        Analytics.countDocuments({ eventType: 'pageview', timestamp: { $gte: monthStart } }),
        Session.countDocuments({ isActive: true, lastActivity: { $gte: fiveMinutesAgo } }),
        getGeoStats(5),
        getDeviceStats(),
        getPeakHoursByCountry(5)
    ]);

    return {
        visitors: {
            today: todayCount,
            week: weekCount,
            month: monthCount,
            active: activeCount
        },
        topCountries: geoStats,
        devices: deviceStats,
        peakHoursByCountry: peakHours,
        lastUpdated: now.toISOString()
    };
}
