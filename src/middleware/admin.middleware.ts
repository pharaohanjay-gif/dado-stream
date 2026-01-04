import { Request, Response, NextFunction } from 'express';

/**
 * Ensure user is authenticated and is an admin
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
}

/**
 * Require specific role
 */
export function requireRole(role: 'admin' | 'moderator') {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (req.user.role !== role) {
            return res.status(403).json({ error: `${role} role required` });
        }

        next();
    };
}

/**
 * Check if user is active
 */
export async function requireActive(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.isActive) {
        return res.status(403).json({ error: 'Account is inactive' });
    }

    next();
}
