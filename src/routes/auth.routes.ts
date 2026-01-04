import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { generateToken } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /api/auth/login
 * Login with username/email and password
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Find user by username or email
        const user = await User.findOne({
            $or: [
                { username: username },
                { email: username }
            ]
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({ error: 'Account is inactive' });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT token
        const token = generateToken(user);

        res.json({
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
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/auth/logout
 * Logout (client should delete token)
 */
router.post('/logout', async (req: Request, res: Response) => {
    // JWT is stateless, so logout is handled client-side
    // But we can use this to track logout events
    res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/verify
 * Verify if token is still valid
 */
router.get('/verify', async (req: Request, res: Response) => {
    // This endpoint requires authenticateToken middleware in server.ts
    res.json({
        success: true,
        user: req.user ? {
            id: req.user._id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role
        } : null
    });
});

export default router;
