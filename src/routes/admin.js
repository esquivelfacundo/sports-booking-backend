const express = require('express');
const { initializeDatabase } = require('../scripts/initDatabase');
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
    await initializeDatabase();
    
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

module.exports = router;
