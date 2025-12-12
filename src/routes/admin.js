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
  deleteEstablishmentAdmin,
  getAllUsers,
  suspendUser,
  activateUser,
  deleteUserAdmin,
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
router.delete('/establishments/:id', authenticateToken, requireRole(['admin', 'superadmin']), deleteEstablishmentAdmin);

// Users management
router.get('/users', authenticateToken, requireRole(['admin', 'superadmin']), getAllUsers);
router.put('/users/:id/suspend', authenticateToken, requireRole(['admin', 'superadmin']), suspendUser);
router.put('/users/:id/activate', authenticateToken, requireRole(['admin', 'superadmin']), activateUser);
router.delete('/users/:id', authenticateToken, requireRole(['admin', 'superadmin']), deleteUserAdmin);

// Platform statistics
router.get('/stats', authenticateToken, requireRole(['admin', 'superadmin']), getPlatformStats);

module.exports = router;
