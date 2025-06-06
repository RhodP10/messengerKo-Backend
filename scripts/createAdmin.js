import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';

// Load environment variables
dotenv.config();

const createSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    // Check if super admin already exists
    const existingSuperAdmin = await Admin.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      console.log('⚠️  Super admin already exists:', existingSuperAdmin.email);
      process.exit(0);
    }

    // Create super admin
    const superAdminData = {
      username: 'superadmin',
      email: 'superadmin@messengerko.com',
      password: 'SuperAdmin123!', // Strong default password
      firstName: 'Super',
      lastName: 'Administrator',
      role: 'super_admin',
      isActive: true
    };

    const superAdmin = new Admin(superAdminData);
    await superAdmin.save();

    console.log('✅ Super Admin created successfully!');
    console.log('📧 Email:', superAdmin.email);
    console.log('👤 Username:', superAdmin.username);
    console.log('👨‍💼 Full Name:', superAdmin.fullName);
    console.log('🔑 Password: SuperAdmin123! (Please change this after first login)');
    console.log('🛡️  Role:', superAdmin.role);
    console.log('🔐 Permissions:', superAdmin.permissions);

  } catch (error) {
    console.error('❌ Error creating super admin:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('📦 Database connection closed');
    process.exit(0);
  }
};

// Run the script
createSuperAdmin();
