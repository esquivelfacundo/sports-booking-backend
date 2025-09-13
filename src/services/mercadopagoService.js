const mercadopago = require('mercadopago');
require('dotenv').config();

// Configure MercadoPago
mercadopago.configure({
  access_token: process.env.MERCADOPAGO_ACCESS_TOKEN
});

const createPayment = async (paymentData) => {
  try {
    const {
      amount,
      description,
      payerEmail,
      payerName,
      bookingId,
      externalReference
    } = paymentData;

    const preference = {
      items: [
        {
          title: description,
          unit_price: parseFloat(amount),
          quantity: 1,
          currency_id: 'ARS'
        }
      ],
      payer: {
        email: payerEmail,
        name: payerName
      },
      external_reference: externalReference || bookingId,
      notification_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/webhook`,
      back_urls: {
        success: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking/success`,
        failure: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking/failure`,
        pending: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking/pending`
      },
      auto_return: 'approved',
      payment_methods: {
        excluded_payment_methods: [],
        excluded_payment_types: [],
        installments: 12
      }
    };

    const response = await mercadopago.preferences.create(preference);
    
    return {
      success: true,
      preferenceId: response.body.id,
      initPoint: response.body.init_point,
      sandboxInitPoint: response.body.sandbox_init_point
    };

  } catch (error) {
    console.error('MercadoPago payment creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const getPaymentInfo = async (paymentId) => {
  try {
    const response = await mercadopago.payment.findById(paymentId);
    return {
      success: true,
      payment: response.body
    };
  } catch (error) {
    console.error('MercadoPago get payment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const processWebhook = async (webhookData) => {
  try {
    const { type, data } = webhookData;

    if (type === 'payment') {
      const paymentInfo = await getPaymentInfo(data.id);
      
      if (paymentInfo.success) {
        return {
          success: true,
          paymentData: paymentInfo.payment,
          status: paymentInfo.payment.status,
          externalReference: paymentInfo.payment.external_reference
        };
      }
    }

    return {
      success: false,
      error: 'Invalid webhook data'
    };

  } catch (error) {
    console.error('MercadoPago webhook processing error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const createSplitPayment = async (splitPaymentData) => {
  try {
    const {
      amount,
      description,
      participants,
      organizerEmail,
      bookingId,
      splitPaymentId
    } = splitPaymentData;

    const amountPerPerson = amount / participants.length;

    // Create individual payment preferences for each participant
    const paymentPreferences = [];

    for (const participant of participants) {
      const preference = {
        items: [
          {
            title: `${description} - Tu parte`,
            unit_price: parseFloat(amountPerPerson),
            quantity: 1,
            currency_id: 'ARS'
          }
        ],
        payer: {
          email: participant.email,
          name: participant.name
        },
        external_reference: `${splitPaymentId}_${participant.id}`,
        notification_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/webhook/split`,
        back_urls: {
          success: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/split-payment/success?id=${splitPaymentId}`,
          failure: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/split-payment/failure?id=${splitPaymentId}`,
          pending: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/split-payment/pending?id=${splitPaymentId}`
        },
        auto_return: 'approved'
      };

      const response = await mercadopago.preferences.create(preference);
      
      paymentPreferences.push({
        participantId: participant.id,
        participantEmail: participant.email,
        preferenceId: response.body.id,
        initPoint: response.body.init_point,
        sandboxInitPoint: response.body.sandbox_init_point,
        amount: amountPerPerson
      });
    }

    return {
      success: true,
      paymentPreferences
    };

  } catch (error) {
    console.error('MercadoPago split payment creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const refundPayment = async (paymentId, amount = null) => {
  try {
    const refundData = {
      payment_id: paymentId
    };

    if (amount) {
      refundData.amount = parseFloat(amount);
    }

    const response = await mercadopago.refund.create(refundData);
    
    return {
      success: true,
      refund: response.body
    };

  } catch (error) {
    console.error('MercadoPago refund error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createPayment,
  getPaymentInfo,
  processWebhook,
  createSplitPayment,
  refundPayment
};
