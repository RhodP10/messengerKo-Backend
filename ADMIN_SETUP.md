# Admin System Setup Guide

This guide explains how to set up and use the separate admin system for MessengerKo.

## 🏗️ Architecture Overview

The admin system is now completely separated from the regular user system:

- **Users**: Regular chat application users (stored in `users` collection)
- **Admins**: Administrative users with special permissions (stored in `admins` collection)

## 🔧 Setup Instructions

### 1. Environment Configuration

Copy the environment template:
```bash
cp .env.example .env
```

Update the `.env` file with your configuration:
```env
MONGODB_URI=mongodb://localhost:27017/messengerko
JWT_SECRET=your-super-secret-jwt-key
PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:5174
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Super Admin Account

Run the script to create the first super admin:
```bash
npm run create-super-admin
```

This will create a super admin with:
- **Username**: `superadmin`
- **Email**: `superadmin@messengerko.com`
- **Password**: `SuperAdmin123!`
- **Role**: `super_admin`

⚠️ **Important**: Change the password after first login!

### 4. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 👥 Admin Roles & Permissions

### Super Admin (`super_admin`)
- Full system access
- Can create/manage other admins
- All permissions enabled

**Permissions:**
- `user_management`
- `conversation_management`
- `message_management`
- `system_settings`
- `analytics_view`
- `admin_management`

### Admin (`admin`)
- Standard administrative access
- Cannot manage other admins

**Permissions:**
- `user_management`
- `conversation_management`
- `message_management`
- `analytics_view`

### Moderator (`moderator`)
- Limited administrative access
- Focus on content moderation

**Permissions:**
- `user_management`
- `message_management`

## 🔐 Authentication

### Admin Login
```http
POST /api/admin/auth/login
Content-Type: application/json

{
  "identifier": "superadmin@messengerko.com",
  "password": "SuperAdmin123!"
}
```

### Response
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "admin": {
      "_id": "...",
      "username": "superadmin",
      "email": "superadmin@messengerko.com",
      "firstName": "Super",
      "lastName": "Administrator",
      "role": "super_admin",
      "permissions": ["user_management", "..."],
      "isActive": true,
      "fullName": "Super Administrator"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## 📡 API Endpoints

### Authentication Endpoints
- `POST /api/admin/auth/login` - Admin login
- `POST /api/admin/auth/register` - Create new admin (Super Admin only)
- `GET /api/admin/auth/me` - Get current admin info
- `POST /api/admin/auth/refresh` - Refresh token
- `POST /api/admin/auth/logout` - Admin logout
- `PUT /api/admin/auth/change-password` - Change password

### Dashboard Endpoints
- `GET /api/admin/dashboard/stats` - Get dashboard statistics

### User Management Endpoints
- `GET /api/admin/users` - Get all users (paginated)
- `GET /api/admin/users/:userId` - Get user details
- `PATCH /api/admin/users/:userId/deactivate` - Deactivate user
- `PATCH /api/admin/users/:userId/reactivate` - Reactivate user
- `DELETE /api/admin/users/:userId` - Delete user permanently

### Admin Management Endpoints (Super Admin only)
- `GET /api/admin/admins` - Get all admins (paginated)
- `GET /api/admin/admins/:adminId` - Get admin details
- `PATCH /api/admin/admins/:adminId/deactivate` - Deactivate admin
- `PATCH /api/admin/admins/:adminId/reactivate` - Reactivate admin

## 🔒 Security Features

### Account Lockout
- Accounts are locked after 5 failed login attempts
- Lockout duration: 2 hours
- Automatic unlock after lockout period

### Token Security
- Admin tokens expire in 8 hours (shorter than user tokens)
- Separate JWT secret for admin tokens
- Token type validation

### Permission System
- Role-based access control
- Granular permissions
- Middleware protection for all admin routes

### Password Requirements
- Minimum 8 characters
- Must contain uppercase, lowercase, number, and special character
- Secure bcrypt hashing with salt rounds

## 🗄️ Database Schema

### Admin Model
```javascript
{
  username: String (unique),
  email: String (unique),
  password: String (hashed),
  firstName: String,
  lastName: String,
  role: 'super_admin' | 'admin' | 'moderator',
  permissions: [String],
  isActive: Boolean,
  lastLogin: Date,
  loginAttempts: Number,
  lockUntil: Date,
  createdBy: ObjectId (ref: Admin),
  twoFactorEnabled: Boolean,
  twoFactorSecret: String,
  createdAt: Date,
  updatedAt: Date
}
```

## 🚀 Usage Examples

### Creating a New Admin
```bash
curl -X POST http://localhost:3001/api/admin/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -d '{
    "username": "admin1",
    "email": "admin1@messengerko.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Admin",
    "role": "admin"
  }'
```

### Getting Dashboard Stats
```bash
curl -X GET http://localhost:3001/api/admin/dashboard/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Managing Users
```bash
# Get all users
curl -X GET "http://localhost:3001/api/admin/users?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Deactivate a user
curl -X PATCH http://localhost:3001/api/admin/users/USER_ID/deactivate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## 🔧 Development Notes

- Admin and user authentication systems are completely separate
- Admin tokens have different structure and validation
- Permission checks are enforced at middleware level
- All admin operations are logged for audit purposes
- The system supports future expansion for 2FA and advanced security features

## 🛡️ Security Best Practices

1. **Change Default Credentials**: Always change the default super admin password
2. **Use Strong Passwords**: Enforce strong password policies
3. **Regular Token Rotation**: Implement token refresh mechanisms
4. **Monitor Admin Activity**: Log all administrative actions
5. **Principle of Least Privilege**: Assign minimal required permissions
6. **Regular Security Audits**: Review admin accounts and permissions regularly
