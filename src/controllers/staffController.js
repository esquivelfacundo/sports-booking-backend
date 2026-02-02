const { User, Establishment } = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

// All configurable sections
const ALL_SECTIONS = [
  'reservas', 'canchas', 'clientes', 'resenas', 'marketing', 'cupones',
  'ventas', 'gastos', 'stock', 'cuentas', 'analytics', 'finanzas',
  'integraciones', 'caja', 'configuracion'
];

// Always visible sections (not configurable)
const ALWAYS_VISIBLE = ['dashboard', 'perfil'];

/**
 * Get all staff members for an establishment
 */
const getStaff = async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const staff = await User.findAll({
      where: { 
        establishmentId,
        staffRole: { [Op.ne]: null }
      },
      attributes: { exclude: ['password', 'passwordResetToken', 'passwordResetExpires', 'emailVerificationToken'] },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      staff: staff.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        email: s.email,
        phone: s.phone,
        role: s.staffRole,
        allowedSections: s.allowedSections || ALL_SECTIONS,
        isActive: s.isActive,
        pin: s.pin ? '****' : null,
        hasPin: !!s.pin,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    });
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ error: 'Failed to get staff', message: error.message });
  }
};

/**
 * Create a new staff member
 */
const createStaff = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { name, email, phone, password, role = 'employee', allowedSections } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Nombre, email y contraseña son requeridos'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        error: 'Email already exists',
        message: 'Ya existe un usuario con este email'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const nameParts = name.split(' ');
    const staffRole = role === 'admin' ? 'admin' : 'employee';

    const user = await User.create({
      email,
      password: hashedPassword,
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' ') || '',
      phone,
      userType: 'establishment',
      establishmentId,
      staffRole,
      allowedSections: allowedSections || ALL_SECTIONS,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      staff: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        phone: user.phone,
        role: user.staffRole,
        allowedSections: user.allowedSections,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ error: 'Failed to create staff', message: error.message });
  }
};

/**
 * Update a staff member
 */
const updateStaff = async (req, res) => {
  try {
    const { establishmentId, staffId } = req.params;
    const { name, email, phone, password, role, allowedSections, isActive } = req.body;

    const staff = await User.findOne({
      where: { id: staffId, establishmentId, staffRole: { [Op.ne]: null } }
    });

    if (!staff) {
      return res.status(404).json({ error: 'Staff not found', message: 'Usuario no encontrado' });
    }

    if (email && email !== staff.email) {
      const existingUser = await User.findOne({
        where: { email, id: { [Op.ne]: staffId } }
      });
      if (existingUser) {
        return res.status(409).json({ error: 'Email already exists', message: 'Ya existe un usuario con este email' });
      }
    }

    const updates = {};
    if (name !== undefined) {
      const nameParts = name.split(' ');
      updates.firstName = nameParts[0];
      updates.lastName = nameParts.slice(1).join(' ') || '';
    }
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (role !== undefined) updates.staffRole = role === 'admin' ? 'admin' : 'employee';
    if (allowedSections !== undefined) updates.allowedSections = allowedSections;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.password = await bcrypt.hash(password, 10);

    await staff.update(updates);

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      staff: {
        id: staff.id,
        name: `${staff.firstName} ${staff.lastName}`.trim(),
        email: staff.email,
        phone: staff.phone,
        role: staff.staffRole,
        allowedSections: staff.allowedSections,
        isActive: staff.isActive
      }
    });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ error: 'Failed to update staff', message: error.message });
  }
};

/**
 * Delete a staff member
 */
const deleteStaff = async (req, res) => {
  try {
    const { establishmentId, staffId } = req.params;

    const staff = await User.findOne({
      where: { id: staffId, establishmentId, staffRole: { [Op.ne]: null } }
    });

    if (!staff) {
      return res.status(404).json({ error: 'Staff not found', message: 'Usuario no encontrado' });
    }

    await staff.destroy();
    res.json({ success: true, message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ error: 'Failed to delete staff', message: error.message });
  }
};

/**
 * Staff login
 */
const staffLogin = async (req, res) => {
  try {
    const { email, password, establishmentId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing credentials', message: 'Email y contraseña son requeridos' });
    }

    const whereClause = { 
      email, 
      isActive: true,
      staffRole: { [Op.ne]: null }
    };
    if (establishmentId) whereClause.establishmentId = establishmentId;

    const user = await User.findOne({
      where: whereClause,
      include: [{
        model: Establishment,
        as: 'staffEstablishment',
        attributes: ['id', 'name', 'slug']
      }]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials', message: 'Email o contraseña incorrectos' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials', message: 'Email o contraseña incorrectos' });
    }

    await user.update({ lastLoginAt: new Date() });

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login exitoso',
      token,
      staff: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        phone: user.phone,
        role: user.staffRole,
        allowedSections: user.allowedSections || ALL_SECTIONS,
        isActive: user.isActive,
        establishmentId: user.establishmentId,
        establishment: user.staffEstablishment
      }
    });
  } catch (error) {
    console.error('Staff login error:', error);
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
};

/**
 * Get available sections
 */
const getAvailableSections = async (req, res) => {
  res.json({
    success: true,
    sections: ALL_SECTIONS,
    alwaysVisible: ALWAYS_VISIBLE
  });
};

