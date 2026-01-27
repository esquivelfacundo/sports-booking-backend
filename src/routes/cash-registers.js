const express = require('express');
const router = express.Router();
const { CashRegister, CashRegisterMovement, Establishment, User } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

// Get active cash register for user
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    // Allow access for: owner, superadmin, or staff of this establishment
    const isOwner = establishment.userId === req.user.id;
    const isSuperadmin = req.user.userType === 'superadmin';
    const isStaffOfEstablishment = req.user.isStaff && req.user.establishmentId === establishmentId;
    
    if (!isOwner && !isSuperadmin && !isStaffOfEstablishment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Determine if user is staff or owner
    const isStaffUser = req.user.isStaff === true;
    
    // Build where clause based on user type
    const whereClause = {
      establishmentId,
      status: 'open'
    };
    
    if (isStaffUser) {
      whereClause.staffId = req.user.id;
    } else {
      whereClause.userId = req.user.id;
    }

    const cashRegister = await CashRegister.findOne({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        }
      ]
    });

    if (cashRegister) {
      const crJson = cashRegister.toJSON();
      if (crJson.user) {
        crJson.user.name = `${crJson.user.firstName} ${crJson.user.lastName}`.trim();
      }
      // For staff users, add staff info
      if (isStaffUser && !crJson.user) {
        crJson.staffName = req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
      }
      return res.json({ cashRegister: crJson });
    }

    res.json({ cashRegister: null });
  } catch (error) {
    console.error('Error fetching active cash register:', error);
    res.status(500).json({ error: 'Failed to fetch active cash register' });
  }
});

// Get cash register history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, userId, startDate, endDate, page = 1, limit = 50 } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    // Allow access for: owner, superadmin, or staff of this establishment
    const isOwner = establishment.userId === req.user.id;
    const isSuperadmin = req.user.userType === 'superadmin';
    const isStaffOfEstablishment = req.user.isStaff && req.user.establishmentId === establishmentId;
    
    if (!isOwner && !isSuperadmin && !isStaffOfEstablishment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId };

    // Filter by user if specified
    if (userId) {
      where.userId = userId;
    }

    // Filter by date range
    if (startDate || endDate) {
      where.openedAt = {};
      if (startDate) {
        where.openedAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.openedAt[Op.lte] = new Date(endDate);
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: cashRegisters } = await CashRegister.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['openedAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    // Add computed user name
    const cashRegistersWithUserName = cashRegisters.map(cr => {
      const crJson = cr.toJSON();
      if (crJson.user) {
        crJson.user.name = `${crJson.user.firstName} ${crJson.user.lastName}`.trim();
      }
      return crJson;
    });

    res.json({
      cashRegisters: cashRegistersWithUserName,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching cash register history:', error);
    res.status(500).json({ error: 'Failed to fetch cash register history' });
  }
});

// Get single cash register with details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const cashRegister = await CashRegister.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    if (!cashRegister) {
      return res.status(404).json({ error: 'Cash register not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(cashRegister.establishmentId);
    
    // Allow access for: owner, superadmin, or staff of this establishment
    const isOwner = establishment.userId === req.user.id;
    const isSuperadmin = req.user.userType === 'superadmin';
    const isStaffOfEstablishment = req.user.isStaff && req.user.establishmentId === cashRegister.establishmentId;
    
    if (!isOwner && !isSuperadmin && !isStaffOfEstablishment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const crJson = cashRegister.toJSON();
    if (crJson.user) {
      crJson.user.name = `${crJson.user.firstName} ${crJson.user.lastName}`.trim();
    }

    res.json({ cashRegister: crJson });
  } catch (error) {
    console.error('Error fetching cash register:', error);
    res.status(500).json({ error: 'Failed to fetch cash register' });
  }
});

// Open cash register
router.post('/open', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { establishmentId, initialCash, openingNotes } = req.body;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Establishment not found' });
    }

    // Allow access for: owner, superadmin, or staff of this establishment
    const isOwner = establishment.userId === req.user.id;
    const isSuperadmin = req.user.userType === 'superadmin';
    const isStaffOfEstablishment = req.user.isStaff && req.user.establishmentId === establishmentId;
    
    if (!isOwner && !isSuperadmin && !isStaffOfEstablishment) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Determine if user is staff or owner
    const isStaffUser = req.user.isStaff === true;
    
    // Check if user already has an open cash register
    const whereClause = {
      establishmentId,
      status: 'open'
    };
    
    if (isStaffUser) {
      whereClause.staffId = req.user.id;
    } else {
      whereClause.userId = req.user.id;
    }
    
    const existingCashRegister = await CashRegister.findOne({
      where: whereClause
    });

    if (existingCashRegister) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Ya tienes una caja abierta' });
    }

    // Create cash register with appropriate user field
    const cashRegisterData = {
      establishmentId,
      status: 'open',
      initialCash: parseFloat(initialCash) || 0,
      expectedCash: parseFloat(initialCash) || 0,
      openingNotes
    };
    
    if (isStaffUser) {
      cashRegisterData.staffId = req.user.id;
    } else {
      cashRegisterData.userId = req.user.id;
    }
    
    const cashRegister = await CashRegister.create(cashRegisterData, { transaction });

    // Create initial cash movement if there's initial cash
    if (parseFloat(initialCash) > 0) {
      await CashRegisterMovement.create({
        cashRegisterId: cashRegister.id,
        establishmentId,
        type: 'initial_cash',
        amount: parseFloat(initialCash),
        paymentMethod: 'cash',
        description: 'Efectivo inicial',
        registeredBy: req.user.id,
        registeredAt: new Date()
      }, { transaction });

      await cashRegister.update({
        totalMovements: 1
      }, { transaction });
    }

    await transaction.commit();

    // Fetch with user info
    const cashRegisterWithUser = await CashRegister.findByPk(cashRegister.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    const crJson = cashRegisterWithUser.toJSON();
    if (crJson.user) {
      crJson.user.name = `${crJson.user.firstName} ${crJson.user.lastName}`.trim();
    }

    res.status(201).json({ cashRegister: crJson });
  } catch (error) {
    await transaction.rollback();
    console.error('Error opening cash register:', error);
    res.status(500).json({ error: 'Failed to open cash register' });
  }
});

