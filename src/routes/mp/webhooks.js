const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mpService = require('../../services/mercadopago');
const { Booking, Payment, Court, Establishment, ClientDebt } = require('../../models');
const { Op } = require('sequelize');
const emailService = require('../../services/email');
const qrService = require('../../services/qrcode');
const EventEmitter = require('events');

// Event emitter for webhook events
const webhookEvents = new EventEmitter();

/**
 * Validate webhook signature from Mercado Pago
 */
function validateWebhookSignature(req, res, next) {
  const webhookSecret = process.env.MP_WEBHOOK_SECRET;
  
  // Skip validation if no secret configured (development)
  if (!webhookSecret) {
    console.log('⚠️ Webhook signature validation skipped (no secret configured)');
    return next();
  }

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];

  if (!xSignature || !xRequestId) {
    console.log('⚠️ Missing signature headers');
    return next(); // Allow for now, but log
  }

  try {
    // Parse x-signature header
    const signatureParts = xSignature.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key.trim()] = value.trim();
      return acc;
    }, {});

    const ts = signatureParts.ts;
    const v1 = signatureParts.v1;

    if (!ts || !v1) {
      console.log('⚠️ Invalid signature format');
      return next();
    }

    // Build manifest string
    const dataId = req.query['data.id'] || req.body?.data?.id || '';
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    // Calculate HMAC
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(manifest);
    const calculatedSignature = hmac.digest('hex');

    if (calculatedSignature !== v1) {
      console.log('⚠️ Signature mismatch');
      // Log but don't reject for now
    }

    next();
  } catch (err) {
    console.error('Error validating webhook signature:', err);
    next();
  }
}

/**
 * POST /api/mp/webhooks
 * Receive payment notifications from Mercado Pago
 */
router.post('/', validateWebhookSignature, async (req, res) => {
  try {
    // MercadoPago can send webhooks in two formats:
    // 1. Query params: ?topic=payment&id=123
    // 2. Body: { type: 'payment', data: { id: '123' } }
    const topic = req.query.topic || req.body.type;
    const resourceId = req.query.id || req.body.data?.id;
    const action = req.body.action;

    console.log('');
    console.log('🔔 WEBHOOK RECEIVED');
    console.log('   Topic:', topic);
    console.log('   Resource ID:', resourceId);
    console.log('   Action:', action);

    // Respond immediately to avoid retries
    res.status(200).send('OK');

    // Process in background
    if (topic === 'payment') {
      await processPaymentNotification(resourceId, action);
    } else if (topic === 'merchant_order') {
      await processMerchantOrderNotification(resourceId, action);
    }

  } catch (err) {
    console.error('❌ Error processing webhook:', err.message);
    res.status(500).send('Error');
  }
});

/**
 * Process a payment notification
 */
async function processPaymentNotification(paymentId, action) {
  if (!paymentId) {
    console.log('   ⚠️ No payment ID received');
    return;
  }

  try {
    const paymentData = await mpService.getPayment(paymentId);

    console.log('');
    console.log('💳 PAYMENT DETAILS:');
    console.log('   ID:', paymentData.id);
    console.log('   Status:', paymentData.status);
    console.log('   Status Detail:', paymentData.statusDetail);
    console.log('   Amount:', paymentData.amount, paymentData.currency);
    console.log('   Method:', paymentData.paymentMethod);
    console.log('   External Reference:', paymentData.externalReference);

    // Parse external reference to get booking ID
    const extRef = paymentData.externalReference || '';
    let bookingId = null;
    
    if (extRef.startsWith('BOOKING-')) {
      const refValue = extRef.replace('BOOKING-', '');
      // Check if it's a valid UUID (existing booking) or a timestamp (new booking)
      if (refValue.includes('-') && refValue.length > 20) {
        bookingId = refValue;
      }
    }

    // If payment approved and no existing booking, create one from metadata
    if (paymentData.status === 'approved' && !bookingId && paymentData.metadata) {
      bookingId = await createBookingFromPayment(paymentData);
    }

    // Update booking status based on payment
    if (bookingId) {
      await updateBookingFromPayment(bookingId, paymentData);
    }

    // Emit events
    webhookEvents.emit('payment', {
      action,
      payment: paymentData,
      bookingId
    });

    // Emit specific status events
    switch (paymentData.status) {
      case 'approved':
        console.log('   ✅ Payment APPROVED');
        webhookEvents.emit('payment.approved', paymentData);
        break;
      case 'pending':
        console.log('   ⏳ Payment PENDING');
        webhookEvents.emit('payment.pending', paymentData);
        break;
      case 'rejected':
        console.log('   ❌ Payment REJECTED');
        webhookEvents.emit('payment.rejected', paymentData);
        break;
      case 'cancelled':
        console.log('   🚫 Payment CANCELLED');
        webhookEvents.emit('payment.cancelled', paymentData);
        break;
      case 'refunded':
        console.log('   💰 Payment REFUNDED');
        webhookEvents.emit('payment.refunded', paymentData);
        break;
      default:
        console.log('   ℹ️ Status:', paymentData.status);
    }

  } catch (err) {
    console.error('   ❌ Error fetching payment:', err.message);
  }
}

