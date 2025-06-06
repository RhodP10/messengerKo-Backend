# Messenger Backend API

A real-time chat application backend built with Node.js, Express, MongoDB, and Socket.io.

## 🚀 Features

- **User Authentication** - JWT-based auth with bcrypt password hashing
- **Real-time Messaging** - Socket.io for instant message delivery
- **MongoDB Database** - Scalable document-based storage
- **RESTful API** - Clean API endpoints for all operations
- **Input Validation** - Comprehensive request validation
- **Security** - Helmet, CORS, rate limiting, and more
- **Online Status** - Real-time user presence tracking
- **Message Read Receipts** - Track message delivery and read status
- **Typing Indicators** - Show when users are typing
- **Group Conversations** - Support for both direct and group chats

## 📋 Prerequisites

- Node.js (v18 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   MONGODB_URI=mongodb://localhost:27017/messenger
   JWT_SECRET=your-super-secret-jwt-key
   PORT=3000
   NODE_ENV=development
   CORS_ORIGINS=http://localhost:5174,http://localhost:3000
   ```

4. **Start MongoDB**
   - Local: `mongod`
   - Or use MongoDB Atlas cloud database

5. **Run the server**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/refresh` - Refresh JWT token

### Users
- `GET /api/users/search?q=query` - Search users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/profile` - Update profile
- `PUT /api/users/password` - Change password
- `GET /api/users/online` - Get online users
- `DELETE /api/users/account` - Delete account

### Conversations
- `GET /api/conversations` - Get user's conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/:id` - Get specific conversation
- `PUT /api/conversations/:id` - Update conversation
- `DELETE /api/conversations/:id` - Leave conversation
- `POST /api/conversations/:id/participants` - Add participant

### Messages
- `GET /api/messages/:conversationId` - Get conversation messages
- `POST /api/messages` - Send new message
- `PUT /api/messages/:id` - Edit message
- `DELETE /api/messages/:id` - Delete message
- `POST /api/messages/:id/read` - Mark message as read

## 🔌 Socket.io Events

### Client to Server
- `join_conversation` - Join a conversation room
- `leave_conversation` - Leave a conversation room
- `send_message` - Send a new message
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `mark_messages_read` - Mark messages as read
- `update_status` - Update user status

### Server to Client
- `new_message` - New message received
- `user_online` - User came online
- `user_offline` - User went offline
- `user_typing` - User is typing
- `user_stopped_typing` - User stopped typing
- `messages_read` - Messages were read
- `user_status_changed` - User status changed
- `error` - Error occurred

## 🗄️ Database Schema

### User Model
```javascript
{
  username: String (unique),
  email: String (unique),
  password: String (hashed),
  avatar: String,
  isOnline: Boolean,
  lastSeen: Date,
  socketId: String
}
```

### Conversation Model
```javascript
{
  participants: [ObjectId],
  type: 'direct' | 'group',
  name: String,
  description: String,
  avatar: String,
  lastMessage: ObjectId,
  lastActivity: Date,
  createdBy: ObjectId,
  isActive: Boolean
}
```

### Message Model
```javascript
{
  conversation: ObjectId,
  sender: ObjectId,
  content: String,
  type: 'text' | 'image' | 'file' | 'system',
  fileUrl: String,
  fileName: String,
  fileSize: Number,
  readBy: [{user: ObjectId, readAt: Date}],
  editedAt: Date,
  isEdited: Boolean,
  isDeleted: Boolean,
  replyTo: ObjectId
}
```

## 🔒 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

For Socket.io connections, pass the token in the auth object:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

## 🛡️ Security Features

- **Password Hashing** - bcrypt with salt rounds
- **JWT Tokens** - Secure authentication tokens
- **Rate Limiting** - Prevent API abuse
- **CORS Protection** - Cross-origin request security
- **Helmet** - Security headers
- **Input Validation** - Comprehensive request validation
- **MongoDB Injection Protection** - Mongoose built-in protection

## 🚀 Deployment

### Environment Variables for Production
```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/messenger
JWT_SECRET=your-super-secure-production-secret
PORT=3000
CORS_ORIGINS=https://yourdomain.com
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 Health Check

Check if the server is running:
```bash
GET /health
```

Response:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development"
}
```

## 🐛 Error Handling

All API responses follow this format:

**Success Response:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error description",
  "errors": [ ... ] // For validation errors
}
```

## 📝 Development

### Running Tests
```bash
npm test
```

### Code Formatting
```bash
npm run format
```

### Linting
```bash
npm run lint
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.
