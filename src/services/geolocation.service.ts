import geoip from 'geoip-lite';
import { getClientIP, isPrivateIP, getMockLocation } from '../utils/ip-utils';
import { Request } from 'express';

export interface LocationData {
    country: string;
    countryCode: string;
    region: string;
    city: string;
    timezone: string;
    coordinates: [number, number];
}

/**
 * Get geolocation data from IP address using GeoIP-Lite
 * Free, offline, no API required!
 */
export function getLocationFromIP(ip: string): LocationData | null {
    try {
        // Handle localhost/private IPs
        if (isPrivateIP(ip)) {
            console.log(`🏠 Private IP detected (${ip}), using mock location`);
            return getMockLocation();
        }

        // Lookup IP in GeoIP database
        const geo = geoip.lookup(ip);

        if (!geo) {
            console.warn(`⚠️  No geolocation data for IP: ${ip}`);
            return null;
        }

        return {
            country: geo.country || 'Unknown',
            countryCode: geo.country || 'XX',
            region: geo.region || '',
            city: geo.city || 'Unknown',
            timezone: geo.timezone || 'UTC',
            coordinates: geo.ll || [0, 0]
        };

    } catch (error) {
        console.error('Error in getLocationFromIP:', error);
        return null;
    }
}

/**
 * Get location from Express request
 */
export function getLocationFromRequest(req: Request): LocationData | null {
    const ip = getClientIP(req);
    return getLocationFromIP(ip);
}

/**
 * Get country name from country code
 */
export function getCountryName(code: string): string {
    const countries: { [key: string]: string } = {
        'ID': 'Indonesia',
        'US': 'United States',
        'GB': 'United Kingdom',
        'AU': 'Australia',
        'CA': 'Canada',
        'SG': 'Singapore',
        'MY': 'Malaysia',
        'TH': 'Thailand',
        'PH': 'Philippines',
        'VN': 'Vietnam',
        'JP': 'Japan',
        'KR': 'South Korea',
        'CN': 'China',
        'IN': 'India',
        'DE': 'Germany',
        'FR': 'France',
        'IT': 'Italy',
        'ES': 'Spain',
        'BR': 'Brazil',
        'MX': 'Mexico',
        'AR': 'Argentina',
        'EG': 'Egypt',
        'SA': 'Saudi Arabia',
        'AE': 'UAE',
        'NL': 'Netherlands',
        'SE': 'Sweden',
        'NO': 'Norway',
        'FI': 'Finland',
        'DK': 'Denmark',
        'PL': 'Poland',
        'RU': 'Russia',
        'TR': 'Turkey',
        'ZA': 'South Africa',
        'NZ': 'New Zealand',
        // Add more as needed
    };

    return countries[code] || code;
}

/**
 * Get country flag emoji from country code
 */
export function getCountryFlag(code: string): string {
    if (!code || code.length !== 2) return '🌍';

    // Convert country code to flag emoji
    // Flag emojis use regional indicator symbols (offset 127397)
    const codePoints = code
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));

    return String.fromCodePoint(...codePoints);
}

/**
 * Format location for display
 */
export function formatLocation(location: LocationData): string {
    const parts: string[] = [];

    if (location.city && location.city !== 'Unknown') {
        parts.push(location.city);
    }
    if (location.region) {
        parts.push(location.region);
    }
    if (location.country) {
        parts.push(location.country);
    }

    return parts.join(', ') || 'Unknown Location';
}

/**
 * Update GeoIP database (optional, runs monthly automatically)
 */
export async function updateGeoIPDatabase(): Promise<void> {
    try {
        console.log('🌍 GeoIP database is managed automatically by geoip-lite');
        console.log('📅 Updates are downloaded monthly from MaxMind');
        // geoip-lite handles updates automatically
    } catch (error) {
        console.error('Error updating GeoIP database:', error);
    }
}
