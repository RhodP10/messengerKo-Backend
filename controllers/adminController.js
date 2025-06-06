import User from '../models/User.js';
import Admin from '../models/Admin.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';

// Get admin dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalConversations,
      totalMessages,
      recentUsers
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: true, isOnline: true }),
      Conversation.countDocuments(),
      Message.countDocuments(),
      User.find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('username email createdAt isOnline lastSeen')
    ]);

    // Get user registration stats for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const newUsersThisWeek = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
      isActive: true
    });

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          activeUsers,
          totalConversations,
          totalMessages,
          newUsersThisWeek
        },
        recentUsers
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

// Get all users with pagination
export const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const status = req.query.status || 'all'; // all, active, inactive
    const role = req.query.role || 'all'; // all, user, admin

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status !== 'all') {
      query.isActive = status === 'active';
    }

    // Remove role filter since users don't have roles anymore
    // if (role !== 'all') {
    //   query.role = role;
    // }

    const skip = (page - 1) * limit;

    const [users, totalUsers] = await Promise.all([
      User.find(query)
        .select('username email isActive isOnline lastSeen createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// Get user details
export const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('username email isActive isOnline lastSeen createdAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's conversation count
    const conversationCount = await Conversation.countDocuments({
      participants: userId
    });

    // Get user's message count
    const messageCount = await Message.countDocuments({
      senderId: userId
    });

    res.json({
      success: true,
      data: {
        user,
        stats: {
          conversationCount,
          messageCount
        }
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details'
    });
  }
};

// Deactivate user account
export const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from deactivating themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deactivating other admins
    if (user.isAdmin()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate admin accounts'
      });
    }

    await user.deactivate();

    res.json({
      success: true,
      message: 'User account deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate user'
    });
  }
};

// Reactivate user account
export const reactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await user.reactivate();

    res.json({
      success: true,
      message: 'User account reactivated successfully'
    });
  } catch (error) {
    console.error('Reactivate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reactivate user'
    });
  }
};

// Delete user account permanently
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Note: This check is for user deletion, admin context updated
    // Admins are now in separate table

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Note: Users no longer have admin roles, so this check is removed

    // Delete user's messages
    await Message.deleteMany({ senderId: userId });

    // Remove user from conversations
    await Conversation.updateMany(
      { participants: userId },
      { $pull: { participants: userId } }
    );

    // Delete conversations with no participants
    await Conversation.deleteMany({ participants: { $size: 0 } });

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'User account deleted permanently'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// Get all admins
export const getAllAdmins = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role = req.query.role || 'all'; // all, super_admin, admin, moderator

    // Build query
    const query = {};

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    if (role !== 'all') {
      query.role = role;
    }

    const skip = (page - 1) * limit;

    const [admins, totalAdmins] = await Promise.all([
      Admin.find(query)
        .select('username email firstName lastName role isActive lastLogin createdAt createdBy')
        .populate('createdBy', 'username email firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Admin.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalAdmins / limit);

    res.json({
      success: true,
      data: {
        admins,
        pagination: {
          currentPage: page,
          totalPages,
          totalAdmins,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admins'
    });
  }
};

// Get admin details
export const getAdminDetails = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await Admin.findById(adminId)
      .select('username email firstName lastName role isActive lastLogin createdAt permissions')
      .populate('createdBy', 'username email firstName lastName');

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.json({
      success: true,
      data: {
        admin
      }
    });
  } catch (error) {
    console.error('Get admin details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin details'
    });
  }
};

// Deactivate admin
export const deactivateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    // Prevent self-deactivation
    if (adminId === req.admin._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Only super_admin can deactivate other super_admins
    if (admin.role === 'super_admin' && req.admin.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super administrators can deactivate super admin accounts'
      });
    }

    await admin.deactivate();

    res.json({
      success: true,
      message: 'Admin account deactivated successfully',
      data: {
        admin: admin.toJSON()
      }
    });
  } catch (error) {
    console.error('Deactivate admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate admin'
    });
  }
};

// Reactivate admin
export const reactivateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    await admin.reactivate();

    res.json({
      success: true,
      message: 'Admin account reactivated successfully',
      data: {
        admin: admin.toJSON()
      }
    });
  } catch (error) {
    console.error('Reactivate admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reactivate admin'
    });
  }
};
