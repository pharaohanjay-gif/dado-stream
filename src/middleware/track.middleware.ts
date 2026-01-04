import { Request, Response, NextFunction } from 'express';
import { Analytics } from '../models/Analytics';
import { Session } from '../models/Session';
import { getClientIP, isPrivateIP, anonymizeIP } from '../utils/ip-utils';
import { parseUserAgent, isBot } from '../utils/device-parser';
import { getLocationFromIP } from '../services/geolocation.service';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

/**
 * Track analytics for every request
 */
export async function trackAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
        // Skip tracking for static assets and API calls
        if (
            req.path.startsWith('/css/') ||
            req.path.startsWith('/js/') ||
            req.path.startsWith('/api/') ||
            req.path.startsWith('/assets/')
        ) {
            return next();
        }

        const userAgent = req.headers['user-agent'] || '';

        // Skip bots
        if (isBot(userAgent)) {
            return next();
        }

        const ip = getClientIP(req);
        const deviceInfo = parseUserAgent(userAgent);
        const location = getLocationFromIP(ip);

        // Get or create session ID
        let sessionId = req.cookies?.sessionId;
        if (!sessionId) {
            sessionId = uuidv4();
            res.cookie('sessionId', sessionId, {
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                httpOnly: true,
                sameSite: 'lax'
            });
        }

        // Create or update session
        await Session.findOneAndUpdate(
            { sessionId },
            {
                $set: {
                    ipAddress: anonymizeIP(ip),
                    userAgent,
                    device: {
                        type: deviceInfo.type,
                        os: deviceInfo.os,
                        browser: deviceInfo.browser
                    },
                    location: location ? {
                        country: location.country,
                        countryCode: location.countryCode,
                        region: location.region,
                        city: location.city,
                        timezone: location.timezone,
                        coordinates: location.coordinates
                    } : undefined,
                    currentPage: req.path,
                    lastActivity: new Date(),
                    isActive: true
                },
                $inc: { duration: 0 },
                $setOnInsert: {
                    sessionId,
                    startedAt: new Date()
                }
            },
            { upsert: true, new: true }
        );

        // Log pageview
        const now = new Date();
        await Analytics.create({
            eventType: 'pageview',
            page: req.path,
            referrer: req.headers.referer,
            sessionId,
            ipAddress: anonymizeIP(ip),
            location: location ? {
                country: location.country,
                countryCode: location.countryCode,
                city: location.city
            } : undefined,
            device: {
                type: deviceInfo.type,
                os: deviceInfo.os,
                browser: deviceInfo.browser
            },
            timestamp: now,
            date: format(now, 'yyyy-MM-dd'),
            hour: now.getHours()
        });

        next();
    } catch (error) {
        console.error('Error in trackAnalytics middleware:', error);
        // Don't block request on analytics error
        next();
    }
}

/**
 * Track specific events (clicks, searches, etc.)
 */
export function trackEvent(eventType: 'click' | 'search' | 'error') {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const sessionId = req.cookies?.sessionId;
            if (!sessionId) return next();

            const ip = getClientIP(req);
            const deviceInfo = parseUserAgent(req.headers['user-agent'] || '');
            const location = getLocationFromIP(ip);
            const now = new Date();

            await Analytics.create({
                eventType,
                page: req.path,
                sessionId,
                ipAddress: anonymizeIP(ip),
                location: location ? {
                    country: location.country,
                    countryCode: location.countryCode,
                    city: location.city
                } : undefined,
                device: {
                    type: deviceInfo.type,
                    os: deviceInfo.os,
                    browser: deviceInfo.browser
                },
                metadata: req.body || req.query,
                timestamp: now,
                date: format(now, 'yyyy-MM-dd'),
                hour: now.getHours()
            });

            next();
        } catch (error) {
            console.error(`Error tracking ${eventType} event:`, error);
            next();
        }
    };
}
