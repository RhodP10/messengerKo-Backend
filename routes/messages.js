import express from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateMessage } from '../middleware/validation.js';

const router = express.Router();

// @route   GET /api/messages/:conversationId
// @desc    Get messages for a conversation
// @access  Private
router.get('/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    // Check if user is participant in conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Get messages
    const messages = await Message.getConversationMessages(
      conversationId,
      parseInt(page),
      parseInt(limit)
    );

    // Reverse to get chronological order (oldest first)
    const chronologicalMessages = messages.reverse();

    res.json({
      success: true,
      data: {
        messages: chronologicalMessages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore: messages.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting messages'
    });
  }
});

// @route   POST /api/messages
// @desc    Send a new message
// @access  Private
router.post('/', authenticateToken, validateMessage, async (req, res) => {
  try {
    const { conversationId, content, type = 'text', replyTo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    // Check if user is participant in conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Validate reply message if provided
    if (replyTo && !mongoose.Types.ObjectId.isValid(replyTo)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reply message ID'
      });
    }

    // Create new message
    const message = new Message({
      conversation: conversationId,
      sender: req.user._id,
      content,
      type,
      replyTo: replyTo || null
    });

    await message.save();

    // Update conversation's last activity and last message
    await conversation.updateLastActivity(message._id);

    // Populate message data
    await message.populate('sender', 'username email avatar');
    if (replyTo) {
      await message.populate('replyTo', 'content sender');
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message: message.toJSON()
      }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending message'
    });
  }
});

// @route   PUT /api/messages/:id
// @desc    Edit a message
// @access  Private
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    // Find message and check ownership
    const message = await Message.findOne({
      _id: id,
      sender: req.user._id,
      isDeleted: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you are not authorized to edit it'
      });
    }

    // Check if message is too old to edit (e.g., 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (message.createdAt < fifteenMinutesAgo) {
      return res.status(400).json({
        success: false,
        message: 'Message is too old to edit'
      });
    }

    // Edit message
    await message.editContent(content.trim());
    await message.populate('sender', 'username email avatar');

    res.json({
      success: true,
      message: 'Message edited successfully',
      data: {
        message: message.toJSON()
      }
    });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error editing message'
    });
  }
});

// @route   DELETE /api/messages/:id
// @desc    Delete a message
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    // Find message and check ownership
    const message = await Message.findOne({
      _id: id,
      sender: req.user._id,
      isDeleted: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you are not authorized to delete it'
      });
    }

    // Soft delete message
    await message.softDelete();

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting message'
    });
  }
});

// @route   POST /api/messages/:id/read
// @desc    Mark message as read
// @access  Private
router.post('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is participant in the conversation
    const conversation = await Conversation.findOne({
      _id: message.conversation,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Mark as read
    await message.markAsRead(req.user._id);

    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error marking message as read'
    });
  }
});

export default router;
