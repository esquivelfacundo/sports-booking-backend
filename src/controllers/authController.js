const { User, EstablishmentStaff, Establishment } = require('../models');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateTokenPair, verifyRefreshToken } = require('../utils/jwt');
const { Op } = require('sequelize');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, userType = 'player' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      userType,
      emailVerificationToken
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user.id);

    // Remove password from response
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;
    delete userResponse.emailVerificationToken;

    res.status(201).json({
      message: 'User registered successfully',
      user: userResponse,
      tokens: {
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // First, try to find in regular users
    let user = await User.findOne({ where: { email } });
    let isStaff = false;
    let staffData = null;

    if (user) {
      // Check if account is active
      if (!user.isActive) {
        return res.status(401).json({
          error: 'Account disabled',
          message: 'Your account has been disabled'
        });
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      // Update last login
      await user.update({ lastLoginAt: new Date() });

      // Generate tokens
      const { accessToken, refreshToken } = generateTokenPair(user.id);

      // Remove password from response
      const userResponse = { ...user.toJSON() };
      delete userResponse.password;
      delete userResponse.emailVerificationToken;
      delete userResponse.passwordResetToken;
      delete userResponse.passwordResetExpires;

      return res.json({
        message: 'Login successful',
        user: userResponse,
        tokens: {
          accessToken,
          refreshToken
        }
      });
    }

    // If not found in users, try establishment staff
    const staff = await EstablishmentStaff.findOne({
      where: { email, isActive: true },
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: ['id', 'name']
      }]
    });

    if (!staff) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Verify staff password
    const isValidStaffPassword = await bcrypt.compare(password, staff.password);
    if (!isValidStaffPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Update last login
    await staff.update({ lastLoginAt: new Date() });

    // Generate tokens with staff info
    const { accessToken, refreshToken } = generateTokenPair(staff.id, {
      isStaff: true,
      establishmentId: staff.establishmentId,
      role: staff.role,
      permissions: staff.permissions
    });

    // Build staff response (similar to user response)
    const staffResponse = {
      id: staff.id,
      email: staff.email,
      firstName: staff.name.split(' ')[0],
      lastName: staff.name.split(' ').slice(1).join(' ') || '',
      phone: staff.phone,
      userType: 'establishment', // Staff are establishment users
      isStaff: true,
      staffRole: staff.role,
      permissions: staff.permissions,
      establishmentId: staff.establishmentId,
      establishment: staff.establishment,
      isActive: staff.isActive,
      lastLoginAt: staff.lastLoginAt,
      createdAt: staff.createdAt
    };

    res.json({
      message: 'Login successful',
      user: staffResponse,
      tokens: {
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        message: 'Please provide a refresh token'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Find user
    const user = await User.findByPk(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'User not found or account disabled'
      });
    }

    // Generate new tokens
    const tokens = generateTokenPair(user.id);

    res.json({
      message: 'Token refreshed successfully',
      tokens
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Invalid refresh token',
      message: 'Please login again'
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = req.user;
    
    // Remove sensitive fields
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;
    delete userResponse.emailVerificationToken;
    delete userResponse.passwordResetToken;
    delete userResponse.passwordResetExpires;

    res.json({
      user: userResponse
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'An error occurred while fetching profile'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { firstName, lastName, phone, bio, favoritesSports, skillLevel, city } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found'
      });
    }

    // Update user fields
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    if (favoritesSports !== undefined) updateData.favoritesSports = favoritesSports;
    if (skillLevel !== undefined) updateData.skillLevel = skillLevel;
    if (city !== undefined) updateData.city = city;

    await user.update(updateData);

    // Remove sensitive fields
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;
    delete userResponse.emailVerificationToken;
    delete userResponse.passwordResetToken;
    delete userResponse.passwordResetExpires;

    res.json({
      message: 'Profile updated successfully',
      user: userResponse
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: 'An error occurred while updating profile'
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found'
      });
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid password',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await user.update({ password: hashedNewPassword });

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      message: 'An error occurred while changing password'
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Don't reveal if email exists or not
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await user.update({
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires
    });

    // TODO: Send email with reset link
    // const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    res.json({
      message: 'If an account with that email exists, a password reset link has been sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: 'Failed to process request',
      message: 'An error occurred while processing your request'
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const user = await User.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          [Op.gt]: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired token',
        message: 'Password reset token is invalid or has expired'
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password and clear reset token
    await user.update({
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null
    });

    res.json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      error: 'Failed to reset password',
      message: 'An error occurred while resetting password'
    });
  }
};

// Google OAuth login
const googleLogin = async (req, res) => {
  try {
    const { credential, accessToken, userInfo } = req.body;
    
    let email, given_name, family_name, picture, googleId;
    
    // Handle access token flow (from useGoogleLogin hook)
    if (accessToken && userInfo) {
      // Verify the access token by checking user info
      try {
        const verifyResponse = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`);
        if (!verifyResponse.ok) {
          return res.status(401).json({
            error: 'Invalid token',
            message: 'Google access token verification failed'
          });
        }
        
        // Use the userInfo provided by the frontend
        email = userInfo.email;
        given_name = userInfo.given_name;
        family_name = userInfo.family_name;
        picture = userInfo.picture;
        googleId = userInfo.sub;
      } catch (verifyError) {
        console.error('Access token verification failed:', verifyError);
        return res.status(401).json({
          error: 'Invalid token',
          message: 'Google token verification failed'
        });
      }
    } 
    // Handle credential flow (from GoogleLogin button with id_token)
    else if (credential) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      
      if (!clientId) {
        console.error('GOOGLE_CLIENT_ID not configured');
        return res.status(500).json({
          error: 'Configuration error',
          message: 'Google OAuth is not configured'
        });
      }

      const client = new OAuth2Client(clientId);
      
      let ticket;
      try {
        ticket = await client.verifyIdToken({
          idToken: credential,
          audience: clientId
        });
      } catch (verifyError) {
        console.error('Token verification failed:', verifyError);
        return res.status(401).json({
          error: 'Invalid token',
          message: 'Google token verification failed'
        });
      }

      const payload = ticket.getPayload();
      email = payload.email;
      given_name = payload.given_name;
      family_name = payload.family_name;
      picture = payload.picture;
      googleId = payload.sub;
    } else {
      return res.status(400).json({
        error: 'Missing credential',
        message: 'Google credential or access token is required'
      });
    }

    if (!email) {
      return res.status(400).json({
        error: 'Email required',
        message: 'Google account must have an email'
      });
    }

    // Check if user exists
    let user = await User.findOne({ where: { email } });

    if (user) {
      // User exists - update Google ID if not set
      if (!user.googleId) {
        await user.update({ 
          googleId,
          avatar: user.avatar || picture
        });
      }
      
      // Check if account is active
      if (!user.isActive) {
        return res.status(401).json({
          error: 'Account disabled',
          message: 'Your account has been disabled'
        });
      }
    } else {
      // Create new user
      user = await User.create({
        email,
        firstName: given_name || 'Usuario',
        lastName: family_name || '',
        googleId,
        avatar: picture,
        userType: 'player',
        isEmailVerified: true, // Google emails are verified
        isActive: true
      });
    }

    // Generate tokens
    const tokens = generateTokenPair(user.id);

    // Remove sensitive data from response
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;
    delete userResponse.emailVerificationToken;
    delete userResponse.passwordResetToken;

    res.json({
      message: 'Login successful',
      user: userResponse,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });

  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during Google login'
    });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  googleLogin
};