/**
 * Validate user PIN
 */
const validatePin = async (req, res) => {
  try {
    const { pin } = req.body;
    const userId = req.user.id;

    if (!pin || !/^[0-9]{4}$/.test(pin)) {
      return res.status(400).json({ success: false, error: 'Invalid PIN format', message: 'El PIN debe ser de 4 dígitos' });
    }

    // Check if user is staff (has establishmentId and staffRole)
    const isStaff = req.user.establishmentId && req.user.staffRole;
    let userPin;

    if (isStaff) {
      const user = await User.findByPk(userId);
      userPin = user?.pin;
    } else {
      // For owners, PIN is stored in Establishment
      const establishment = await Establishment.findOne({ where: { userId } });
      userPin = establishment?.pin;
    }

    if (!userPin) {
      return res.status(400).json({ success: false, error: 'PIN not set', message: 'No tienes un PIN configurado.' });
    }

    if (userPin !== pin) {
      return res.status(401).json({ success: false, error: 'Invalid PIN', message: 'PIN incorrecto' });
    }

    res.json({ success: true, message: 'PIN válido' });
  } catch (error) {
    console.error('Validate PIN error:', error);
    res.status(500).json({ success: false, error: 'Failed to validate PIN', message: error.message });
  }
};

/**
 * Get current user profile
 */
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const isStaff = req.user.establishmentId && req.user.staffRole;

    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password', 'passwordResetToken', 'passwordResetExpires', 'emailVerificationToken'] }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (isStaff) {
      const establishment = await Establishment.findByPk(user.establishmentId, {
        attributes: ['id', 'name', 'logo', 'slug']
      });

      return res.json({
        success: true,
        userType: 'staff',
        profile: {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
          phone: user.phone,
          role: user.staffRole,
          allowedSections: user.allowedSections || ALL_SECTIONS,
          pin: user.pin ? '****' : null,
          hasPin: !!user.pin,
          establishment
        }
      });
    }

    // Owner
    const establishment = await Establishment.findOne({
      where: { userId },
      attributes: ['id', 'name', 'logo', 'slug', 'pin']
    });

    return res.json({
      success: true,
      userType: 'owner',
      profile: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        pin: establishment?.pin ? '****' : null,
        hasPin: !!establishment?.pin,
        establishment: establishment ? {
          id: establishment.id,
          name: establishment.name,
          logo: establishment.logo,
          slug: establishment.slug
        } : null
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to get profile', message: error.message });
  }
};

/**
 * Update current user profile
 */
const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const isStaff = req.user.establishmentId && req.user.staffRole;
    const { name, firstName, lastName, email, phone, currentPassword, newPassword, pin, currentPin } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const updates = {};

    // Update name
    if (name) {
      const nameParts = name.split(' ');
      updates.firstName = nameParts[0];
      updates.lastName = nameParts.slice(1).join(' ') || '';
    } else {
      if (firstName) updates.firstName = firstName;
      if (lastName) updates.lastName = lastName;
    }
    if (phone !== undefined) updates.phone = phone;

    // Update email
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email, id: { [Op.ne]: userId } } });
      if (existingUser) {
        return res.status(400).json({ success: false, error: 'Email already in use', message: 'Este email ya está en uso' });
      }
      updates.email = email;
    }

    // Update password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, error: 'Current password required', message: 'Debes ingresar tu contraseña actual' });
      }
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ success: false, error: 'Invalid current password', message: 'La contraseña actual es incorrecta' });
      }
      updates.password = await bcrypt.hash(newPassword, 10);
    }

    // Update PIN
    if (pin !== undefined) {
      if (isStaff) {
        // Staff PIN stored in user
        if (pin === null || pin === '') {
          updates.pin = null;
        } else if (/^[0-9]{4}$/.test(pin)) {
          if (user.pin && currentPin !== user.pin) {
            return res.status(401).json({ success: false, error: 'Invalid current PIN', message: 'El PIN actual es incorrecto' });
          }
          updates.pin = pin;
        } else {
          return res.status(400).json({ success: false, error: 'Invalid PIN format', message: 'El PIN debe ser de 4 dígitos' });
        }
      } else {
        // Owner PIN stored in establishment
        const establishment = await Establishment.findOne({ where: { userId } });
        if (establishment) {
          if (pin === null || pin === '') {
            await establishment.update({ pin: null });
          } else if (/^[0-9]{4}$/.test(pin)) {
            if (establishment.pin && currentPin !== establishment.pin) {
              return res.status(401).json({ success: false, error: 'Invalid current PIN', message: 'El PIN actual es incorrecto' });
            }
            await establishment.update({ pin });
          } else {
            return res.status(400).json({ success: false, error: 'Invalid PIN format', message: 'El PIN debe ser de 4 dígitos' });
          }
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await user.update(updates);
    }

    res.json({ success: true, message: 'Perfil actualizado correctamente' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile', message: error.message });
  }
};

module.exports = {
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  staffLogin,
  getAvailableSections,
  getDefaultPermissions: getAvailableSections,
  validatePin,
  getMyProfile,
  updateMyProfile,
  ALL_SECTIONS,
  ALWAYS_VISIBLE
};
