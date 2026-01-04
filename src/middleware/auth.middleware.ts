import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: IUser;
            userId?: string;
        }
    }
}

export interface JWTPayload {
    userId: string;
    username: string;
    role: string;
}

/**
 * Verify JWT token and attach user to request
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
    try {
        // Get token from header or cookie
        const authHeader = req.headers['authorization'];
        const token = authHeader?.split(' ')[1] || req.cookies?.token;

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

        // Get user from database
        const user = await User.findById(decoded.userId);

        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Invalid or inactive user' });
        }

        // Attach user to request
        req.user = user;
        req.userId = user._id.toString();

        next();
    } catch (error: any) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(500).json({ error: 'Authentication failed' });
    }
}

/**
 * Generate JWT token
 */
export function generateToken(user: IUser): string {
    const payload: JWTPayload = {
        userId: user._id.toString(),
        username: user.username,
        role: user.role
    };

    // expiresIn as number of seconds (7 days = 604800 seconds)
    const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds

    const options: jwt.SignOptions = {
        expiresIn: expiresIn
    };

    return jwt.sign(payload, JWT_SECRET as jwt.Secret, options);
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader?.split(' ')[1] || req.cookies?.token;

        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
            const user = await User.findById(decoded.userId);

            if (user && user.isActive) {
                req.user = user;
                req.userId = user._id.toString();
            }
        }
    } catch (error) {
        // Silently fail - this is optional auth
    }
    next();
}
