import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { connectDatabase } from '../config/database';

dotenv.config();

async function createAdminUser() {
    try {
        console.log('🔐 Creating admin user...\n');

        // Connect to database
        await connectDatabase();

        const username = process.env.ADMIN_USERNAME || 'admin';
        const password = process.env.ADMIN_PASSWORD || 'admin123';
        const email = process.env.ADMIN_EMAIL || 'admin@wibustream.com';

        // Check if admin already exists
        const existingAdmin = await User.findOne({ username });

        if (existingAdmin) {
            console.log('⚠️  Admin user already exists!');
            console.log(`   Username: ${existingAdmin.username}`);
            console.log(`   Email: ${existingAdmin.email}`);
            console.log(`\n💡 To reset, delete the user from MongoDB and run this script again.\n`);
            process.exit(0);
        }

        // Create new admin user
        const admin = await User.create({
            username,
            email,
            password, // Will be hashed automatically by User model
            role: 'admin',
            isActive: true
        });

        console.log('✅ Admin user created successfully!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email:', admin.email);
        console.log('👤 Username:', admin.username);
        console.log('🔑 Password:', password);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🌐 Login URL: http://localhost:3000/admin');
        console.log('\n⚠️  IMPORTANT: Change the password after first login!\n');

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error creating admin user:', error.message);
        console.error('\n🔧 Troubleshooting:');
        console.error('1. Make sure MongoDB is running');
        console.error('2. Check MONGODB_URI in .env file');
        console.error('3. Verify database connection\n');
        process.exit(1);
    }
}

createAdminUser();
