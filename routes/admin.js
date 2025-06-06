import express from 'express';
import {
  getDashboardStats,
  getAllUsers,
  getUserDetails,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getAllAdmins,
  getAdminDetails,
  deactivateAdmin,
  reactivateAdmin
} from '../controllers/adminController.js';
import { authenticateAdmin, requirePermission, requireSuperAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// Dashboard routes
router.get('/dashboard/stats', requirePermission('analytics_view'), getDashboardStats);

// User management routes
router.get('/users', requirePermission('user_management'), getAllUsers);
router.get('/users/:userId', requirePermission('user_management'), getUserDetails);
router.patch('/users/:userId/deactivate', requirePermission('user_management'), deactivateUser);
router.patch('/users/:userId/reactivate', requirePermission('user_management'), reactivateUser);
router.delete('/users/:userId', requirePermission('user_management'), deleteUser);

// Admin management routes (Super Admin only)
router.get('/admins', requirePermission('admin_management'), getAllAdmins);
router.get('/admins/:adminId', requirePermission('admin_management'), getAdminDetails);
router.patch('/admins/:adminId/deactivate', requirePermission('admin_management'), deactivateAdmin);
router.patch('/admins/:adminId/reactivate', requirePermission('admin_management'), reactivateAdmin);

export default router;
