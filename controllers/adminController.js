import User from '../models/User.js';
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

    if (role !== 'all') {
      query.role = role;
    }

    const skip = (page - 1) * limit;

    const [users, totalUsers] = await Promise.all([
      User.find(query)
        .select('username email role isActive isOnline lastSeen createdAt')
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
      .select('username email role isActive isOnline lastSeen createdAt');

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

    // Prevent admin from deleting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting other admins
    if (user.isAdmin()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete admin accounts'
      });
    }

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
