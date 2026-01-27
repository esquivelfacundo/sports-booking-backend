const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const {
  searchClients,
  getClients,
  createClient,
  updateClient,
  deleteClient
} = require('../controllers/clientController');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Please check your input data',
      details: errors.array()
    });
  }
  next();
};

// Create client validation
const createClientValidation = [
  body('name')
    .notEmpty()
    .withMessage('Client name is required')
    .isLength({ max: 100 })
    .withMessage('Name must not exceed 100 characters'),
  body('phone')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Phone must not exceed 20 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
];

// Routes
router.get(
  '/establishment/:establishmentId/search',
  authenticateToken,
  searchClients
);

router.get(
  '/establishment/:establishmentId',
  authenticateToken,
  getClients
);

router.post(
  '/establishment/:establishmentId',
  authenticateToken,
  createClientValidation,
  handleValidationErrors,
  createClient
);

router.put(
  '/establishment/:establishmentId/:clientId',
  authenticateToken,
  updateClient
);

router.delete(
  '/establishment/:establishmentId/:clientId',
  authenticateToken,
  deleteClient
);

// Export clients to CSV
const { Client, Establishment } = require('../models');
router.get(
  '/establishment/:establishmentId/export',
  authenticateToken,
  async (req, res) => {
    try {
      const { establishmentId } = req.params;
      const { hasDebt, isActive } = req.query;

      const establishment = await Establishment.findByPk(establishmentId);
      if (!establishment) {
        return res.status(404).json({ error: 'Establishment not found' });
      }

      if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const where = { establishmentId };

      if (hasDebt !== undefined) {
        where.hasDebt = hasDebt === 'true';
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const clients = await Client.findAll({
        where,
        order: [['name', 'ASC']]
      });

      const csvUtils = require('../utils/csvGenerator');
      csvUtils.validateDataSize(clients);

      const csvData = clients.map(client => ({
        nombre: client.name,
        telefono: client.phone || '-',
        email: client.email || '-',
        reservasTotales: client.totalBookings || 0,
        reservasCompletadas: client.completedBookings || 0,
        reservasCanceladas: client.cancelledBookings || 0,
        noShow: client.noShowBookings || 0,
        totalGastado: csvUtils.formatNumberForCSV(client.totalSpent),
        deuda: csvUtils.formatNumberForCSV(client.debtAmount),
        ultimaReserva: client.lastBookingDate ? csvUtils.formatDateForCSV(client.lastBookingDate) : '-',
        estado: client.isActive ? 'Activo' : 'Inactivo',
        notas: client.notes || ''
      }));

      const fields = [
        { label: 'Nombre', value: 'nombre' },
        { label: 'Teléfono', value: 'telefono' },
        { label: 'Email', value: 'email' },
        { label: 'Reservas Totales', value: 'reservasTotales' },
        { label: 'Reservas Completadas', value: 'reservasCompletadas' },
        { label: 'Reservas Canceladas', value: 'reservasCanceladas' },
        { label: 'No Show', value: 'noShow' },
        { label: 'Total Gastado', value: 'totalGastado' },
        { label: 'Deuda', value: 'deuda' },
        { label: 'Última Reserva', value: 'ultimaReserva' },
        { label: 'Estado', value: 'estado' },
        { label: 'Notas', value: 'notas' }
      ];

      const csv = csvUtils.generateCSV(csvData, fields);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `clientes_${establishment.slug || establishmentId}_${dateStr}.csv`;

      csvUtils.sendCSVResponse(res, csv, filename);
    } catch (error) {
      console.error('Error exporting clients:', error);
      res.status(500).json({ error: 'Failed to export clients', message: error.message });
    }
  }
);

module.exports = router;
