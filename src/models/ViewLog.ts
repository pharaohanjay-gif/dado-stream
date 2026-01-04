import mongoose, { Document, Schema } from 'mongoose';

export interface IViewLog extends Document {
    contentType: 'drama' | 'anime' | 'komik';
    contentId: string;
    contentTitle: string;
    episode?: number;
    chapter?: number;
    sessionId: string;
    ipAddress: string;
    location: {
        country: string;
        city: string;
    };
    device: string;
    watchDuration: number; // seconds
    completionRate: number; // 0-100
    timestamp: Date;
    date: string;
}

const ViewLogSchema = new Schema<IViewLog>({
    contentType: {
        type: String,
        enum: ['drama', 'anime', 'komik'],
        required: true,
        index: true
    },
    contentId: {
        type: String,
        required: true,
        index: true
    },
    contentTitle: {
        type: String,
        required: true
    },
    episode: Number,
    chapter: Number,
    sessionId: {
        type: String,
        required: true
    },
    ipAddress: {
        type: String,
        required: true
    },
    location: {
        country: String,
        city: String
    },
    device: String,
    watchDuration: {
        type: Number,
        default: 0
    },
    completionRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    date: {
        type: String,
        required: true,
        index: true
    }
}, {
    timestamps: false
});

// Compound indexes for popular content queries
ViewLogSchema.index({ contentType: 1, contentId: 1, date: 1 });
ViewLogSchema.index({ date: 1, contentType: 1 });

export const ViewLog = mongoose.model<IViewLog>('ViewLog', ViewLogSchema);
