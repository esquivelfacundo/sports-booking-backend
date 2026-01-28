const express = require('express');
const router = express.Router();
const { CurrentAccount, CurrentAccountMovement, Client, EstablishmentStaff, Establishment, Order, User } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');

// Get all current accounts for an establishment
router.get('/establishment/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { accountType, isActive, search } = req.query;

    const where = { establishmentId };
    
    if (accountType) {
      where.accountType = accountType;
    }
    
    // Default to showing only active accounts unless explicitly requesting inactive
    if (isActive === undefined || isActive === 'true') {
      where.isActive = true;
    } else if (isActive === 'false') {
      where.isActive = false;
    }

    if (search) {
      where[Op.or] = [
        { holderName: { [Op.iLike]: `%${search}%` } },
        { holderPhone: { [Op.iLike]: `%${search}%` } },
        { holderEmail: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const accounts = await CurrentAccount.findAll({
      where,
      include: [
        { model: Client, as: 'client' },
        { model: EstablishmentStaff, as: 'staff' }
      ],
      order: [['holderName', 'ASC']]
    });

    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('Error fetching current accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a single current account with movements
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { movementsLimit = 50 } = req.query;

    // First get the account
    const account = await CurrentAccount.findByPk(id, {
      include: [
        { model: Client, as: 'client' },
        { model: EstablishmentStaff, as: 'staff' }
      ]
    });

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Get movements separately to avoid issues with nested includes
    let movements = [];
    try {
      console.log(`[CurrentAccount] Fetching movements for account ${id}`);
      movements = await CurrentAccountMovement.findAll({
        where: { currentAccountId: id },
        limit: parseInt(movementsLimit),
        order: [['created_at', 'DESC']],
        include: [
          { model: Order, as: 'order', attributes: ['id', 'orderNumber'] },
          { model: User, as: 'registeredByUser', attributes: ['id', 'name', 'email'] }
        ]
      });
      console.log(`[CurrentAccount] Found ${movements.length} movements for account ${id}`);
    } catch (movementError) {
      console.error('Error fetching movements:', movementError);
      // Continue without movements if there's an error
    }

    const accountData = account.toJSON();
    accountData.movements = movements;

    res.json({ success: true, data: accountData });
  } catch (error) {
    console.error('Error fetching current account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new current account
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      establishmentId,
      clientId,
      staffId,
      holderName,
      holderPhone,
      holderEmail,
      accountType,
      useCostPrice,
      discountPercentage,
      creditLimit,
      notes
    } = req.body;

    // Check if account already exists for this client or staff
    if (clientId) {
      const existingAccount = await CurrentAccount.findOne({
        where: { establishmentId, clientId }
      });
      if (existingAccount) {
        return res.status(400).json({ 
          success: false, 
          error: 'Ya existe una cuenta corriente para este cliente' 
        });
      }
    }

    if (staffId) {
      const existingAccount = await CurrentAccount.findOne({
        where: { establishmentId, staffId }
      });
      if (existingAccount) {
        return res.status(400).json({ 
          success: false, 
          error: 'Ya existe una cuenta corriente para este empleado' 
        });
      }
    }

    const account = await CurrentAccount.create({
      establishmentId,
      clientId,
      staffId,
      holderName,
      holderPhone,
      holderEmail,
      accountType: accountType || (staffId ? 'employee' : 'client'),
      useCostPrice: useCostPrice || false,
      discountPercentage: discountPercentage || 0,
      creditLimit,
      notes
    });

    res.status(201).json({ success: true, data: account });
  } catch (error) {
    console.error('Error creating current account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a current account
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      holderName,
      holderPhone,
      holderEmail,
      accountType,
      useCostPrice,
      discountPercentage,
      creditLimit,
      isActive,
      notes
    } = req.body;

    const account = await CurrentAccount.findByPk(id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    await account.update({
      holderName: holderName !== undefined ? holderName : account.holderName,
      holderPhone: holderPhone !== undefined ? holderPhone : account.holderPhone,
      holderEmail: holderEmail !== undefined ? holderEmail : account.holderEmail,
      accountType: accountType !== undefined ? accountType : account.accountType,
      useCostPrice: useCostPrice !== undefined ? useCostPrice : account.useCostPrice,
      discountPercentage: discountPercentage !== undefined ? discountPercentage : account.discountPercentage,
      creditLimit: creditLimit !== undefined ? creditLimit : account.creditLimit,
      isActive: isActive !== undefined ? isActive : account.isActive,
      notes: notes !== undefined ? notes : account.notes
    });

    res.json({ success: true, data: account });
  } catch (error) {
    console.error('Error updating current account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a movement to a current account (purchase, payment, adjustment)
router.post('/:id/movements', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      movementType,
      amount,
      orderId,
      bookingId,
      paymentMethod,
      description
    } = req.body;

    const account = await CurrentAccount.findByPk(id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Calculate new balance
    let balanceChange = parseFloat(amount);
    if (movementType === 'payment' || movementType === 'refund') {
      balanceChange = -Math.abs(balanceChange); // Payments reduce balance
    } else {
      balanceChange = Math.abs(balanceChange); // Purchases increase balance
    }

    const newBalance = parseFloat(account.currentBalance) + balanceChange;

    // Create movement
    const movement = await CurrentAccountMovement.create({
      currentAccountId: id,
      establishmentId: account.establishmentId,
      movementType,
      amount: balanceChange,
      balanceAfter: newBalance,
      orderId,
      bookingId,
      paymentMethod,
      description,
      registeredBy: req.user.id
    });

    // Update account balance and totals
    const updateData = { currentBalance: newBalance };
    if (movementType === 'purchase') {
      updateData.totalPurchases = parseFloat(account.totalPurchases) + Math.abs(balanceChange);
    } else if (movementType === 'payment') {
      updateData.totalPayments = parseFloat(account.totalPayments) + Math.abs(balanceChange);
    }

    await account.update(updateData);

    res.status(201).json({ 
      success: true, 
      data: movement,
      newBalance 
    });
  } catch (error) {
    console.error('Error adding movement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get movements for a current account
router.get('/:id/movements', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0, startDate, endDate } = req.query;

    const where = { currentAccountId: id };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const movements = await CurrentAccountMovement.findAndCountAll({
      where,
      include: [
        { model: Order, as: 'order' },
        { model: User, as: 'registeredByUser', attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({ 
      success: true, 
      data: movements.rows,
      total: movements.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching movements:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a current account (soft delete by setting isActive to false)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const account = await CurrentAccount.findByPk(id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Check if account has balance
    if (parseFloat(account.currentBalance) !== 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar una cuenta con saldo pendiente' 
      });
    }

    await account.update({ isActive: false });

    res.json({ success: true, message: 'Account deactivated successfully' });
  } catch (error) {
    console.error('Error deleting current account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-create accounts for all staff members
router.post('/establishment/:establishmentId/auto-create-staff', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { useCostPrice = true, discountPercentage = 0 } = req.body;

    // Get all active staff for this establishment
    const staff = await EstablishmentStaff.findAll({
      where: { establishmentId, isActive: true },
      include: [{
        model: CurrentAccount,
        as: 'currentAccount',
        required: false
      }]
    });

    console.log(`[CurrentAccounts] Found ${staff.length} active staff members for establishment ${establishmentId}`);

    // Filter staff without accounts
    const staffWithoutAccounts = staff.filter(s => !s.currentAccount);
    
    console.log(`[CurrentAccounts] ${staffWithoutAccounts.length} staff members without accounts`);

    if (staffWithoutAccounts.length === 0) {
      return res.json({ 
        success: true, 
        message: staff.length === 0 
          ? 'No hay empleados registrados en el establecimiento' 
          : 'Todos los empleados ya tienen cuenta corriente',
        data: [],
        totalStaff: staff.length,
        staffWithAccounts: staff.length
      });
    }

    const createdAccounts = [];
    for (const staffMember of staffWithoutAccounts) {
      const account = await CurrentAccount.create({
        establishmentId,
        staffId: staffMember.id,
        holderName: staffMember.name,
        holderPhone: staffMember.phone,
        holderEmail: staffMember.email,
        accountType: 'employee',
        useCostPrice,
        discountPercentage
      });
      createdAccounts.push(account);
    }

    res.json({ 
      success: true, 
      message: `Se crearon ${createdAccounts.length} cuentas corrientes para empleados`,
      data: createdAccounts,
      totalStaff: staff.length,
      staffWithAccounts: staff.length - staffWithoutAccounts.length + createdAccounts.length
    });
  } catch (error) {
    console.error('Error auto-creating staff accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export current accounts to CSV
router.get('/establishment/:establishmentId/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { accountType, hasBalance } = req.query;

    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId, isActive: true };

    if (accountType) {
      where.accountType = accountType;
    }

    if (hasBalance === 'true') {
      where.currentBalance = { [Op.ne]: 0 };
    }

    const accounts = await CurrentAccount.findAll({
      where,
      include: [
        { model: Client, as: 'client' },
        { model: EstablishmentStaff, as: 'staff' }
      ],
      order: [['holderName', 'ASC']]
    });

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(accounts);

    const accountTypeLabels = {
      'employee': 'Empleado',
      'client': 'Cliente',
      'supplier': 'Proveedor',
      'other': 'Otro'
    };

    const csvData = accounts.map(account => ({
      titular: account.holderName,
      telefono: account.holderPhone || '-',
      email: account.holderEmail || '-',
      tipo: accountTypeLabels[account.accountType] || account.accountType,
      saldoActual: csvUtils.formatNumberForCSV(account.currentBalance),
      totalCompras: csvUtils.formatNumberForCSV(account.totalPurchases),
      totalPagos: csvUtils.formatNumberForCSV(account.totalPayments),
      limiteCredito: account.creditLimit ? csvUtils.formatNumberForCSV(account.creditLimit) : 'Sin límite',
      descuento: account.discountPercentage ? `${account.discountPercentage}%` : '-',
      precioCosto: account.useCostPrice ? 'Sí' : 'No',
      notas: account.notes || ''
    }));

    const fields = [
      { label: 'Titular', value: 'titular' },
      { label: 'Teléfono', value: 'telefono' },
      { label: 'Email', value: 'email' },
      { label: 'Tipo', value: 'tipo' },
      { label: 'Saldo Actual', value: 'saldoActual' },
      { label: 'Total Compras', value: 'totalCompras' },
      { label: 'Total Pagos', value: 'totalPagos' },
      { label: 'Límite Crédito', value: 'limiteCredito' },
      { label: 'Descuento', value: 'descuento' },
      { label: 'Precio Costo', value: 'precioCosto' },
      { label: 'Notas', value: 'notas' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `cuentas_corrientes_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting current accounts:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export current account movements to CSV
router.get('/movements/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, accountId, type, startDate, endDate } = req.query;

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

    const accountWhere = { establishmentId };
    if (accountId) accountWhere.id = accountId;

    const accounts = await CurrentAccount.findAll({ where: accountWhere, attributes: ['id'] });
    const accountIds = accounts.map(a => a.id);

    if (accountIds.length === 0) {
      return res.status(404).json({ error: 'No accounts found' });
    }

    const movementWhere = { currentAccountId: { [Op.in]: accountIds } };
    if (type) movementWhere.type = type;
    if (startDate || endDate) {
      movementWhere.createdAt = {};
      if (startDate) movementWhere.createdAt[Op.gte] = new Date(startDate);
      if (endDate) movementWhere.createdAt[Op.lte] = new Date(endDate + 'T23:59:59');
    }

    const movements = await CurrentAccountMovement.findAll({
      where: movementWhere,
      include: [
        { model: CurrentAccount, as: 'currentAccount', attributes: ['holderName', 'accountType'] },
        { model: User, as: 'createdByUser', attributes: ['firstName', 'lastName'] },
        { model: Order, as: 'order', attributes: ['orderNumber'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(movements);

    const typeLabels = {
      'charge': 'Cargo',
      'payment': 'Pago',
      'adjustment': 'Ajuste'
    };

    const csvData = movements.map(mov => ({
      fecha: csvUtils.formatDateTimeForCSV(mov.createdAt),
      titular: mov.currentAccount?.holderName || '-',
      tipo: typeLabels[mov.type] || mov.type,
      descripcion: mov.description || '-',
      monto: csvUtils.formatNumberForCSV(mov.amount),
      saldoAnterior: csvUtils.formatNumberForCSV(mov.previousBalance),
      saldoNuevo: csvUtils.formatNumberForCSV(mov.newBalance),
      orden: mov.order?.orderNumber || '-',
      usuario: mov.createdByUser ? `${mov.createdByUser.firstName} ${mov.createdByUser.lastName}`.trim() : '-'
    }));

    const fields = [
      { label: 'Fecha', value: 'fecha' },
      { label: 'Titular', value: 'titular' },
      { label: 'Tipo', value: 'tipo' },
      { label: 'Descripción', value: 'descripcion' },
      { label: 'Monto', value: 'monto' },
      { label: 'Saldo Anterior', value: 'saldoAnterior' },
      { label: 'Saldo Nuevo', value: 'saldoNuevo' },
      { label: 'Orden', value: 'orden' },
      { label: 'Usuario', value: 'usuario' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `movimientos_cuenta_corriente_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting account movements:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export pending debts to CSV
router.get('/debts/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, minAmount, minDays } = req.query;

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

    const where = { 
      establishmentId,
      isActive: true,
      currentBalance: { [Op.gt]: 0 }
    };

    if (minAmount) {
      where.currentBalance = { [Op.gte]: parseFloat(minAmount) };
    }

    const accounts = await CurrentAccount.findAll({
      where,
      include: [
        { model: Client, as: 'client' }
      ],
      order: [['currentBalance', 'DESC']]
    });

    // Get last movement for each account
    const accountIds = accounts.map(a => a.id);
    const lastMovements = await CurrentAccountMovement.findAll({
      where: { currentAccountId: { [Op.in]: accountIds } },
      order: [['createdAt', 'DESC']],
      attributes: ['currentAccountId', 'createdAt']
    });

    const lastMovementMap = {};
    lastMovements.forEach(mov => {
      if (!lastMovementMap[mov.currentAccountId]) {
        lastMovementMap[mov.currentAccountId] = mov.createdAt;
      }
    });

    const csvUtils = require('../utils/csvGenerator');

    const today = new Date();
    let csvData = accounts.map(account => {
      const lastTransaction = lastMovementMap[account.id] ? new Date(lastMovementMap[account.id]) : null;
      const daysOfDebt = lastTransaction 
        ? Math.floor((today - lastTransaction) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        titular: account.holderName,
        telefono: account.holderPhone || '-',
        email: account.holderEmail || '-',
        saldoDeudor: csvUtils.formatNumberForCSV(account.currentBalance),
        diasDeDeuda: daysOfDebt,
        ultimaTransaccion: lastTransaction ? csvUtils.formatDateForCSV(lastTransaction) : '-',
        limiteCredito: account.creditLimit ? csvUtils.formatNumberForCSV(account.creditLimit) : 'Sin límite',
        totalCompras: csvUtils.formatNumberForCSV(account.totalPurchases),
        totalPagos: csvUtils.formatNumberForCSV(account.totalPayments)
      };
    });

    // Filter by minimum days if specified
    if (minDays) {
      csvData = csvData.filter(d => d.diasDeDeuda >= parseInt(minDays));
    }

    const fields = [
      { label: 'Titular', value: 'titular' },
      { label: 'Teléfono', value: 'telefono' },
      { label: 'Email', value: 'email' },
      { label: 'Saldo Deudor', value: 'saldoDeudor' },
      { label: 'Días de Deuda', value: 'diasDeDeuda' },
      { label: 'Última Transacción', value: 'ultimaTransaccion' },
      { label: 'Límite Crédito', value: 'limiteCredito' },
      { label: 'Total Compras', value: 'totalCompras' },
      { label: 'Total Pagos', value: 'totalPagos' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `deudas_pendientes_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting debts:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

module.exports = router;
