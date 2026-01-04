const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { sequelize, testConnection } = require('./config/database');
const { connectRedis } = require('./config/redis');

const app = express();

// Trust proxy for Railway/production environments (needed for rate limiting and correct IP detection)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware - configure helmet to allow cross-origin images
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      process.env.FRONTEND_PROD_URL || 'https://your-vercel-app.vercel.app',
      'http://localhost:4555', // Development frontend port
      'https://www.miscanchas.com',
      'https://miscanchas.com',
      'https://sports-booking-platform-two.vercel.app',
      'https://sports-booking-platform-git-main-esquivelfacundos-projects.vercel.app'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow all origins in production for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting - more permissive for SPA applications
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 1 * 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (process.env.NODE_ENV === 'development' ? 2000 : 1500), // 2000 in dev, 1500 in prod (increased from 500)
  message: {
    error: 'Demasiadas solicitudes. Por favor, espera un momento antes de intentar de nuevo.',
    code: 'TOO_MANY_REQUESTS',
    retryAfter: 60 // seconds until rate limit resets
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development', // Skip rate limiting in development
  keyGenerator: (req) => {
    // Use a combination of IP and user ID if authenticated for better rate limiting
    const userId = req.user?.id || 'anonymous';
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    return `${ip}-${userId}`;
  }
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/establishments', require('./routes/establishments'));
app.use('/api/courts', require('./routes/courts'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/mp', require('./routes/mp'));
app.use('/api/debts', require('./routes/debts'));
app.use('/api/products', require('./routes/products'));
app.use('/api/product-categories', require('./routes/product-categories'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/stock-movements', require('./routes/stock-movements'));
app.use('/api/booking-consumptions', require('./routes/booking-consumptions'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payment-methods', require('./routes/payment-methods'));
app.use('/api/expense-categories', require('./routes/expense-categories'));
app.use('/api/cash-registers', require('./routes/cash-registers'));
app.use('/api/cash-register-movements', require('./routes/cash-register-movements'));
app.use('/api/current-accounts', require('./routes/currentAccounts'));
app.use('/api/amenities', require('./routes/amenities'));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/v1', require('./routes/api-v1'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/recurring-bookings', require('./routes/recurring-bookings'));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested route ${req.originalUrl} does not exist.`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.errors.map(e => e.message).join(', ')
    });
  }

  // Sequelize unique constraint errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Resource already exists'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Please provide a valid authentication token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      message: 'Authentication token has expired'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    
    // Connect to Redis (optional)
    await connectRedis();
    
    // Sync database models
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Database models synchronized');
    }
    
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

module.exports = app;
