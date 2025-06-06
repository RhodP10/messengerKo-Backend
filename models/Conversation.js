import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  type: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Conversation name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  avatar: {
    type: String,
    default: null
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastActivity: -1 });
conversationSchema.index({ type: 1 });

// Validate participants
conversationSchema.pre('save', function(next) {
  if (this.type === 'direct' && this.participants.length !== 2) {
    return next(new Error('Direct conversations must have exactly 2 participants'));
  }
  if (this.type === 'group' && this.participants.length < 2) {
    return next(new Error('Group conversations must have at least 2 participants'));
  }
  next();
});

// Static method to find conversation between users
conversationSchema.statics.findDirectConversation = function(userId1, userId2) {
  return this.findOne({
    type: 'direct',
    participants: { $all: [userId1, userId2] }
  }).populate('participants', 'username email avatar isOnline lastSeen')
    .populate('lastMessage');
};

// Static method to find user's conversations
conversationSchema.statics.findUserConversations = function(userId) {
  return this.find({
    participants: userId,
    isActive: true
  })
  .populate('participants', 'username email avatar isOnline lastSeen')
  .populate('lastMessage')
  .sort({ lastActivity: -1 });
};

// Method to add participant
conversationSchema.methods.addParticipant = function(userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to remove participant
conversationSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(
    participant => !participant.equals(userId)
  );
  
  // Deactivate conversation if no participants left
  if (this.participants.length === 0) {
    this.isActive = false;
  }
  
  return this.save();
};

// Method to update last activity
conversationSchema.methods.updateLastActivity = function(messageId = null) {
  this.lastActivity = new Date();
  if (messageId) {
    this.lastMessage = messageId;
  }
  return this.save();
};

export default mongoose.model('Conversation', conversationSchema);
