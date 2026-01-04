import { Request } from 'express';

/**
 * Extract real IP address from request
 * Handles proxies, load balancers, and direct connections
 */
export function getClientIP(req: Request): string {
    // Check X-Forwarded-For header (for proxies/load balancers)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = (typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0]).split(',');
        return ips[0].trim();
    }

    // Check X-Real-IP header
    const realIP = req.headers['x-real-ip'];
    if (realIP) {
        return typeof realIP === 'string' ? realIP : realIP[0];
    }

    // Check CF-Connecting-IP (Cloudflare)
    const cfIP = req.headers['cf-connecting-ip'];
    if (cfIP) {
        return typeof cfIP === 'string' ? cfIP : cfIP[0];
    }

    // Fallback to socket remoteAddress
    return req.socket.remoteAddress || req.ip || 'unknown';
}

/**
 * Anonymize IP for privacy (hash last octet)
 */
export function anonymizeIP(ip: string): string {
    if (!ip || ip === 'unknown') return ip;

    // IPv4
    if (ip.includes('.')) {
        const parts = ip.split('.');
        parts[3] = '0'; // Anonymize last octet
        return parts.join('.');
    }

    // IPv6
    if (ip.includes(':')) {
        const parts = ip.split(':');
        parts[parts.length - 1] = '0'; // Anonymize last segment
        return parts.join(':');
    }

    return ip;
}

/**
 * Check if IP is localhost/private
 */
export function isPrivateIP(ip: string): boolean {
    if (!ip) return true;

    // Localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
        return true;
    }

    // Private IPv4 ranges
    const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./ // Link-local
    ];

    return privateRanges.some(range => range.test(ip));
}

/**
 * Get mock location for localhost/development
 */
export function getMockLocation() {
    return {
        country: 'Indonesia',
        countryCode: 'ID',
        region: 'JK',
        city: 'Jakarta',
        timezone: 'Asia/Jakarta',
        coordinates: [-6.2088, 106.8456] as [number, number]
    };
}