/**
 * Process a merchant order notification
 * Note: MercadoPago sends both merchant_order AND payment webhooks.
 * We rely on the payment webhooks to actually process the payments.
 * This just logs that we received the merchant order notification.
 */
async function processMerchantOrderNotification(merchantOrderId, action) {
  if (!merchantOrderId) {
    console.log('   ⚠️ No merchant order ID received');
    return;
  }

  console.log('');
  console.log('📦 MERCHANT ORDER NOTIFICATION:');
  console.log('   ID:', merchantOrderId);
  console.log('   Action:', action);
  console.log('   ℹ️ Waiting for individual payment webhooks to process...');
  
  // MercadoPago will send separate payment webhooks for each payment in the order
  // We don't need to fetch the merchant order here since we can't access seller's orders
  // with platform credentials, and the payment webhooks will handle everything
}

/**
 * Create a new booking from payment metadata
 */
async function createBookingFromPayment(paymentData) {
  try {
    const meta = paymentData.metadata;
    
    // Support both camelCase and snake_case from MP metadata
    const metadata = {
      courtId: meta.courtId || meta.court_id,
      establishmentId: meta.establishmentId || meta.establishment_id,
      date: meta.date,
      startTime: meta.startTime || meta.start_time,
      endTime: meta.endTime || meta.end_time,
      duration: meta.duration,
      fullPrice: meta.fullPrice || meta.full_price,
      // Deposit amounts - IMPORTANT: depositBaseAmount is WITHOUT service fee
      depositBaseAmount: meta.depositBaseAmount || meta.deposit_base_amount,
      depositFee: meta.depositFee || meta.deposit_fee,
      depositTotal: meta.depositTotal || meta.deposit_total,
      depositPercent: meta.depositPercent || meta.deposit_percent,
      remainingAmount: meta.remainingAmount || meta.remaining_amount,
      // Debt info
      debtAmount: meta.debtAmount || meta.debt_amount || 0,
      debtIds: meta.debtIds || meta.debt_ids || [],
      // Client data
      clientName: meta.clientName || meta.client_name,
      clientEmail: meta.clientEmail || meta.client_email,
      clientPhone: meta.clientPhone || meta.client_phone,
      userId: meta.userId || meta.user_id
    };
    
    if (!metadata.courtId || !metadata.establishmentId || !metadata.date || !metadata.startTime) {
      console.log('   ⚠️ Missing required metadata for booking creation');
      console.log('   Metadata:', metadata);
      return null;
    }

    // Check if booking already exists for this slot
    const existingBooking = await Booking.findOne({
      where: {
        courtId: metadata.courtId,
        date: metadata.date,
        startTime: metadata.startTime
      }
    });

    if (existingBooking) {
      console.log(`   ⚠️ Booking already exists for this slot: ${existingBooking.id}`);
      return existingBooking.id;
    }

    // Get payer info
    const payerEmail = paymentData.payer?.email || '';

    // Generate check-in code for QR
    const checkInCode = qrService.generateCheckInCode();

    // Calculate deposit amount - use depositBaseAmount (without service fee) for correct pending calculation
    // depositBaseAmount = seña sin tarifa (lo que cuenta para el establecimiento)
    // depositTotal = seña + tarifa de servicio (lo que pagó el cliente en MP)
    const depositForEstablishment = parseFloat(metadata.depositBaseAmount) || parseFloat(metadata.depositTotal) || paymentData.amount;
    const serviceFee = parseFloat(metadata.depositFee) || 0;
    const fullPrice = parseFloat(metadata.fullPrice) || paymentData.amount;
    const isFullPayment = metadata.paymentType === 'full';
    
    // Create the booking with client data from metadata
    const booking = await Booking.create({
      courtId: metadata.courtId,
      establishmentId: metadata.establishmentId,
      userId: metadata.userId || null,
      date: metadata.date,
      startTime: metadata.startTime,
      endTime: metadata.endTime || metadata.startTime,
      duration: parseInt(metadata.duration) || 60,
      totalAmount: fullPrice,
      // IMPORTANT: depositAmount is the amount that counts towards the court price (WITHOUT service fee)
      // This ensures pendingAmount = totalAmount - depositAmount = correct remaining for establishment
      depositAmount: depositForEstablishment,
      status: 'confirmed',
      // If full payment, mark as completed; if deposit, mark as partial
      paymentStatus: isFullPayment ? 'completed' : 'partial',
      paymentType: 'full',
      clientName: metadata.clientName || paymentData.payer?.name || 'Cliente',
      clientEmail: metadata.clientEmail || paymentData.payer?.email || '',
      clientPhone: metadata.clientPhone || '',
      checkInCode: checkInCode,
      confirmedAt: new Date(),
      paidAt: new Date(),
      mpPaymentId: paymentData.id?.toString(),
      notes: isFullPayment 
        ? `Pago completo: $${fullPrice} + Tarifa servicio: $${serviceFee} - MP ID: ${paymentData.id}`
        : `Seña pagada: $${depositForEstablishment} (${metadata.depositPercent || 50}%) + Tarifa servicio: $${serviceFee} - MP ID: ${paymentData.id}`
    });

    console.log(`   ✅ Booking CREATED: ${booking.id}`);
    console.log(`   Court: ${metadata.courtId}`);
    console.log(`   Date: ${metadata.date} ${metadata.startTime}-${metadata.endTime}`);
    console.log(`   Tipo de pago: ${isFullPayment ? 'COMPLETO' : 'SEÑA'}`);
    console.log(`   Total cancha: $${fullPrice}`);
    console.log(`   Pagado (sin tarifa): $${depositForEstablishment}`);
    console.log(`   Tarifa servicio: $${serviceFee}`);
    console.log(`   Pendiente en cancha: $${fullPrice - depositForEstablishment}`);

    // Mark debts as paid if any were included in this payment
    if (metadata.debtIds && metadata.debtIds.length > 0) {
      try {
        const debtIdsArray = Array.isArray(metadata.debtIds) ? metadata.debtIds : [metadata.debtIds];
        await ClientDebt.update(
          {
            status: 'paid',
            paidAt: new Date(),
            paidBookingId: booking.id
          },
          {
            where: {
              id: { [Op.in]: debtIdsArray },
              status: 'pending'
            }
          }
        );
        console.log(`   💰 Marked ${debtIdsArray.length} debts as paid (total: $${metadata.debtAmount})`);
      } catch (debtError) {
        console.error('   ⚠️ Error marking debts as paid:', debtError.message);
      }
    }

    // Send confirmation emails
    try {
      const establishment = await Establishment.findByPk(metadata.establishmentId);
      const court = await Court.findByPk(metadata.courtId);
      
      // Send confirmation to client
      await emailService.sendBookingConfirmation(booking, establishment, court);
      
      // Send notification to establishment
      await emailService.sendEstablishmentNotification(booking, establishment, court);
      
      console.log(`   📧 Confirmation emails sent`);
    } catch (emailError) {
      console.error('   ⚠️ Error sending emails:', emailError.message);
    }

    return booking.id;

  } catch (err) {
    console.error('   ❌ Error creating booking from payment:', err.message);
    return null;
  }
}

