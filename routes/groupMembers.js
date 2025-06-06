import express from 'express';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/conversations/:id/members
// @desc    Get all members of a group conversation
// @access  Private (participants only)
router.get('/:id/members', authenticateToken, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('participants', 'username email firstName lastName avatar isOnline lastSeen')
      .populate('createdBy', 'username email');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is a participant
    if (!conversation.participants.some(p => p._id.equals(req.user._id))) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this conversation'
      });
    }

    // Only allow for group conversations
    if (conversation.type !== 'group') {
      return res.status(400).json({
        success: false,
        message: 'This operation is only allowed for group conversations'
      });
    }

    res.json({
      success: true,
      data: {
        conversation: {
          _id: conversation._id,
          name: conversation.name,
          description: conversation.description,
          type: conversation.type,
          createdBy: conversation.createdBy,
          participantCount: conversation.participants.length
        },
        members: conversation.participants
      }
    });
  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting group members'
    });
  }
});

// @route   POST /api/conversations/:id/members
// @desc    Add members to a group conversation
// @access  Private (creator or existing members)
router.post('/:id/members', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Add group members request:', {
      conversationId: req.params.id,
      userId: req.user._id,
      body: req.body
    });

    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.log('❌ Invalid userIds:', userIds);
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    const conversation = await Conversation.findById(req.params.id)
      .populate('participants', 'username email')
      .populate('createdBy', 'username email');

    console.log('🔍 Found conversation:', conversation ? 'Yes' : 'No');
    if (conversation) {
      console.log('📝 Conversation details:', {
        id: conversation._id,
        type: conversation.type,
        participantCount: conversation.participants.length,
        createdBy: conversation.createdBy
      });
    }

    if (!conversation) {
      console.log('❌ Conversation not found for ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is a participant or creator
    const isParticipant = conversation.participants.some(p => p._id.equals(req.user._id));
    const isCreator = conversation.createdBy._id.equals(req.user._id);

    console.log('🔍 Permission check:', {
      isParticipant,
      isCreator,
      userId: req.user._id,
      createdBy: conversation.createdBy._id
    });

    if (!isParticipant && !isCreator) {
      console.log('❌ User not authorized');
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to add members to this conversation'
      });
    }

    // Only allow for group conversations
    if (conversation.type !== 'group') {
      return res.status(400).json({
        success: false,
        message: 'This operation is only allowed for group conversations'
      });
    }

    // Validate that all user IDs exist
    console.log('🔍 Looking for users:', userIds);
    const usersToAdd = await User.find({
      _id: { $in: userIds },
      isActive: true
    });

    console.log('🔍 Found users:', usersToAdd.map(u => ({ id: u._id, username: u.username })));

    if (usersToAdd.length !== userIds.length) {
      console.log('❌ Some users not found or inactive');
      return res.status(400).json({
        success: false,
        message: 'One or more users not found or inactive'
      });
    }

    // Add users to conversation
    const addedUsers = [];
    const alreadyMembers = [];

    for (const user of usersToAdd) {
      if (!conversation.participants.some(p => p._id.equals(user._id))) {
        conversation.participants.push(user._id);
        addedUsers.push(user);
      } else {
        alreadyMembers.push(user);
      }
    }

    if (addedUsers.length > 0) {
      console.log('✅ Saving conversation with new members');
      await conversation.save();

      // Create system message about new members
      console.log('✅ Creating system message');
      const systemMessage = new Message({
        conversation: conversation._id,
        sender: req.user._id,
        content: `${addedUsers.map(u => u.username).join(', ')} ${addedUsers.length === 1 ? 'was' : 'were'} added to the group`,
        type: 'system'
      });
      await systemMessage.save();

      // Update last activity
      console.log('✅ Updating last activity');
      await conversation.updateLastActivity(systemMessage._id);
    }

    console.log('✅ Sending success response');
    res.json({
      success: true,
      message: `${addedUsers.length} member(s) added successfully`,
      data: {
        addedUsers: addedUsers.map(u => ({
          _id: u._id,
          username: u.username,
          email: u.email
        })),
        alreadyMembers: alreadyMembers.map(u => ({
          _id: u._id,
          username: u.username,
          email: u.email
        })),
        totalMembers: conversation.participants.length
      }
    });
  } catch (error) {
    console.error('Add group members error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding group members'
    });
  }
});

// @route   DELETE /api/conversations/:id/members/:userId
// @desc    Remove a member from a group conversation
// @access  Private (creator or the member themselves)
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const conversation = await Conversation.findById(req.params.id)
      .populate('participants', 'username email')
      .populate('createdBy', 'username email');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Only allow for group conversations
    if (conversation.type !== 'group') {
      return res.status(400).json({
        success: false,
        message: 'This operation is only allowed for group conversations'
      });
    }

    // Check permissions: creator can remove anyone, users can remove themselves
    const isCreator = conversation.createdBy._id.equals(req.user._id);
    const isSelfRemoval = req.user._id.equals(userId);

    if (!isCreator && !isSelfRemoval) {
      return res.status(403).json({
        success: false,
        message: 'You can only remove yourself from the group'
      });
    }

    // Find the user to remove
    const userToRemove = await User.findById(userId);
    if (!userToRemove) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is actually a member
    if (!conversation.participants.some(p => p._id.equals(userId))) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of this conversation'
      });
    }

    // Remove user from conversation
    await conversation.removeParticipant(userId);

    // Create system message about member removal
    const systemMessage = new Message({
      conversation: conversation._id,
      sender: req.user._id,
      content: isSelfRemoval
        ? `${userToRemove.username} left the group`
        : `${userToRemove.username} was removed from the group`,
      type: 'system'
    });
    await systemMessage.save();

    // Update last activity
    await conversation.updateLastActivity(systemMessage._id);

    res.json({
      success: true,
      message: isSelfRemoval 
        ? 'You have left the group'
        : 'Member removed successfully',
      data: {
        removedUser: {
          _id: userToRemove._id,
          username: userToRemove.username,
          email: userToRemove.email
        },
        remainingMembers: conversation.participants.length
      }
    });
  } catch (error) {
    console.error('Remove group member error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error removing group member'
    });
  }
});

// @route   GET /api/conversations/:id/available-users
// @desc    Get users that can be added to the group (not already members)
// @access  Private (participants only)
router.get('/:id/available-users', authenticateToken, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is a participant
    if (!conversation.participants.some(p => p.equals(req.user._id))) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this conversation'
      });
    }

    // Only allow for group conversations
    if (conversation.type !== 'group') {
      return res.status(400).json({
        success: false,
        message: 'This operation is only allowed for group conversations'
      });
    }

    // Get all active users except current participants
    const availableUsers = await User.find({
      _id: { $nin: conversation.participants },
      isActive: true
    }).select('username email firstName lastName avatar').limit(50);

    res.json({
      success: true,
      data: {
        availableUsers
      }
    });
  } catch (error) {
    console.error('Get available users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting available users'
    });
  }
});

export default router;
