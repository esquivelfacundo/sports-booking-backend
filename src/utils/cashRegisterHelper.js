const { CashRegister, CashRegisterMovement } = require('../models');

/**
 * Helper function to get payment method field name in CashRegister
 */
function getPaymentMethodField(paymentMethod) {
  const methodMap = {
    'cash': 'totalCash',
    'efectivo': 'totalCash',
    'card': 'totalCard',
    'tarjeta': 'totalCard',
    'transfer': 'totalTransfer',
    'transferencia': 'totalTransfer',
    'credit_card': 'totalCreditCard',
    'credito': 'totalCreditCard',
    'debit_card': 'totalDebitCard',
    'debito': 'totalDebitCard',
    'mercadopago': 'totalMercadoPago',
    'mercado_pago': 'totalMercadoPago'
  };
  return methodMap[paymentMethod?.toLowerCase()] || 'totalOther';
}

/**
 * Register a sale movement in the cash register
 * @param {Object} params
 * @param {string} params.cashRegisterId - Cash register ID
 * @param {string} params.establishmentId - Establishment ID
 * @param {string} params.orderId - Order ID (optional)
 * @param {string} params.bookingId - Booking ID (optional)
 * @param {number} params.amount - Amount
 * @param {string} params.paymentMethod - Payment method code
 * @param {string} params.description - Description
 * @param {string} params.registeredBy - User ID who registered
 * @param {Object} transaction - Sequelize transaction
 */
async function registerSaleMovement({ 
  cashRegisterId, 
  establishmentId, 
  orderId, 
  bookingId, 
  amount, 
  paymentMethod, 
  description, 
  registeredBy 
}, transaction) {
  // Get cash register
  const cashRegister = await CashRegister.findByPk(cashRegisterId, { transaction });
  
  if (!cashRegister) {
    throw new Error('Cash register not found');
  }

  if (cashRegister.status !== 'open') {
    throw new Error('Cash register is not open');
  }

  // Create movement
  const movement = await CashRegisterMovement.create({
    cashRegisterId,
    establishmentId,
    type: 'sale',
    orderId,
    bookingId,
    amount: parseFloat(amount),
    paymentMethod,
    description,
    registeredBy,
    registeredAt: new Date()
  }, { transaction });

  // Update cash register totals
  const updates = {
    totalSales: parseFloat(cashRegister.totalSales) + parseFloat(amount),
    totalMovements: cashRegister.totalMovements + 1
  };

  // Update payment method totals
  const methodField = getPaymentMethodField(paymentMethod);
  updates[methodField] = parseFloat(cashRegister[methodField]) + parseFloat(amount);

  // Update expected cash if payment method is cash
  if (paymentMethod === 'cash') {
    updates.expectedCash = parseFloat(cashRegister.expectedCash) + parseFloat(amount);
  }

  // Increment order count if this is an order
  if (orderId) {
    updates.totalOrders = cashRegister.totalOrders + 1;
  }

  await cashRegister.update(updates, { transaction });

  return movement;
}

/**
 * Register multiple sale movements for an order with multiple payments
 */
async function registerOrderSaleMovements({
  cashRegisterId,
  establishmentId,
  orderId,
  bookingId,
  payments,
  registeredBy
}, transaction) {
  const movements = [];

  for (const payment of payments) {
    const movement = await registerSaleMovement({
      cashRegisterId,
      establishmentId,
      orderId,
      bookingId,
      amount: payment.amount,
      paymentMethod: payment.method,
      description: payment.description || `Pago de pedido #${orderId}`,
      registeredBy
    }, transaction);
    
    movements.push(movement);
  }

  return movements;
}

/**
 * Check if user has an open cash register
 * Searches by userId OR staffId to support both owners and staff
 */
async function getUserActiveCashRegister(userId, establishmentId) {
  const { Op } = require('sequelize');
  
  return await CashRegister.findOne({
    where: {
      establishmentId,
      status: 'open',
      [Op.or]: [
        { userId },
        { staffId: userId }
      ]
    }
  });
}

module.exports = {
  registerSaleMovement,
  registerOrderSaleMovements,
  getUserActiveCashRegister,
  getPaymentMethodField
};
