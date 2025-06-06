import express from 'express';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// @route   GET /api/admin/conversations
// @desc    Get all conversations with pagination and search
// @access  Admin only
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const type = req.query.type || ''; // 'direct', 'group', or empty for all
    const sortBy = req.query.sortBy || 'updatedAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build search query
    let searchQuery = {};
    
    if (type) {
      searchQuery.type = type;
    }

    if (search) {
      searchQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count for pagination
    const totalConversations = await Conversation.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalConversations / limit);
    const skip = (page - 1) * limit;

    // Get conversations with pagination and populate participants
    const conversations = await Conversation.find(searchQuery)
      .populate('participants', 'username email firstName lastName')
      .populate('lastMessage')
      .populate('createdBy', 'username email')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    // Add additional computed fields
    const conversationsWithStats = await Promise.all(
      conversations.map(async (conversation) => {
        const messageCount = await Message.countDocuments({ 
          conversationId: conversation._id 
        });

        return {
          ...conversation,
          messageCount,
          participantCount: conversation.participants.length,
          isGroup: conversation.type === 'group',
          displayName: conversation.type === 'group' 
            ? conversation.name 
            : conversation.participants.map(p => p.username).join(', ')
        };
      })
    );

    res.json({
      success: true,
      data: {
        conversations: conversationsWithStats,
        pagination: {
          currentPage: page,
          totalPages,
          totalConversations,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting conversations'
    });
  }
});

// @route   GET /api/admin/conversations/stats/overview
// @desc    Get conversation statistics overview
// @access  Admin only
router.get('/stats/overview', authenticateAdmin, async (req, res) => {
  try {
    const totalConversations = await Conversation.countDocuments();
    const directChats = await Conversation.countDocuments({ type: 'direct' });
    const groupChats = await Conversation.countDocuments({ type: 'group' });
    const totalMessages = await Message.countDocuments();
    
    // Messages sent in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMessages = await Message.countDocuments({ 
      createdAt: { $gte: twentyFourHoursAgo } 
    });

    // Active conversations (with messages in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeConversations = await Conversation.countDocuments({
      updatedAt: { $gte: sevenDaysAgo }
    });

    res.json({
      success: true,
      data: {
        stats: {
          totalConversations,
          directChats,
          groupChats,
          totalMessages,
          recentMessages,
          activeConversations
        }
      }
    });
  } catch (error) {
    console.error('Get conversation stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting conversation statistics'
    });
  }
});

// @route   GET /api/admin/conversations/:id
// @desc    Get single conversation with messages
// @access  Admin only
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('participants', 'username email firstName lastName')
      .populate('createdBy', 'username email');
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Get recent messages (last 50)
    const messages = await Message.find({ conversationId: req.params.id })
      .populate('senderId', 'username email')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const messageCount = await Message.countDocuments({ 
      conversationId: req.params.id 
    });

    res.json({
      success: true,
      data: {
        conversation: {
          ...conversation.toJSON(),
          messageCount
        },
        messages: messages.reverse() // Show oldest first
      }
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting conversation'
    });
  }
});

// @route   DELETE /api/admin/conversations/:id
// @desc    Delete single conversation and all its messages
// @access  Admin only
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Delete all messages in this conversation
    const deletedMessages = await Message.deleteMany({ 
      conversationId: req.params.id 
    });

    // Delete the conversation
    await Conversation.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Conversation and all messages deleted successfully',
      data: {
        deletedMessages: deletedMessages.deletedCount
      }
    });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting conversation'
    });
  }
});

// @route   DELETE /api/admin/conversations/bulk/all
// @desc    Delete all direct conversations completely, but only messages from group chats
// @access  Admin only
router.delete('/bulk/all', authenticateAdmin, async (req, res) => {
  try {
    // Count before deletion for reporting
    const totalMessageCount = await Message.countDocuments();
    const directConversations = await Conversation.find({ type: 'direct' });
    const groupConversations = await Conversation.find({ type: 'group' });

    const directConversationIds = directConversations.map(c => c._id);

    // Delete all messages (both direct and group)
    await Message.deleteMany({});

    // Delete only direct conversations (keep group structures)
    await Conversation.deleteMany({ type: 'direct' });

    // Reset group conversations (clear lastMessage and update timestamp)
    await Conversation.updateMany(
      { type: 'group' },
      {
        $unset: { lastMessage: 1 },
        $set: { updatedAt: new Date() }
      }
    );

    res.json({
      success: true,
      message: 'All direct conversations deleted, group chat messages cleared (group structures preserved)',
      data: {
        deletedDirectConversations: directConversations.length,
        clearedGroupChats: groupConversations.length,
        deletedMessages: totalMessageCount
      }
    });
  } catch (error) {
    console.error('Bulk delete all error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk deletion'
    });
  }
});

// @route   DELETE /api/admin/conversations/bulk/nuclear
// @desc    Nuclear option: Delete EVERYTHING including group chat structures
// @access  Admin only
router.delete('/bulk/nuclear', authenticateAdmin, async (req, res) => {
  try {
    // Count before deletion for reporting
    const conversationCount = await Conversation.countDocuments();
    const messageCount = await Message.countDocuments();

    // Delete all messages first
    await Message.deleteMany({});

    // Delete all conversations (including groups)
    await Conversation.deleteMany({});

    res.json({
      success: true,
      message: 'NUCLEAR DELETION: All conversations and messages completely destroyed',
      data: {
        deletedConversations: conversationCount,
        deletedMessages: messageCount
      }
    });
  } catch (error) {
    console.error('Nuclear delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during nuclear deletion'
    });
  }
});

// @route   DELETE /api/admin/conversations/bulk/type/:type
// @desc    Delete all conversations of specific type (direct or group)
// @access  Admin only
router.delete('/bulk/type/:type', authenticateAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['direct', 'group'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation type. Must be "direct" or "group"'
      });
    }

    // Find conversations of this type
    const conversations = await Conversation.find({ type });
    const conversationIds = conversations.map(c => c._id);

    // Count before deletion
    const conversationCount = conversations.length;
    const messageCount = await Message.countDocuments({ 
      conversationId: { $in: conversationIds } 
    });

    // Delete messages for these conversations
    await Message.deleteMany({ 
      conversationId: { $in: conversationIds } 
    });

    // Delete conversations
    await Conversation.deleteMany({ type });

    res.json({
      success: true,
      message: `All ${type} conversations and their messages deleted successfully`,
      data: {
        deletedConversations: conversationCount,
        deletedMessages: messageCount
      }
    });
  } catch (error) {
    console.error('Bulk delete by type error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk deletion'
    });
  }
});

// @route   DELETE /api/admin/conversations/:id/messages
// @desc    Delete all messages in a conversation but keep the conversation
// @access  Admin only
router.delete('/:id/messages', authenticateAdmin, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Delete all messages in this conversation
    const deletedMessages = await Message.deleteMany({ 
      conversationId: req.params.id 
    });

    // Update conversation's lastMessage to null
    conversation.lastMessage = null;
    conversation.updatedAt = new Date();
    await conversation.save();

    res.json({
      success: true,
      message: 'All messages in conversation deleted successfully',
      data: {
        deletedMessages: deletedMessages.deletedCount
      }
    });
  } catch (error) {
    console.error('Delete conversation messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting messages'
    });
  }
});

export default router;
