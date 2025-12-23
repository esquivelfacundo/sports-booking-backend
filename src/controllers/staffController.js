const { EstablishmentStaff, Establishment, User } = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

// Default permissions by role
const DEFAULT_PERMISSIONS = {
  admin: {
    bookings: { view: true, create: true, edit: true, delete: true },
    finance: { view: true, create: true, edit: true },
    analytics: { view: true },
    clients: { view: true, create: true, edit: true, delete: true },
    courts: { view: true, create: true, edit: true, delete: true },
    staff: { view: true, create: true, edit: true, delete: true },
    settings: { view: true, edit: true }
  },
  manager: {
    bookings: { view: true, create: true, edit: true, delete: true },
    finance: { view: true, create: false, edit: false },
    analytics: { view: true },
    clients: { view: true, create: true, edit: true, delete: false },
    courts: { view: true, create: false, edit: false, delete: false },
    staff: { view: true, create: false, edit: false, delete: false },
    settings: { view: true, edit: false }
  },
  receptionist: {
    bookings: { view: true, create: true, edit: true, delete: false },
    finance: { view: false, create: false, edit: false },
    analytics: { view: false },
    clients: { view: true, create: true, edit: true, delete: false },
    courts: { view: true, create: false, edit: false, delete: false },
    staff: { view: false, create: false, edit: false, delete: false },
    settings: { view: false, edit: false }
  },
  staff: {
    bookings: { view: true, create: false, edit: false, delete: false },
    finance: { view: false, create: false, edit: false },
    analytics: { view: false },
    clients: { view: true, create: false, edit: false, delete: false },
    courts: { view: true, create: false, edit: false, delete: false },
    staff: { view: false, create: false, edit: false, delete: false },
    settings: { view: false, edit: false }
  }
};

/**
 * Get all staff members for an establishment
 */
const getStaff = async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const staff = await EstablishmentStaff.findAll({
      where: { establishmentId },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      staff
    });
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({
      error: 'Failed to get staff',
      message: error.message
    });
  }
};

/**
 * Create a new staff member
 */
const createStaff = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { name, email, phone, password, role = 'staff', permissions } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Nombre, email y contraseña son requeridos'
      });
    }

    // Check if email already exists for this establishment
    const existingStaff = await EstablishmentStaff.findOne({
      where: { establishmentId, email }
    });

    if (existingStaff) {
      return res.status(409).json({
        error: 'Email already exists',
        message: 'Ya existe un usuario con este email en el establecimiento'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Use default permissions for role if not provided
    const staffPermissions = permissions || DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.staff;

    const staff = await EstablishmentStaff.create({
      establishmentId,
      name,
      email,
      phone,
      password: hashedPassword,
      role,
      permissions: staffPermissions,
      isActive: true
    });

    // Return without password
    const staffData = staff.toJSON();
    delete staffData.password;

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      staff: staffData
    });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({
      error: 'Failed to create staff',
      message: error.message
    });
  }
};

/**
 * Update a staff member
 */
const updateStaff = async (req, res) => {
  try {
    const { establishmentId, staffId } = req.params;
    const { name, email, phone, password, role, permissions, isActive } = req.body;

    const staff = await EstablishmentStaff.findOne({
      where: { id: staffId, establishmentId }
    });

    if (!staff) {
      return res.status(404).json({
        error: 'Staff not found',
        message: 'Usuario no encontrado'
      });
    }

    // Check if email is being changed and already exists
    if (email && email !== staff.email) {
      const existingStaff = await EstablishmentStaff.findOne({
        where: { establishmentId, email, id: { [Op.ne]: staffId } }
      });

      if (existingStaff) {
        return res.status(409).json({
          error: 'Email already exists',
          message: 'Ya existe un usuario con este email'
        });
      }
    }

    // Prepare update data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) {
      updateData.role = role;
      // Update permissions if role changed and no custom permissions provided
      if (!permissions) {
        updateData.permissions = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.staff;
      }
    }
    if (permissions !== undefined) updateData.permissions = permissions;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Hash new password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await staff.update(updateData);

    // Return without password
    const staffData = staff.toJSON();
    delete staffData.password;

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      staff: staffData
    });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({
      error: 'Failed to update staff',
      message: error.message
    });
  }
};

