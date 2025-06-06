import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

// Import configurations and middleware
import connectDB from './config/database.js';
import { authenticateSocket } from './middleware/auth.js';
import { handleConnection } from './socket/socketHandlers.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import groupMembersRoutes from './routes/groupMembers.js';
import adminRoutes from './routes/admin.js';
import adminAuthRoutes from './routes/adminAuth.js';
import adminUsersRoutes from './routes/adminUsers.js';
import adminConversationsRoutes from './routes/adminConversations.js';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const server = createServer(app);

// Trust proxy for Render.com deployment
app.set('trust proxy', 1);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting - More lenient for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for testing
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true, // Trust proxy headers
});

app.use('/api/', limiter);

// CORS middleware - Allow all origins for now
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});





// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/conversations', groupMembersRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/conversations', adminConversationsRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Socket.io authentication middleware
io.use(authenticateSocket);

// Socket.io connection handling
io.on('connection', (socket) => {
  handleConnection(io, socket);
});

// Start server
const PORT = process.env.PORT || 10000;  // Render.com uses port 10000

server.listen(PORT, () => {
  console.log(`
🚀 Server running in ${process.env.NODE_ENV || 'development'} mode
📡 HTTP Server: http://localhost:${PORT}
🔌 Socket.io Server: ws://localhost:${PORT}
📊 Health Check: http://localhost:${PORT}/health
🗄️  Database: ${process.env.MONGODB_URI}
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});

export default app;
