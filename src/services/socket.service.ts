import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Session } from '../models/Session';

let io: SocketIOServer;

/**
 * Initialize Socket.IO server
 */
export function initializeSocket(httpServer: HTTPServer): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: process.env.SOCKET_CORS_ORIGIN || '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // Handle user watching content
        socket.on('watching', async (data: {
            sessionId: string;
            contentType: 'drama' | 'anime' | 'komik';
            contentId: string;
            contentTitle: string;
            episode?: number;
            chapter?: number;
        }) => {
            try {
                // Update session with current content
                await Session.findOneAndUpdate(
                    { sessionId: data.sessionId },
                    {
                        currentContent: {
                            type: data.contentType,
                            id: data.contentId,
                            title: data.contentTitle,
                            episode: data.episode,
                            chapter: data.chapter
                        },
                        lastActivity: new Date()
                    }
                );

                // Broadcast to admin dashboard
                broadcastViewerUpdate();
            } catch (error) {
                console.error('Error updating watching status:', error);
            }
        });

        // Handle page view
        socket.on('pageview', async (data: {
            sessionId: string;
            page: string;
        }) => {
            try {
                await Session.findOneAndUpdate(
                    { sessionId: data.sessionId },
                    {
                        currentPage: data.page,
                        currentContent: null, // Clear content when navigating
                        lastActivity: new Date()
                    }
                );

                broadcastViewerUpdate();
            } catch (error) {
                console.error('Error updating pageview:', error);
            }
        });

        // Handle session ended
        socket.on('session-end', async (sessionId: string) => {
            try {
                await Session.findOneAndUpdate(
                    { sessionId },
                    { isActive: false }
                );

                broadcastViewerUpdate();
            } catch (error) {
                console.error('Error ending session:', error);
            }
        });

        socket.on('disconnect', () => {
            console.log(`❌ Client disconnected: ${socket.id}`);
        });
    });

    // Periodic update every 5 seconds
    setInterval(() => {
        broadcastViewerUpdate();
    }, 5000);

    console.log('✅ Socket.IO initialized');
    return io;
}

/**
 * Broadcast viewer count update to admin dashboard
 */
async function broadcastViewerUpdate() {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        // Get active viewer count
        const activeCount = await Session.countDocuments({
            isActive: true,
            lastActivity: { $gte: fiveMinutesAgo }
        });

        // Get current watchers
        const watchers = await Session.find({
            isActive: true,
            lastActivity: { $gte: fiveMinutesAgo },
            'currentContent.type': { $exists: true }
        })
            .select('location currentContent device lastActivity')
            .sort({ lastActivity: -1 })
            .limit(20)
            .lean();

        // Broadcast to admin clients (room: 'admin')
        io.to('admin').emit('viewer-update', {
            count: activeCount,
            watchers: watchers
        });

    } catch (error) {
        console.error('Error broadcasting viewer update:', error);
    }
}

/**
 * Send real-time notification to admin
 */
export function notifyAdmin(event: string, data: any) {
    if (io) {
        io.to('admin').emit(event, data);
    }
}

/**
 * Join admin room (for authenticated admin users)
 */
export function joinAdminRoom(socket: Socket) {
    socket.join('admin');
    console.log(`👤 Admin joined: ${socket.id}`);
}

/**
 * Get Socket.IO instance
 */
export function getIO(): SocketIOServer {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
}