/**
 * Delete a staff member
 */
const deleteStaff = async (req, res) => {
  try {
    const { establishmentId, staffId } = req.params;

    const staff = await EstablishmentStaff.findOne({
      where: { id: staffId, establishmentId }
    });

    if (!staff) {
      return res.status(404).json({
        error: 'Staff not found',
        message: 'Usuario no encontrado'
      });
    }

    await staff.destroy();

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({
      error: 'Failed to delete staff',
      message: error.message
    });
  }
};

/**
 * Staff login
 */
const staffLogin = async (req, res) => {
  try {
    const { email, password, establishmentId } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Email y contraseña son requeridos'
      });
    }

    // Find staff member
    const whereClause = { email, isActive: true };
    if (establishmentId) {
      whereClause.establishmentId = establishmentId;
    }

    const staff = await EstablishmentStaff.findOne({
      where: whereClause,
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: ['id', 'name', 'slug']
      }]
    });

    if (!staff) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email o contraseña incorrectos'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, staff.password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email o contraseña incorrectos'
      });
    }

    // Update last login
    await staff.update({ lastLoginAt: new Date() });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: staff.id,
        email: staff.email,
        establishmentId: staff.establishmentId,
        role: staff.role,
        userType: 'staff',
        permissions: staff.permissions
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Return staff data without password
    const staffData = staff.toJSON();
    delete staffData.password;

    res.json({
      success: true,
      message: 'Login exitoso',
      token,
      staff: staffData
    });
  } catch (error) {
    console.error('Staff login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
};

/**
 * Get default permissions for a role
 */
const getDefaultPermissions = async (req, res) => {
  try {
    res.json({
      success: true,
      permissions: DEFAULT_PERMISSIONS
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get permissions',
      message: error.message
    });
  }
};

/**
 * Validate user PIN (works for both User and EstablishmentStaff)
 */
const validatePin = async (req, res) => {
  try {
    const { pin } = req.body;
    const userId = req.user.id;
    const isStaff = req.user.isStaff === true;

    if (!pin || !/^[0-9]{4}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PIN format',
        message: 'El PIN debe ser de 4 dígitos'
      });
    }

    let userRecord;
    let userPin;

    if (isStaff) {
      userRecord = await EstablishmentStaff.findByPk(userId);
      userPin = userRecord?.pin;
    } else {
      userRecord = await User.findByPk(userId);
      userPin = userRecord?.pin;
    }
    
    if (!userRecord) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'Usuario no encontrado'
      });
    }

    if (!userPin) {
      return res.status(400).json({
        success: false,
        error: 'PIN not set',
        message: 'No tienes un PIN configurado. Configúralo en tu perfil.'
      });
    }

    if (userPin !== pin) {
      return res.status(401).json({
        success: false,
        error: 'Invalid PIN',
        message: 'PIN incorrecto'
      });
    }

    res.json({
      success: true,
      message: 'PIN válido'
    });
  } catch (error) {
    console.error('Validate PIN error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate PIN',
      message: error.message
    });
  }
};

/**
 * Get current user profile (works for both User and EstablishmentStaff)
 */
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const isStaff = req.user.isStaff === true;

    // If user is staff type, find in EstablishmentStaff
    if (isStaff) {
      const staff = await EstablishmentStaff.findByPk(userId, {
        attributes: { exclude: ['password'] },
        include: [{
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'logo', 'slug']
        }]
      });

      if (!staff) {
        return res.status(404).json({
          success: false,
          error: 'Staff not found'
        });
      }

      return res.json({
        success: true,
        userType: 'staff',
        profile: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          role: staff.role,
          pin: staff.pin ? '****' : null,
          hasPin: !!staff.pin,
          establishment: staff.establishment
        }
      });
    }

    // Otherwise, find in User table (establishment owner)
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password', 'passwordResetToken', 'passwordResetExpires', 'emailVerificationToken'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get the user's establishment
    const establishment = await Establishment.findOne({
      where: { userId },
      attributes: ['id', 'name', 'logo', 'slug']
    });

    return res.json({
      success: true,
      userType: 'owner',
      profile: {
        id: user.id,
        name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName || user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        pin: user.pin ? '****' : null,
        hasPin: !!user.pin,
        establishment
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile',
      message: error.message
    });
  }
};

