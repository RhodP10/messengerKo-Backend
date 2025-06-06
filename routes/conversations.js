import express from 'express';
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateConversation } from '../middleware/validation.js';

const router = express.Router();

// @route   GET /api/conversations
// @desc    Get user's conversations
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const conversations = await Conversation.findUserConversations(req.user._id);

    // Get unread counts for each conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conversation) => {
        const unreadCount = await Message.getUnreadCount(conversation._id, req.user._id);
        
        return {
          ...conversation.toJSON(),
          unreadCount
        };
      })
    );

    res.json({
      success: true,
      data: {
        conversations: conversationsWithUnread
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

// @route   POST /api/conversations
// @desc    Create or get existing conversation
// @access  Private
router.post('/', authenticateToken, validateConversation, async (req, res) => {
  try {
    const { participants, type = 'direct', name, description } = req.body;

    // Add current user to participants if not included
    const allParticipants = [...new Set([...participants, req.user._id.toString()])];

    // For direct conversations, check if conversation already exists
    if (type === 'direct' && allParticipants.length === 2) {
      const existingConversation = await Conversation.findDirectConversation(
        allParticipants[0],
        allParticipants[1]
      );

      if (existingConversation) {
        return res.json({
          success: true,
          message: 'Conversation already exists',
          data: {
            conversation: existingConversation
          }
        });
      }
    }

    // Validate all participants exist
    const validParticipants = await User.find({
      _id: { $in: allParticipants }
    });

    if (validParticipants.length !== allParticipants.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more participants not found'
      });
    }

    // Create new conversation
    const conversation = new Conversation({
      participants: allParticipants,
      type,
      name,
      description,
      createdBy: req.user._id
    });

    await conversation.save();

    // Populate the conversation
    await conversation.populate('participants', 'username email avatar isOnline lastSeen');

    res.status(201).json({
      success: true,
      message: 'Conversation created successfully',
      data: {
        conversation: {
          ...conversation.toJSON(),
          unreadCount: 0
        }
      }
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating conversation'
    });
  }
});

// @route   GET /api/conversations/:id
// @desc    Get specific conversation
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: req.user._id
    }).populate('participants', 'username email avatar isOnline lastSeen')
      .populate('lastMessage');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const unreadCount = await Message.getUnreadCount(conversation._id, req.user._id);

    res.json({
      success: true,
      data: {
        conversation: {
          ...conversation.toJSON(),
          unreadCount
        }
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

// @route   PUT /api/conversations/:id
// @desc    Update conversation
// @access  Private
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Update fields
    if (name !== undefined) conversation.name = name;
    if (description !== undefined) conversation.description = description;

    await conversation.save();
    await conversation.populate('participants', 'username email avatar isOnline lastSeen');

    res.json({
      success: true,
      message: 'Conversation updated successfully',
      data: {
        conversation: conversation.toJSON()
      }
    });
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating conversation'
    });
  }
});

// @route   DELETE /api/conversations/:id
// @desc    Delete/leave conversation
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Remove user from participants
    await conversation.removeParticipant(req.user._id);

    res.json({
      success: true,
      message: 'Left conversation successfully'
    });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error leaving conversation'
    });
  }
});

// @route   POST /api/conversations/:id/participants
// @desc    Add participant to conversation
// @access  Private
router.post('/:id/participants', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user exists
    const userToAdd = await User.findById(userId);
    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add participant
    await conversation.addParticipant(userId);
    await conversation.populate('participants', 'username email avatar isOnline lastSeen');

    res.json({
      success: true,
      message: 'Participant added successfully',
      data: {
        conversation: conversation.toJSON()
      }
    });
  } catch (error) {
    console.error('Add participant error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding participant'
    });
  }
});

export default router;