/**
 * Update booking based on payment status
 */
async function updateBookingFromPayment(bookingId, paymentData) {
  try {
    const booking = await Booking.findByPk(bookingId);
    
    if (!booking) {
      console.log(`   ⚠️ Booking ${bookingId} not found`);
      return;
    }

    const updates = {};

    switch (paymentData.status) {
      case 'approved':
        updates.status = 'confirmed';
        updates.paymentStatus = 'paid';
        updates.confirmedAt = new Date();
        updates.paidAt = new Date();
        updates.mpPaymentId = paymentData.id?.toString();
        // Save initial deposit info if not already set
        if (!booking.initialDeposit || parseFloat(booking.initialDeposit) === 0) {
          const depositAmt = parseFloat(booking.depositAmount) || 0;
          const totalAmt = parseFloat(booking.totalAmount) || 0;
          updates.initialDeposit = depositAmt;
          if (totalAmt > 0 && depositAmt > 0) {
            updates.depositPercent = Math.round((depositAmt / totalAmt) * 100);
          }
        }
        break;
      case 'pending':
        updates.paymentStatus = 'pending';
        break;
      case 'rejected':
      case 'cancelled':
        updates.paymentStatus = 'failed';
        break;
      case 'refunded':
        updates.paymentStatus = 'refunded';
        updates.status = 'cancelled';
        break;
    }

    if (Object.keys(updates).length > 0) {
      await booking.update(updates);
      console.log(`   ✅ Booking ${bookingId} updated:`, updates);
    }

    // Create payment record
    await Payment.create({
      bookingId: booking.id,
      userId: booking.userId,
      amount: paymentData.amount,
      currency: paymentData.currency || 'ARS',
      paymentMethod: 'mercadopago',
      paymentProvider: 'mercadopago',
      status: paymentData.status,
      transactionId: paymentData.id.toString(),
      metadata: {
        mpPaymentId: paymentData.id,
        mpStatus: paymentData.status,
        mpStatusDetail: paymentData.statusDetail,
        mpPaymentMethod: paymentData.paymentMethod,
        mpPaymentType: paymentData.paymentType,
        externalReference: paymentData.externalReference
      }
    });

  } catch (err) {
    console.error(`   ❌ Error updating booking ${bookingId}:`, err.message);
  }
}

// Export event emitter for external subscriptions
router.events = webhookEvents;

module.exports = router;
