import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Admin from '../models/Admin.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import { generateAdminToken } from '../middleware/adminAuth.js';
import { validateRegister, validateLogin } from '../middleware/validation.js';

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmailOrUsername(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
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

// @route   POST /api/auth/login
// @desc    Login user or admin (unified login)
// @access  Public
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { identifier, password } = req.body;

    console.log('🔐 UNIFIED LOGIN ATTEMPT:');
    console.log('📧 Identifier:', identifier);
    console.log('🔑 Password length:', password?.length);

    // First, try to find admin
    const admin = await Admin.findByEmailOrUsername(identifier);
    if (admin) {
      console.log('👑 Admin found, checking admin credentials...');

      // Check if admin account is active
      if (!admin.isActive) {
        console.log('❌ Admin account inactive');
        return res.status(403).json({
          success: false,
          message: 'Account has been deactivated. Please contact administrator.'
        });
      }

      // Check if admin account is locked
      if (admin.isLocked) {
        console.log('❌ Admin account locked');
        return res.status(423).json({
          success: false,
          message: 'Account is temporarily locked due to too many failed login attempts.'
        });
      }

      // Check admin password
      const isAdminMatch = await admin.comparePassword(password);
      console.log('🔐 Admin password match:', isAdminMatch);

      if (isAdminMatch) {
        console.log('✅ ADMIN LOGIN SUCCESSFUL');
        // Reset login attempts on successful login
        await admin.resetLoginAttempts();

        // Generate admin token
        const token = generateAdminToken(admin._id);

        return res.json({
          success: true,
          message: 'Admin login successful',
          data: {
            user: {
              ...admin.toJSON(),
              userType: 'admin'
            },
            token,
            userType: 'admin'
          }
        });
      } else {
        console.log('❌ Admin password mismatch');
        // Increment login attempts for admin
        await admin.incLoginAttempts();
      }
    }

    // If not admin or admin password failed, try regular user
    console.log('👤 Checking regular user credentials...');
    const user = await User.findByEmailOrUsername(identifier);
    if (!user) {
      console.log('❌ No user or admin found');
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('👤 User found, checking user credentials...');

    // Check if user account is active
    if (!user.isActive) {
      console.log('❌ User account inactive');
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact administrator.'
      });
    }

    // Check user password
    const isUserMatch = await user.comparePassword(password);
    console.log('🔐 User password match:', isUserMatch);

    if (!isUserMatch) {
      console.log('❌ User password mismatch');
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('✅ USER LOGIN SUCCESSFUL');
    // Update online status for regular user
    await user.setOnlineStatus(true);

    // Generate regular user token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'User login successful',
      data: {
        user: {
          ...user.toJSON(),
          userType: 'user'
        },
        token,
        userType: 'user'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Update user's online status
    await req.user.setOnlineStatus(false);

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user or admin (unified)
// @access  Private
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    console.log('🔍 /me endpoint: Checking token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🎫 /me endpoint: Decoded token:', decoded);

    // Check if it's an admin token
    if (decoded.type === 'admin' && decoded.adminId) {
      console.log('👑 /me endpoint: Admin token detected');
      const admin = await Admin.findById(decoded.adminId);

      if (!admin || !admin.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Invalid admin token'
        });
      }

      console.log('✅ /me endpoint: Admin found and active');
      return res.json({
        success: true,
        data: {
          user: {
            ...admin.toJSON(),
            userType: 'admin'
          }
        }
      });
    }

    // Check if it's a regular user token
    if (decoded.userId) {
      console.log('👤 /me endpoint: User token detected');
      const user = await User.findById(decoded.userId).select('-password');

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Invalid user token'
        });
      }

      console.log('✅ /me endpoint: User found and active');
      return res.json({
        success: true,
        data: {
          user: {
            ...user.toJSON(),
            userType: 'user'
          }
        }
      });
    }

    // Invalid token structure
    return res.status(401).json({
      success: false,
      message: 'Invalid token structure'
    });

  } catch (error) {
    console.error('❌ /me endpoint error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error getting user data'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh token
// @access  Private
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const token = generateToken(req.user._id);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error refreshing token'
    });
  }
});

export default router;
