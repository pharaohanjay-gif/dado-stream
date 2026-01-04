import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { Session } from '../models/Session';
import { Analytics } from '../models/Analytics';
import { getCurrentWatchers } from '../services/analytics.service';

const router = Router();

/**
 * GET /api/admin/dashboard
 * Get dashboard overview stats
 */
router.get('/dashboard', async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Quick stats
        const [totalUsers, activeSessionsCount, todayPageviews] = await Promise.all([
            User.countDocuments(),
            Session.countDocuments({ isActive: true, lastActivity: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
            Analytics.countDocuments({ eventType: 'pageview', timestamp: { $gte: today } })
        ]);

        res.json({
            success: true,
            data: {
                totalUsers,
                activeSessions: activeSessionsCount,
                todayPageviews,
                serverUptime: process.uptime()
            }
        });
    } catch (error: any) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

/**
 * GET /api/admin/watchers
 * Get currently watching users
 */
router.get('/watchers', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const watchers = await getCurrentWatchers(limit);

        res.json({
            success: true,
            data: watchers
        });
    } catch (error: any) {
        console.error('Watchers error:', error);
        res.status(500).json({ error: 'Failed to load watchers' });
    }
});

/**
 * GET /api/admin/users
 * Get all admin users
 */
router.get('/users', async (req: Request, res: Response) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: users
        });
    } catch (error: any) {
        console.error('Users error:', error);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

/**
 * POST /api/admin/users
 * Create new admin user
 */
router.post('/users', async (req: Request, res: Response) => {
    try {
        const { username, email, password, role } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if user exists
        const exists = await User.findOne({ $or: [{ username }, { email }] });
        if (exists) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const user = await User.create({
            username,
            email,
            password, // Will be hashed automatically
            role: role || 'admin',
            isActive: true
        });

        res.json({
            success: true,
            data: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error: any) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Delete admin user
 */
router.delete('/users/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Don't allow deleting yourself
        if (req.userId === id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await User.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error: any) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

export default router;
