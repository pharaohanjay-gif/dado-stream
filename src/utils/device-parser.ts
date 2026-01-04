import UAParser from 'ua-parser-js';

export interface DeviceInfo {
    type: 'mobile' | 'desktop' | 'tablet' | 'unknown';
    os: string;
    osVersion: string;
    browser: string;
    browserVersion: string;
    engine: string;
    raw: string;
}

/**
 * Parse user agent string to extract device information
 */
export function parseUserAgent(userAgentString: string): DeviceInfo {
    const parser = new UAParser(userAgentString);
    const result = parser.getResult();

    // Determine device type
    let deviceType: DeviceInfo['type'] = 'unknown';
    if (result.device.type === 'mobile') {
        deviceType = 'mobile';
    } else if (result.device.type === 'tablet') {
        deviceType = 'tablet';
    } else if (result.device.type === undefined && result.os.name) {
        // If no device type but has OS, likely desktop
        deviceType = 'desktop';
    }

    return {
        type: deviceType,
        os: result.os.name || 'Unknown OS',
        osVersion: result.os.version || '',
        browser: result.browser.name || 'Unknown Browser',
        browserVersion: result.browser.version || '',
        engine: result.engine.name || 'Unknown Engine',
        raw: userAgentString
    };
}

/**
 * Simple device type detection for quick checks
 */
export function getDeviceType(userAgentString: string): 'mobile' | 'desktop' | 'tablet' | 'unknown' {
    const ua = userAgentString.toLowerCase();

    // Check for mobile devices
    if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/.test(ua)) {
        return 'mobile';
    }

    // Check for tablets
    if (/tablet|ipad|playbook|silk/.test(ua)) {
        return 'tablet';
    }

    // Check for desktop indicators
    if (/windows|macintosh|linux|x11/.test(ua)) {
        return 'desktop';
    }

    return 'unknown';
}

/**
 * Check if request is from mobile device
 */
export function isMobile(userAgentString: string): boolean {
    const type = getDeviceType(userAgentString);
    return type === 'mobile';
}

/**
 * Get OS name from user agent
 */
export function getOS(userAgentString: string): string {
    const parser = new UAParser(userAgentString);
    const os = parser.getOS();
    return os.name || 'Unknown';
}

/**
 * Get browser name from user agent
 */
export function getBrowser(userAgentString: string): string {
    const parser = new UAParser(userAgentString);
    const browser = parser.getBrowser();
    return browser.name || 'Unknown';
}

/**
 * Check if user agent is a bot/crawler
 */
export function isBot(userAgentString: string): boolean {
    const botPatterns = [
        /bot/i,
        /crawler/i,
        /spider/i,
        /googlebot/i,
        /bingbot/i,
        /slurp/i,
        /duckduckbot/i,
        /baiduspider/i,
        /yandexbot/i,
        /facebookexternalhit/i,
        /twitterbot/i,
        /rogerbot/i,
        /linkedinbot/i,
        /embedly/i,
        /showyoubot/i,
        /outbrain/i,
        /pinterest/i,
        /developers\.google\.com/i
    ];

    return botPatterns.some(pattern => pattern.test(userAgentString));
}
