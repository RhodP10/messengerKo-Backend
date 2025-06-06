import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';

// Store active socket connections
const activeUsers = new Map();

export const handleConnection = (io, socket) => {
  console.log(`✅ User connected: ${socket.user.username} (${socket.id})`);

  // Store user connection
  activeUsers.set(socket.userId, {
    socketId: socket.id,
    user: socket.user
  });

  // Update user's online status and socket ID
  socket.user.setOnlineStatus(true, socket.id);

  // Join user to their personal room
  socket.join(`user_${socket.userId}`);

  // Notify other users that this user is online
  socket.broadcast.emit('user_online', {
    userId: socket.userId,
    username: socket.user.username
  });

  // Handle joining conversation rooms
  socket.on('join_conversation', async (data) => {
    try {
      const { conversationId } = data;

      // Verify user is participant in conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      });

      if (conversation) {
        socket.join(`conversation_${conversationId}`);
        console.log(`📝 User ${socket.user.username} joined conversation ${conversationId}`);
        
        // Notify other participants
        socket.to(`conversation_${conversationId}`).emit('user_joined_conversation', {
          userId: socket.userId,
          username: socket.user.username,
          conversationId
        });
      }
    } catch (error) {
      console.error('Join conversation error:', error);
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  });

  // Handle leaving conversation rooms
  socket.on('leave_conversation', (data) => {
    try {
      const { conversationId } = data;
      socket.leave(`conversation_${conversationId}`);
      console.log(`📝 User ${socket.user.username} left conversation ${conversationId}`);
      
      // Notify other participants
      socket.to(`conversation_${conversationId}`).emit('user_left_conversation', {
        userId: socket.userId,
        username: socket.user.username,
        conversationId
      });
    } catch (error) {
      console.error('Leave conversation error:', error);
    }
  });

  // Handle sending messages
  socket.on('send_message', async (data) => {
    try {
      const { conversationId, content, type = 'text', replyTo } = data;

      // Verify user is participant in conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      });

      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      // Create new message
      const message = new Message({
        conversation: conversationId,
        sender: socket.userId,
        content,
        type,
        replyTo: replyTo || null
      });

      await message.save();

      // Update conversation's last activity
      await conversation.updateLastActivity(message._id);

      // Populate message data
      await message.populate('sender', 'username email avatar');
      if (replyTo) {
        await message.populate('replyTo', 'content sender');
      }

      // Send message to all participants in the conversation
      io.to(`conversation_${conversationId}`).emit('new_message', {
        message: message.toJSON()
      });

      // Send push notification to offline users (if implemented)
      const offlineParticipants = conversation.participants.filter(
        participantId => !activeUsers.has(participantId.toString()) && 
                        participantId.toString() !== socket.userId
      );

      // TODO: Implement push notifications for offline users
      console.log(`📱 Would send push notification to ${offlineParticipants.length} offline users`);

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    try {
      const { conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('user_typing', {
        userId: socket.userId,
        username: socket.user.username,
        conversationId
      });
    } catch (error) {
      console.error('Typing start error:', error);
    }
  });

  socket.on('typing_stop', (data) => {
    try {
      const { conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('user_stopped_typing', {
        userId: socket.userId,
        username: socket.user.username,
        conversationId
      });
    } catch (error) {
      console.error('Typing stop error:', error);
    }
  });

  // Handle message read receipts
  socket.on('mark_messages_read', async (data) => {
    try {
      const { conversationId, messageIds } = data;

      // Verify user is participant in conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      });

      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      // Mark messages as read
      await Promise.all(
        messageIds.map(async (messageId) => {
          const message = await Message.findById(messageId);
          if (message) {
            await message.markAsRead(socket.userId);
          }
        })
      );

      // Notify other participants about read receipts
      socket.to(`conversation_${conversationId}`).emit('messages_read', {
        userId: socket.userId,
        conversationId,
        messageIds
      });

    } catch (error) {
      console.error('Mark messages read error:', error);
      socket.emit('error', { message: 'Failed to mark messages as read' });
    }
  });

  // Handle user status updates
  socket.on('update_status', async (data) => {
    try {
      const { status } = data; // 'online', 'away', 'busy', etc.
      
      // Update user status in database if needed
      // For now, we'll just broadcast the status change
      socket.broadcast.emit('user_status_changed', {
        userId: socket.userId,
        username: socket.user.username,
        status
      });
    } catch (error) {
      console.error('Update status error:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      console.log(`❌ User disconnected: ${socket.user.username} (${socket.id})`);

      // Remove from active users
      activeUsers.delete(socket.userId);

      // Update user's online status
      await socket.user.setOnlineStatus(false);

      // Notify other users that this user is offline
      socket.broadcast.emit('user_offline', {
        userId: socket.userId,
        username: socket.user.username,
        lastSeen: new Date()
      });

    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });
};

// Helper function to get online users
export const getOnlineUsers = () => {
  return Array.from(activeUsers.values()).map(({ user }) => ({
    id: user._id,
    username: user.username,
    avatar: user.avatar
  }));
};

// Helper function to check if user is online
export const isUserOnline = (userId) => {
  return activeUsers.has(userId);
};

// Helper function to send message to specific user
export const sendToUser = (io, userId, event, data) => {
  const userConnection = activeUsers.get(userId);
  if (userConnection) {
    io.to(userConnection.socketId).emit(event, data);
    return true;
  }
  return false;
};
