import mongoose, { Document, Schema } from 'mongoose';

export interface IAnalytics extends Document {
    eventType: 'pageview' | 'click' | 'search' | 'error';
    page: string;
    referrer?: string;
    sessionId: string;
    ipAddress: string;
    location: {
        country: string;
        countryCode: string;
        city: string;
    };
    device: {
        type: string;
        os: string;
        browser: string;
    };
    metadata?: any;
    timestamp: Date;
    date: string; // YYYY-MM-DD for easy aggregation
    hour: number; // 0-23
}

const AnalyticsSchema = new Schema<IAnalytics>({
    eventType: {
        type: String,
        enum: ['pageview', 'click', 'search', 'error'],
        required: true,
        index: true
    },
    page: {
        type: String,
        required: true,
        index: true
    },
    referrer: String,
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    ipAddress: {
        type: String,
        required: true
    },
    location: {
        country: String,
        countryCode: {
            type: String,
            index: true
        },
        city: String
    },
    device: {
        type: {
            type: String,
            default: 'unknown'
        },
        os: {
            type: String,
            default: 'unknown'
        },
        browser: {
            type: String,
            default: 'unknown'
        }
    },
    metadata: Schema.Types.Mixed,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    date: {
        type: String,
        required: true,
        index: true
    },
    hour: {
        type: Number,
        min: 0,
        max: 23,
        index: true
    }
}, {
    timestamps: false
});

// Compound indexes for efficient queries
AnalyticsSchema.index({ date: 1, eventType: 1 });
AnalyticsSchema.index({ date: 1, hour: 1 });
AnalyticsSchema.index({ countryCode: 1, date: 1 });

export const Analytics = mongoose.model<IAnalytics>('Analytics', AnalyticsSchema);
