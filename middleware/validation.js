import { body, validationResult } from 'express-validator';

// Validation middleware to check for errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

// User registration validation
export const validateRegister = [
  body('username')
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('Username must be between 2 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
    
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
    
  handleValidationErrors
];

// User login validation
export const validateLogin = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or username is required'),
    
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
    
  handleValidationErrors
];

// Message validation
export const validateMessage = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message content must be between 1 and 2000 characters'),
    
  body('type')
    .optional()
    .isIn(['text', 'image', 'file'])
    .withMessage('Message type must be text, image, or file'),
    
  handleValidationErrors
];

// Conversation validation
export const validateConversation = [
  body('participants')
    .isArray({ min: 1 })
    .withMessage('At least one participant is required'),
    
  body('participants.*')
    .isMongoId()
    .withMessage('Each participant must be a valid user ID'),
    
  body('type')
    .optional()
    .isIn(['direct', 'group'])
    .withMessage('Conversation type must be direct or group'),
    
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Conversation name cannot exceed 100 characters'),
    
  handleValidationErrors
];

// Update profile validation
export const validateProfileUpdate = [
  body('username')
    .optional()
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('Username must be between 2 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
    
  handleValidationErrors
];

// Change password validation
export const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
    
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number'),
    
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),
    
  handleValidationErrors
];
