import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  fileUrl: {
    type: String,
    default: null
  },
  fileName: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: null
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  editedAt: {
    type: Date,
    default: null
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better performance
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ 'readBy.user': 1 });

// Virtual for checking if message is read by specific user
messageSchema.virtual('isReadBy').get(function() {
  return (userId) => {
    return this.readBy.some(read => read.user.equals(userId));
  };
});

// Static method to get conversation messages
messageSchema.statics.getConversationMessages = function(conversationId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return this.find({
    conversation: conversationId,
    isDeleted: false
  })
  .populate('sender', 'username email avatar')
  .populate('replyTo', 'content sender')
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(skip);
};

// Method to mark as read by user
messageSchema.methods.markAsRead = function(userId) {
  // Check if already read by this user
  const alreadyRead = this.readBy.some(read => read.user.equals(userId));
  
  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to edit message
messageSchema.methods.editContent = function(newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Method to soft delete message
messageSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.content = 'This message was deleted';
  return this.save();
};

// Static method to get unread count for user in conversation
messageSchema.statics.getUnreadCount = function(conversationId, userId) {
  return this.countDocuments({
    conversation: conversationId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
    isDeleted: false
  });
};

// Transform output for deleted messages
messageSchema.methods.toJSON = function() {
  const message = this.toObject();
  
  if (message.isDeleted) {
    message.content = 'This message was deleted';
    delete message.fileUrl;
    delete message.fileName;
    delete message.fileSize;
  }
  
  delete message.__v;
  return message;
};

export default mongoose.model('Message', messageSchema);
