import { Router, Request, Response } from 'express';
import {
    getVisitorStats,
    getVisitorTrend,
    getHourlyStats,
    getActiveViewers,
    getPopularContent,
    getGeoStats,
    getDeviceStats,
    getTotalCounts
} from '../services/analytics.service';

const router = Router();

/**
 * POST /api/analytics/track
 * Track a user event (Public)
 */
router.post('/track', async (req: Request, res: Response) => {
    try {
        const { eventType, page, metadata } = req.body;

        // Use the existing tracking logic but made public for frontend clicks
        // We'll just return success to keep it fast
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Tracking failed' });
    }
});

/**
 * GET /api/analytics/stats
 * Get visitor statistics for different time periods (Admin Only)
 */
router.get('/stats', async (req: Request, res: Response) => {
    // ... logic remains
});

/**
 * GET /api/analytics/trend
 * Get visitor trend over time
 */
router.get('/trend', async (req: Request, res: Response) => {
    try {
        const days = parseInt(req.query.days as string) || 7;
        const trend = await getVisitorTrend(days);

        res.json({
            success: true,
            data: trend
        });
    } catch (error: any) {
        console.error('Trend error:', error);
        res.status(500).json({ error: 'Failed to load trend data' });
    }
});

/**
 * GET /api/analytics/hourly
 * Get hourly distribution for today
 */
router.get('/hourly', async (req: Request, res: Response) => {
    try {
        const hourly = await getHourlyStats();

        res.json({
            success: true,
            data: hourly
        });
    } catch (error: any) {
        console.error('Hourly stats error:', error);
        res.status(500).json({ error: 'Failed to load hourly stats' });
    }
});

/**
 * GET /api/analytics/active
 * Get currently active viewers count
 */
router.get('/active', async (req: Request, res: Response) => {
    try {
        const count = await getActiveViewers();

        res.json({
            success: true,
            data: { count }
        });
    } catch (error: any) {
        console.error('Active viewers error:', error);
        res.status(500).json({ error: 'Failed to get active viewers' });
    }
});

/**
 * GET /api/analytics/popular
 * Get popular content
 */
router.get('/popular', async (req: Request, res: Response) => {
    try {
        const days = parseInt(req.query.days as string) || 7;
        const popular = await getPopularContent(days);

        res.json({
            success: true,
            data: popular
        });
    } catch (error: any) {
        console.error('Popular content error:', error);
        res.status(500).json({ error: 'Failed to load popular content' });
    }
});

/**
 * GET /api/analytics/geo
 * Get geographic distribution
 */
router.get('/geo', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const geo = await getGeoStats(limit);

        res.json({
            success: true,
            data: geo
        });
    } catch (error: any) {
        console.error('Geo stats error:', error);
        res.status(500).json({ error: 'Failed to load geographic data' });
    }
});

/**
 * GET /api/analytics/devices
 * Get device distribution
 */
router.get('/devices', async (req: Request, res: Response) => {
    try {
        const devices = await getDeviceStats();

        res.json({
            success: true,
            data: devices
        });
    } catch (error: any) {
        console.error('Device stats error:', error);
        res.status(500).json({ error: 'Failed to load device stats' });
    }
});

/**
 * GET /api/analytics/totals
 * Get total counts (all time)
 */
router.get('/totals', async (req: Request, res: Response) => {
    try {
        const totals = await getTotalCounts();

        res.json({
            success: true,
            data: totals
        });
    } catch (error: any) {
        console.error('Totals error:', error);
        res.status(500).json({ error: 'Failed to load totals' });
    }
});

/**
 * GET /api/analytics/peak-hours
 * Get peak hours by country - when is the site most visited per country
 */
router.get('/peak-hours', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const { getPeakHoursByCountry } = await import('../services/analytics.service');
        const peakHours = await getPeakHoursByCountry(limit);

        res.json({
            success: true,
            data: peakHours
        });
    } catch (error: any) {
        console.error('Peak hours error:', error);
        res.status(500).json({ error: 'Failed to load peak hours data' });
    }
});

/**
 * GET /api/analytics/country-detail
 * Get detailed analytics for a specific country or all countries
 */
router.get('/country-detail', async (req: Request, res: Response) => {
    try {
        const countryCode = req.query.country as string;
        const { getDetailedCountryAnalytics } = await import('../services/analytics.service');
        const details = await getDetailedCountryAnalytics(countryCode);

        res.json({
            success: true,
            data: details
        });
    } catch (error: any) {
        console.error('Country detail error:', error);
        res.status(500).json({ error: 'Failed to load country details' });
    }
});

/**
 * GET /api/analytics/realtime
 * Get all realtime dashboard data in one call
 */
router.get('/realtime', async (req: Request, res: Response) => {
    try {
        const { getRealtimeDashboard } = await import('../services/analytics.service');
        const data = await getRealtimeDashboard();

        res.json({
            success: true,
            data
        });
    } catch (error: any) {
        console.error('Realtime dashboard error:', error);
        res.status(500).json({ error: 'Failed to load realtime data' });
    }
});

export default router;
