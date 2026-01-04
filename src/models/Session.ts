import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
    sessionId: string;
    userId?: string;
    ipAddress: string;
    userAgent: string;
    device: {
        type: 'mobile' | 'desktop' | 'tablet' | 'unknown';
        os: string;
        browser: string;
    };
    location: {
        country: string;
        countryCode: string;
        region: string;
        city: string;
        timezone: string;
        coordinates: [number, number];
    };
    currentPage: string;
    currentContent?: {
        type: 'drama' | 'anime' | 'komik';
        id: string;
        title: string;
        episode?: number;
        chapter?: number;
    };
    startedAt: Date;
    lastActivity: Date;
    duration: number; // seconds
    isActive: boolean;
}

const SessionSchema = new Schema<ISession>({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: String,
        index: true
    },
    ipAddress: {
        type: String,
        required: true
    },
    userAgent: {
        type: String,
        required: true
    },
    device: {
        type: {
            type: String,
            enum: ['mobile', 'desktop', 'tablet', 'unknown'],
            default: 'unknown'
        },
        os: String,
        browser: String
    },
    location: {
        country: String,
        countryCode: String,
        region: String,
        city: String,
        timezone: String,
        coordinates: {
            type: [Number],
            default: [0, 0]
        }
    },
    currentPage: {
        type: String,
        default: '/'
    },
    currentContent: {
        type: {
            type: String,
            enum: ['drama', 'anime', 'komik']
        },
        id: String,
        title: String,
        episode: Number,
        chapter: Number
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    duration: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for active sessions query
SessionSchema.index({ isActive: 1, lastActivity: -1 });

// Auto-expire inactive sessions after 30 minutes
SessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 1800 });

export const Session = mongoose.model<ISession>('Session', SessionSchema);
