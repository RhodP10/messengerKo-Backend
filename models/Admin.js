import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [2, 'Username must be at least 2 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    index: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    index: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters']
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  avatar: {
    type: String,
    default: function() {
      return `https://ui-avatars.com/api/?name=${this.firstName}+${this.lastName}&background=dc2626&color=fff`;
    }
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator'],
    default: 'admin'
  },
  permissions: [{
    type: String,
    enum: [
      'user_management',
      'conversation_management', 
      'message_management',
      'system_settings',
      'analytics_view',
      'admin_management'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Additional indexes for better performance
adminSchema.index({ isActive: 1 });
adminSchema.index({ role: 1 });
adminSchema.index({ createdAt: -1 });

// Virtual for full name
adminSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for checking if account is locked
adminSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Hash password before saving
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Set default permissions based on role
adminSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('role')) {
    switch (this.role) {
      case 'super_admin':
        this.permissions = [
          'user_management',
          'conversation_management',
          'message_management',
          'system_settings',
          'analytics_view',
          'admin_management'
        ];
        break;
      case 'admin':
        this.permissions = [
          'user_management',
          'conversation_management',
          'message_management',
          'analytics_view'
        ];
        break;
      case 'moderator':
        this.permissions = [
          'user_management',
          'message_management'
        ];
        break;
    }
  }
  next();
});

// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Increment login attempts
adminSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Reset login attempts
adminSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() }
  });
};

// Check if admin has specific permission
adminSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

// Deactivate admin account
adminSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Reactivate admin account
adminSchema.methods.reactivate = function() {
  this.isActive = true;
  this.loginAttempts = 0;
  this.lockUntil = null;
  return this.save();
};

// Transform output (remove password and sensitive data)
adminSchema.methods.toJSON = function() {
  const admin = this.toObject({ virtuals: true });
  delete admin.password;
  delete admin.twoFactorSecret;
  delete admin.__v;
  return admin;
};

// Static method to find by email or username
adminSchema.statics.findByEmailOrUsername = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier }
    ]
  });
};

export default mongoose.model('Admin', adminSchema);
