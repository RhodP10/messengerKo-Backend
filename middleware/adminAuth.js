import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

// Generate JWT token for admin
export const generateAdminToken = (adminId) => {
  return jwt.sign(
    { adminId, type: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' } // Shorter expiry for admin tokens
  );
};

// Middleware to check if admin is authenticated
export const authenticateAdmin = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if token is for admin
    if (decoded.type !== 'admin') {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin token'
      });
    }

    // Get admin from database
    const admin = await Admin.findById(decoded.adminId);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - admin not found'
      });
    }

    // Check if admin account is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Admin account has been deactivated'
      });
    }

    // Check if account is locked
    if (admin.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Admin account is temporarily locked'
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
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

    console.error('Admin auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
};

// Middleware to check specific admin permissions
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!req.admin.hasPermission(permission)) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: ${permission}`
      });
    }

    next();
  };
};

// Middleware to check if admin has super admin role
export const requireSuperAdmin = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.admin.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Super admin privileges required'
    });
  }

  next();
};

// Legacy middleware for backward compatibility (will be removed)
export const requireAdmin = authenticateAdmin;


