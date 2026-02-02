const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    // Check for superadmin token first
    if (token.startsWith('superadmin_')) {
      // Validate superadmin token format: superadmin_{secret}_{timestamp}
      const parts = token.split('_');
      const validSecret = process.env.SUPERADMIN_SECRET || 'default_secret';
      if (parts.length >= 3 && parts[1] === validSecret) {
        req.user = {
          id: 'superadmin-1',
          email: process.env.SUPERADMIN_EMAIL || 'admin@miscanchas.com',
          firstName: 'Super',
          lastName: 'Admin',
          userType: 'superadmin',
          role: 'superadmin',
          isActive: true
        };
        return next();
      }
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database (unified - includes staff)
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: 'Account disabled',
        message: 'Your account has been disabled'
      });
    }

    // Enrich user object with staff info if applicable
    const userData = user.toJSON();
    if (userData.establishmentId && userData.staffRole) {
      userData.isStaff = true;
    }
    
    req.user = userData;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Please provide a valid token'
      });
    }

    console.error('Authentication middleware error:', error.name, error.message);
    return res.status(401).json({
      error: 'Authentication error',
      message: error.message || 'Failed to authenticate token'
    });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please login first'
      });
    }

    const userRoles = Array.isArray(roles) ? roles : [roles];
    
    // Superadmin has access to everything
    if (req.user.userType === 'superadmin' || req.user.role === 'superadmin') {
      return next();
    }
    
    if (!userRoles.includes(req.user.userType) && !userRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password'] }
    });

    req.user = user && user.isActive ? user : null;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  optionalAuth
};
