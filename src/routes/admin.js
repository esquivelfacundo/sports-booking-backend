const express = require('express');
const { initializeDatabase } = require('../scripts/initDatabase');
const { simpleInit } = require('../scripts/simpleInit');
const { robustInit } = require('../scripts/robustInit');
const { cleanInit } = require('../scripts/cleanInit');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getAllEstablishments,
  approveEstablishment,
  rejectEstablishment,
  updateEstablishmentStatus,
  updateEstablishmentAdmin,
  deleteEstablishmentAdmin,
  getAllUsers,
  getAllPlayersAndClients,
  suspendUser,
  activateUser,
  deleteUserAdmin,
  deleteClientAdmin,
  getPlatformStats
} = require('../controllers/adminController');

const router = express.Router();

// Endpoint para inicializar la base de datos
router.post('/init-database', async (req, res) => {
  try {
    // Verificar que sea un request autorizado (opcional: agregar autenticación)
    const authKey = req.headers['x-admin-key'] || req.query.key;
    
    // Por seguridad, solo permitir en desarrollo o con clave específica
    if (process.env.NODE_ENV === 'production' && authKey !== process.env.ADMIN_INIT_KEY) {
      return res.status(403).json({ 
        error: 'Unauthorized',
        message: 'Admin key required for database initialization' 
      });
    }

    console.log('🔄 Iniciando inicialización de base de datos...');
    const result = await cleanInit();
    
    res.json({ 
      success: true,
      message: 'Database initialized successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    res.status(500).json({ 
      error: 'Database initialization failed',
      message: error.message 
    });
  }
});

// Endpoint para verificar el estado de la base de datos
router.get('/database-status', async (req, res) => {
  try {
    const { User, Establishment, Court } = require('../models');
    
    const stats = {
      users: await User.count(),
      establishments: await Establishment.count(),
      courts: await Court.count(),
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      stats,
      initialized: stats.users > 0 || stats.establishments > 0
    });
  } catch (error) {
    console.error('❌ Error verificando estado de base de datos:', error);
    res.status(500).json({ 
      error: 'Database status check failed',
      message: error.message 
    });
  }
});

// ==================== PROTECTED ADMIN ROUTES ====================
// All routes below require authentication and admin role

// Establishments management
router.get('/establishments', authenticateToken, requireRole(['admin', 'superadmin']), getAllEstablishments);
router.put('/establishments/:id/approve', authenticateToken, requireRole(['admin', 'superadmin']), approveEstablishment);
router.put('/establishments/:id/reject', authenticateToken, requireRole(['admin', 'superadmin']), rejectEstablishment);
router.put('/establishments/:id/status', authenticateToken, requireRole(['admin', 'superadmin']), updateEstablishmentStatus);
router.put('/establishments/:id', authenticateToken, requireRole(['admin', 'superadmin']), updateEstablishmentAdmin);
router.delete('/establishments/:id', authenticateToken, requireRole(['admin', 'superadmin']), deleteEstablishmentAdmin);

// Update establishment custom fee
router.put('/establishments/:id/fee', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { customFeePercent } = req.body;
    
    const { Establishment } = require('../models');
    const establishment = await Establishment.findByPk(id);
    
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    
    // null means use platform default, otherwise set custom fee
    // Handle 0 correctly - only treat as null if explicitly null or empty string
    const feeValue = customFeePercent === null || customFeePercent === '' || customFeePercent === undefined 
      ? null 
      : parseFloat(customFeePercent);
    
    if (feeValue !== null && (isNaN(feeValue) || feeValue < 0 || feeValue > 100)) {
      return res.status(400).json({ error: 'Invalid fee percentage (must be 0-100 or null)' });
    }
    
    await establishment.update({ customFeePercent: feeValue });
    
    console.log(`[Admin] Updated fee for ${establishment.name}: ${feeValue === null ? 'default' : feeValue + '%'}`);
    
    res.json({
      success: true,
      establishment: {
        id: establishment.id,
        name: establishment.name,
        customFeePercent: establishment.customFeePercent
      }
    });
  } catch (err) {
    console.error('Error updating establishment fee:', err);
    res.status(500).json({ error: 'Error updating fee' });
  }
});

// Update establishment credentials (email and password)
router.put('/establishments/:id/credentials', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { accessEmail, accessPassword } = req.body;
    
    const { Establishment, User } = require('../models');
    const bcrypt = require('bcryptjs');
    
    const establishment = await Establishment.findByPk(id);
    
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    
    // Get the user associated with this establishment
    const user = await User.findByPk(establishment.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found for this establishment' });
    }
    
    // Update email if provided
    if (accessEmail && accessEmail !== user.email) {
      // Check if new email is already in use
      const existingUser = await User.findOne({ where: { email: accessEmail } });
      if (existingUser && existingUser.id !== user.id) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      user.email = accessEmail;
    }
    
    // Update password if provided
    if (accessPassword) {
      const hashedPassword = await bcrypt.hash(accessPassword, 10);
      user.password = hashedPassword;
    }
    
    await user.save();
    
    console.log(`[Admin] Updated credentials for establishment ${establishment.name}`);
    
    res.json({
      success: true,
      message: 'Credentials updated successfully'
    });
  } catch (err) {
    console.error('Error updating establishment credentials:', err);
    res.status(500).json({ error: 'Error updating credentials' });
  }
});

// Users management
router.get('/users', authenticateToken, requireRole(['admin', 'superadmin']), getAllUsers);
router.get('/players-clients', authenticateToken, requireRole(['admin', 'superadmin']), getAllPlayersAndClients);
router.put('/users/:id/suspend', authenticateToken, requireRole(['admin', 'superadmin']), suspendUser);
router.put('/users/:id/activate', authenticateToken, requireRole(['admin', 'superadmin']), activateUser);
router.delete('/users/:id', authenticateToken, requireRole(['admin', 'superadmin']), deleteUserAdmin);
router.delete('/clients/:id', authenticateToken, requireRole(['admin', 'superadmin']), deleteClientAdmin);

// Platform statistics
router.get('/stats', authenticateToken, requireRole(['admin', 'superadmin']), getPlatformStats);

module.exports = router;