// Close cash register
router.post('/:id/close', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { actualCash, closingNotes } = req.body;

    const cashRegister = await CashRegister.findByPk(id);
    if (!cashRegister) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Cash register not found' });
    }

    // Verify access - only the user who opened can close (or superadmin)
    const isStaffUser = req.user.isStaff === true;
    const canClose = req.user.userType === 'superadmin' || 
      (isStaffUser && cashRegister.staffId === req.user.id) ||
      (!isStaffUser && cashRegister.userId === req.user.id);
    
    if (!canClose) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Solo el usuario que abrió la caja puede cerrarla' });
    }

    if (cashRegister.status === 'closed') {
      await transaction.rollback();
      return res.status(400).json({ error: 'La caja ya está cerrada' });
    }

    const actualCashAmount = parseFloat(actualCash) || 0;
    const cashDifference = actualCashAmount - parseFloat(cashRegister.expectedCash);

    await cashRegister.update({
      status: 'closed',
      closedAt: new Date(),
      actualCash: actualCashAmount,
      cashDifference,
      closingNotes
    }, { transaction });

    await transaction.commit();

    // Fetch with user info
    const cashRegisterWithUser = await CashRegister.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    const crJson = cashRegisterWithUser.toJSON();
    if (crJson.user) {
      crJson.user.name = `${crJson.user.firstName} ${crJson.user.lastName}`.trim();
    }

    res.json({ cashRegister: crJson });
  } catch (error) {
    await transaction.rollback();
    console.error('Error closing cash register:', error);
    res.status(500).json({ error: 'Failed to close cash register' });
  }
});

// Export cash registers to CSV
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, startDate, endDate, userId, status } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'Establishment ID is required' });
    }

    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId };

    if (startDate && endDate) {
      where.openedAt = { [Op.between]: [new Date(startDate), new Date(endDate + 'T23:59:59')] };
    } else if (startDate) {
      where.openedAt = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      where.openedAt = { [Op.lte]: new Date(endDate + 'T23:59:59') };
    }

    if (userId) {
      where.userId = userId;
    }

    if (status === 'open') {
      where.closedAt = null;
    } else if (status === 'closed') {
      where.closedAt = { [Op.ne]: null };
    }

    const cashRegisters = await CashRegister.findAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['firstName', 'lastName', 'email']
        }
      ],
      order: [['openedAt', 'DESC']]
    });

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(cashRegisters);

    const csvData = cashRegisters.map(cr => ({
      fechaApertura: csvUtils.formatDateTimeForCSV(cr.openedAt),
      fechaCierre: cr.closedAt ? csvUtils.formatDateTimeForCSV(cr.closedAt) : 'Abierta',
      usuario: cr.user ? `${cr.user.firstName} ${cr.user.lastName}`.trim() : 'N/A',
      montoInicial: csvUtils.formatNumberForCSV(cr.initialAmount),
      efectivoEsperado: csvUtils.formatNumberForCSV(cr.expectedCash),
      efectivoReal: cr.actualCash ? csvUtils.formatNumberForCSV(cr.actualCash) : '-',
      tarjeta: csvUtils.formatNumberForCSV(cr.totalCard),
      transferencia: csvUtils.formatNumberForCSV(cr.totalTransfer),
      mercadoPago: csvUtils.formatNumberForCSV(cr.totalMercadoPago),
      totalVentas: csvUtils.formatNumberForCSV(cr.totalSales),
      totalGastos: csvUtils.formatNumberForCSV(cr.totalExpenses),
      diferencia: cr.cashDifference ? csvUtils.formatNumberForCSV(cr.cashDifference) : '-',
      estado: cr.closedAt ? 'Cerrada' : 'Abierta',
      observaciones: cr.closingNotes || ''
    }));

    const fields = [
      { label: 'Fecha Apertura', value: 'fechaApertura' },
      { label: 'Fecha Cierre', value: 'fechaCierre' },
      { label: 'Usuario', value: 'usuario' },
      { label: 'Monto Inicial', value: 'montoInicial' },
      { label: 'Efectivo Esperado', value: 'efectivoEsperado' },
      { label: 'Efectivo Real', value: 'efectivoReal' },
      { label: 'Tarjeta', value: 'tarjeta' },
      { label: 'Transferencia', value: 'transferencia' },
      { label: 'MercadoPago', value: 'mercadoPago' },
      { label: 'Total Ventas', value: 'totalVentas' },
      { label: 'Total Gastos', value: 'totalGastos' },
      { label: 'Diferencia', value: 'diferencia' },
      { label: 'Estado', value: 'estado' },
      { label: 'Observaciones', value: 'observaciones' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `turnos_caja_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting cash registers:', error);
    res.status(500).json({ error: 'Failed to export cash registers', message: error.message });
  }
});

module.exports = router;
