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
    
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
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
      movements = await CurrentAccountMovement.findAll({
        where: { currentAccountId: id },
        limit: parseInt(movementsLimit),
        order: [['createdAt', 'DESC']],
        include: [
          { model: Order, as: 'order', attributes: ['id', 'orderNumber'] },
          { model: User, as: 'registeredByUser', attributes: ['id', 'name', 'email'] }
        ]
      });
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

module.exports = router;
