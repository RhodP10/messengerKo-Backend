import express from 'express';
import {
  getDashboardStats,
  getAllUsers,
  getUserDetails,
  deactivateUser,
  reactivateUser,
  deleteUser
} from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// Apply admin authentication to all routes
router.use(requireAdmin);

// Dashboard routes
router.get('/dashboard/stats', getDashboardStats);

// User management routes
router.get('/users', getAllUsers);
router.get('/users/:userId', getUserDetails);
router.patch('/users/:userId/deactivate', deactivateUser);
router.patch('/users/:userId/reactivate', reactivateUser);
router.delete('/users/:userId', deleteUser);

export default router;
