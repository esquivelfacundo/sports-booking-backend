const { Payment, Booking, User, SplitPayment, SplitPaymentParticipant, Court, Establishment } = require('../models');
// const mercadopagoService = require('../services/mercadopagoService');
const crypto = require('crypto');

const createPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookingId, paymentMethod = 'mercadopago' } = req.body;

    // Get booking details
    const booking = await Booking.findOne({
      where: { id: bookingId, userId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['firstName', 'lastName', 'email']
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({
        error: 'Booking not found',
        message: 'Booking not found or you do not have access to it'
      });
    }

    if (booking.paymentStatus === 'completed') {
      return res.status(400).json({
        error: 'Payment already completed',
        message: 'This booking has already been paid for'
      });
    }

    // Create payment record
    const payment = await Payment.create({
      userId,
      bookingId,
      amount: booking.totalAmount,
      paymentMethod,
      status: 'pending'
    });

    // Create MercadoPago payment
    const paymentData = {
      amount: booking.totalAmount,
      description: `Reserva de cancha - ${booking.date} ${booking.startTime}`,
      payerEmail: booking.user.email,
      payerName: `${booking.user.firstName} ${booking.user.lastName}`,
      bookingId: booking.id,
      externalReference: payment.id
    };

    const mpResult = await mercadopagoService.createPayment(paymentData);

    if (!mpResult.success) {
      await payment.update({ status: 'failed', failureReason: mpResult.error });
      return res.status(500).json({
        error: 'Payment creation failed',
        message: 'Failed to create payment with MercadoPago'
      });
    }

    // Update payment with MercadoPago data
    await payment.update({
      externalPaymentId: mpResult.preferenceId,
      externalPaymentData: mpResult
    });

    res.status(201).json({
      message: 'Payment created successfully',
      payment: {
        id: payment.id,
        amount: payment.amount,
        status: payment.status,
        preferenceId: mpResult.preferenceId,
        initPoint: mpResult.initPoint,
        sandboxInitPoint: mpResult.sandboxInitPoint
      }
    });

  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      error: 'Failed to create payment',
      message: 'An error occurred while creating the payment'
    });
  }
};

const createSplitPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { splitPaymentId } = req.body;

    // Get split payment details
    const splitPayment = await SplitPayment.findOne({
      where: { id: splitPaymentId, organizerId: userId },
      include: [
        {
          model: Booking,
          as: 'booking',
          include: [{
            model: User,
            as: 'user',
            attributes: ['firstName', 'lastName', 'email']
          }]
        },
        {
          model: SplitPaymentParticipant,
          as: 'participants',
          where: { status: 'pending' }
        }
      ]
    });

    if (!splitPayment) {
      return res.status(404).json({
        error: 'Split payment not found',
        message: 'Split payment not found or you do not have access to it'
      });
    }

    if (splitPayment.status === 'completed') {
      return res.status(400).json({
        error: 'Split payment already completed',
        message: 'This split payment has already been completed'
      });
    }

    // Create MercadoPago split payment
    const splitPaymentData = {
      amount: splitPayment.totalAmount,
      description: `Reserva compartida - ${splitPayment.booking.date} ${splitPayment.booking.startTime}`,
      participants: splitPayment.participants.map(p => ({
        id: p.id,
        email: p.email,
        name: p.name
      })),
      organizerEmail: splitPayment.booking.user.email,
      bookingId: splitPayment.bookingId,
      splitPaymentId: splitPayment.id
    };

    const mpResult = await mercadopagoService.createSplitPayment(splitPaymentData);

    if (!mpResult.success) {
      return res.status(500).json({
        error: 'Split payment creation failed',
        message: 'Failed to create split payment with MercadoPago'
      });
    }

    // Update participants with payment links
    for (const preference of mpResult.paymentPreferences) {
      const participant = splitPayment.participants.find(p => p.id === preference.participantId);
      if (participant) {
        await participant.update({
          paymentData: preference
        });
      }
    }

    res.json({
      message: 'Split payment created successfully',
      splitPayment: {
        id: splitPayment.id,
        totalAmount: splitPayment.totalAmount,
        amountPerPerson: splitPayment.amountPerPerson,
        paymentPreferences: mpResult.paymentPreferences
      }
    });

  } catch (error) {
    console.error('Create split payment error:', error);
    res.status(500).json({
      error: 'Failed to create split payment',
      message: 'An error occurred while creating the split payment'
    });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Verify webhook signature if configured
    if (process.env.MERCADOPAGO_WEBHOOK_SECRET) {
      const signature = req.headers['x-signature'];
      const expectedSignature = crypto
        .createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET)
        .update(JSON.stringify(webhookData))
        .digest('hex');

      if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const result = await mercadopagoService.processWebhook(webhookData);

    if (!result.success) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    // Find payment by external reference
    const payment = await Payment.findOne({
      where: { id: result.externalReference },
      include: [{
        model: Booking,
        as: 'booking'
      }]
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update payment status
    const statusMap = {
      'approved': 'completed',
      'pending': 'processing',
      'rejected': 'failed',
      'cancelled': 'cancelled'
    };

    const newStatus = statusMap[result.status] || 'pending';
    
    await payment.update({
      status: newStatus,
      externalPaymentData: result.paymentData,
      processedAt: newStatus === 'completed' ? new Date() : null
    });

    // Update booking payment status
    if (newStatus === 'completed') {
      await payment.booking.update({
        paymentStatus: 'completed',
        status: 'confirmed',
        confirmedAt: new Date()
      });
    } else if (newStatus === 'failed') {
      await payment.booking.update({
        paymentStatus: 'failed'
      });
    }

    res.status(200).json({ message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: 'An error occurred while processing the webhook'
    });
  }
};

const handleSplitPaymentWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    const result = await mercadopagoService.processWebhook(webhookData);

    if (!result.success) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    // Parse external reference to get split payment and participant info
    const [splitPaymentId, participantId] = result.externalReference.split('_');

    const participant = await SplitPaymentParticipant.findOne({
      where: { id: participantId, splitPaymentId },
      include: [{
        model: SplitPayment,
        as: 'splitPayment',
        include: [{
          model: Booking,
          as: 'booking'
        }]
      }]
    });

    if (!participant) {
      return res.status(404).json({ error: 'Split payment participant not found' });
    }

    // Update participant payment status
    const statusMap = {
      'approved': 'paid',
      'pending': 'pending',
      'rejected': 'failed',
      'cancelled': 'cancelled'
    };

    const newStatus = statusMap[result.status] || 'pending';
    
    await participant.update({
      status: newStatus,
      paidAt: newStatus === 'paid' ? new Date() : null
    });

    // Check if all participants have paid
    if (newStatus === 'paid') {
      const splitPayment = participant.splitPayment;
      const paidCount = await SplitPaymentParticipant.count({
        where: { splitPaymentId, status: 'paid' }
      });

      await splitPayment.update({ paidParticipants: paidCount });

      // If all participants have paid, complete the split payment
      if (paidCount >= splitPayment.totalParticipants) {
        await splitPayment.update({
          status: 'completed',
          completedAt: new Date()
        });

        // Update booking status
        await splitPayment.booking.update({
          paymentStatus: 'completed',
          status: 'confirmed',
          confirmedAt: new Date()
        });
      }
    }

    res.status(200).json({ message: 'Split payment webhook processed successfully' });

  } catch (error) {
    console.error('Split payment webhook processing error:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: 'An error occurred while processing the split payment webhook'
    });
  }
};

const getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const payment = await Payment.findOne({
      where: { id },
      include: [
        {
          model: Booking,
          as: 'booking',
          where: { userId }
        }
      ]
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: 'Payment not found or you do not have access to it'
      });
    }

    res.json({ payment });

  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      error: 'Failed to get payment status',
      message: 'An error occurred while fetching payment status'
    });
  }
};

const refundPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const payment = await Payment.findOne({
      where: { id, status: 'completed' },
      include: [{
        model: Booking,
        as: 'booking',
        include: [{
          model: Court,
          as: 'court',
          include: [{
            model: Establishment,
            as: 'establishment',
            where: { userId: req.user.id }
          }]
        }]
      }]
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: 'Payment not found or you do not have permission to refund it'
      });
    }

    // Process refund with MercadoPago
    const refundResult = await mercadopagoService.refundPayment(
      payment.externalPaymentId,
      amount
    );

    if (!refundResult.success) {
      return res.status(500).json({
        error: 'Refund failed',
        message: 'Failed to process refund with MercadoPago'
      });
    }

    // Update payment record
    await payment.update({
      status: 'refunded',
      refundedAt: new Date(),
      refundAmount: amount || payment.amount,
      refundReason: reason
    });

    // Update booking status
    await payment.booking.update({
      status: 'cancelled',
      paymentStatus: 'refunded',
      cancelledAt: new Date(),
      cancellationReason: reason
    });

    res.json({
      message: 'Payment refunded successfully',
      refund: refundResult.refund
    });

  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({
      error: 'Failed to refund payment',
      message: 'An error occurred while processing the refund'
    });
  }
};

module.exports = {
  createPayment,
  createSplitPayment,
  handleWebhook,
  handleSplitPaymentWebhook,
  getPaymentStatus,
  refundPayment
};
