import express from 'express';
import Admin from '../models/Admin.js';
import { generateAdminToken, authenticateAdmin } from '../middleware/adminAuth.js';
import { validateAdminLogin, validateAdminRegister } from '../middleware/validation.js';

const router = express.Router();

// @route   POST /api/admin/auth/login
// @desc    Admin login
// @access  Public
router.post('/login', validateAdminLogin, async (req, res) => {
  try {
    console.log('🔐 ADMIN LOGIN ATTEMPT:');
    console.log('📝 Request body:', req.body);
    console.log('📧 Identifier:', req.body.identifier);
    console.log('🔑 Password length:', req.body.password?.length);
    console.log('⏰ Timestamp:', new Date().toISOString());

    const { identifier, password } = req.body;

    // Find admin by email or username
    console.log('🔍 Looking for admin with identifier:', identifier);
    const admin = await Admin.findByEmailOrUsername(identifier);
    console.log('👤 Admin found:', !!admin);
    if (admin) {
      console.log('📧 Found admin email:', admin.email);
      console.log('👤 Found admin username:', admin.username);
      console.log('✅ Admin active:', admin.isActive);
      console.log('🔒 Admin locked:', admin.isLocked);
    }

    if (!admin) {
      console.log('❌ ADMIN NOT FOUND - returning invalid credentials');
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact system administrator.'
      });
    }

    // Check if account is locked
    if (admin.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts. Please try again later.'
      });
    }

    // Check password
    console.log('🔑 Testing password for admin:', admin.email);
    const isMatch = await admin.comparePassword(password);
    console.log('🔐 Password match result:', isMatch);

    if (!isMatch) {
      console.log('❌ PASSWORD MISMATCH - incrementing login attempts');
      // Increment login attempts
      await admin.incLoginAttempts();

      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Reset login attempts on successful login
    console.log('✅ PASSWORD MATCH - login successful!');
    await admin.resetLoginAttempts();

    // Generate token
    const token = generateAdminToken(admin._id);
    console.log('🎫 Token generated successfully');

    console.log('🎉 SENDING SUCCESS RESPONSE');
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        admin: admin.toJSON(),
        token
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/admin/auth/register
// @desc    Register new admin (only super_admin can create new admins)
// @access  Private (Super Admin only)
router.post('/register', authenticateAdmin, validateAdminRegister, async (req, res) => {
  try {
    // Check if current admin has permission to create new admins
    if (!req.admin.hasPermission('admin_management')) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to create admin accounts'
      });
    }

    const { username, email, password, firstName, lastName, role = 'admin' } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findByEmailOrUsername(email);
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin already exists with this email or username'
      });
    }

    // Only super_admin can create other super_admins
    if (role === 'super_admin' && req.admin.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super administrators can create super admin accounts'
      });
    }

    // Create new admin
    const admin = new Admin({
      username,
      email,
      password,
      firstName,
      lastName,
      role,
      createdBy: req.admin._id
    });

    await admin.save();

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      data: {
        admin: admin.toJSON()
      }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   GET /api/admin/auth/me
// @desc    Get current admin
// @access  Private
router.get('/me', authenticateAdmin, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        admin: req.admin.toJSON()
      }
    });
  } catch (error) {
    console.error('Get admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting admin data'
    });
  }
});

// @route   POST /api/admin/auth/refresh
// @desc    Refresh admin token
// @access  Private
router.post('/refresh', authenticateAdmin, async (req, res) => {
  try {
    const token = generateAdminToken(req.admin._id);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token
      }
    });
  } catch (error) {
    console.error('Admin token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error refreshing token'
    });
  }
});

// @route   POST /api/admin/auth/logout
// @desc    Admin logout
// @access  Private
router.post('/logout', authenticateAdmin, async (req, res) => {
  try {
    // In a more advanced implementation, you might want to blacklist the token
    // For now, we'll just return success as the client will remove the token
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// @route   PUT /api/admin/auth/change-password
// @desc    Change admin password
// @access  Private
router.put('/change-password', authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All password fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Verify current password
    const isMatch = await req.admin.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    req.admin.password = newPassword;
    await req.admin.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Admin change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error changing password'
    });
  }
});

export default router;