/**
 * Update current user profile (works for both User and EstablishmentStaff)
 */
const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const isStaff = req.user.isStaff === true;
    const { name, firstName, lastName, email, phone, currentPassword, newPassword, pin } = req.body;

    // Handle staff users
    if (isStaff) {
      const staff = await EstablishmentStaff.findByPk(userId);

      if (!staff) {
        return res.status(404).json({
          success: false,
          error: 'Staff not found'
        });
      }

      const updates = {};

      // Update basic fields
      if (name) updates.name = name;
      if (phone !== undefined) updates.phone = phone;

      // Update email (check for duplicates)
      if (email && email !== staff.email) {
        const existingStaff = await EstablishmentStaff.findOne({
          where: {
            email,
            establishmentId: staff.establishmentId,
            id: { [Op.ne]: userId }
          }
        });

        if (existingStaff) {
          return res.status(400).json({
            success: false,
            error: 'Email already in use',
            message: 'Este email ya está en uso por otro usuario'
          });
        }
        updates.email = email;
      }

      // Update password
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({
            success: false,
            error: 'Current password required',
            message: 'Debes ingresar tu contraseña actual para cambiarla'
          });
        }

        const isValidPassword = await bcrypt.compare(currentPassword, staff.password);
        if (!isValidPassword) {
          return res.status(401).json({
            success: false,
            error: 'Invalid current password',
            message: 'La contraseña actual es incorrecta'
          });
        }

        updates.password = await bcrypt.hash(newPassword, 10);
      }

      // Update PIN - require current PIN if staff already has one
      if (pin !== undefined) {
        if (pin === null || pin === '') {
          updates.pin = null;
        } else if (/^[0-9]{4}$/.test(pin)) {
          // If staff already has a PIN, require currentPin to change it
          if (staff.pin && req.body.currentPin !== staff.pin) {
            return res.status(401).json({
              success: false,
              error: 'Invalid current PIN',
              message: 'El PIN actual es incorrecto'
            });
          }
          updates.pin = pin;
        } else {
          return res.status(400).json({
            success: false,
            error: 'Invalid PIN format',
            message: 'El PIN debe ser de 4 dígitos'
          });
        }
      }

      await staff.update(updates);

      return res.json({
        success: true,
        message: 'Perfil actualizado correctamente'
      });
    }

    // Handle regular users (establishment owners)
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updates = {};

    // Update basic fields - handle both name (combined) and firstName/lastName
    if (name) {
      const nameParts = name.split(' ');
      updates.firstName = nameParts[0];
      updates.lastName = nameParts.slice(1).join(' ') || '';
    } else {
      if (firstName) updates.firstName = firstName;
      if (lastName) updates.lastName = lastName;
    }
    if (phone !== undefined) updates.phone = phone;

    // Update email (check for duplicates)
    if (email && email !== user.email) {
      const existingUser = await User.findOne({
        where: {
          email,
          id: { [Op.ne]: userId }
        }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Email already in use',
          message: 'Este email ya está en uso por otro usuario'
        });
      }
      updates.email = email;
    }

    // Update password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current password required',
          message: 'Debes ingresar tu contraseña actual para cambiarla'
        });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid current password',
          message: 'La contraseña actual es incorrecta'
        });
      }

      updates.password = await bcrypt.hash(newPassword, 10);
    }

    // Update PIN - require current PIN if user already has one
    if (pin !== undefined) {
      if (pin === null || pin === '') {
        updates.pin = null;
      } else if (/^[0-9]{4}$/.test(pin)) {
        // If user already has a PIN, require currentPin to change it
        if (user.pin && req.body.currentPin !== user.pin) {
          return res.status(401).json({
            success: false,
            error: 'Invalid current PIN',
            message: 'El PIN actual es incorrecto'
          });
        }
        updates.pin = pin;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid PIN format',
          message: 'El PIN debe ser de 4 dígitos'
        });
      }
    }

    await user.update(updates);

    res.json({
      success: true,
      message: 'Perfil actualizado correctamente'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      message: error.message
    });
  }
};

module.exports = {
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  staffLogin,
  getDefaultPermissions,
  validatePin,
  getMyProfile,
  updateMyProfile,
  DEFAULT_PERMISSIONS
};
