const express = require('express');
const router = express.Router();
const mpService = require('../../services/mercadopago');
const { Establishment, PlatformConfig, Booking, ClientDebt } = require('../../models');
const { authenticateToken, optionalAuth } = require('../../middleware/auth');

/**
 * POST /api/mp/payments/create-preference
 * Create a simple payment preference (no split)
 */
router.post('/create-preference', optionalAuth, async (req, res) => {
  try {
    const { items, payer, backUrls, externalReference } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items is required and must be a non-empty array' });
    }

    const notificationUrl = `${mpService.config.appUrl}/api/mp/webhooks`;

    const preference = await mpService.createPreference({
      items,
      payer,
      backUrls,
      externalReference,
      notificationUrl,
    });

    res.json({
      success: true,
      preference: {
        id: preference.id,
        initPoint: preference.initPoint,
        sandboxInitPoint: preference.sandboxInitPoint,
        externalReference: preference.externalReference,
      }
    });

  } catch (err) {
    console.error('❌ Error creating preference:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mp/payments/create-split-preference
 * Create a split payment preference (marketplace)
 * Payment goes to establishment, platform takes a commission
 * Body: {
 *   establishmentId: string,
 *   items: [{ title, quantity, unitPrice, description? }],
 *   payer?: { email, name?, surname? },
 *   backUrls?: { success, failure, pending },
 *   externalReference?: string,
 *   bookingId?: string (to link payment to booking)
 * }
 */
router.post('/create-split-preference', optionalAuth, async (req, res) => {
  try {
    const { establishmentId, items, payer, backUrls, back_urls, externalReference, bookingId, metadata } = req.body;
    
    // Support both camelCase and snake_case for back_urls
    const urls = backUrls || back_urls;
    console.log('📦 Received back_urls:', JSON.stringify(urls, null, 2));

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items is required and must be a non-empty array' });
    }

    // Get establishment
    const establishment = await Establishment.findByPk(establishmentId);

    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (!establishment.mpActive || !establishment.mpAccessToken) {
      return res.status(400).json({ 
        error: 'Establishment has not connected their Mercado Pago account',
        code: 'MP_NOT_CONNECTED'
      });
    }

    // Get platform config for default fee
    const platformConfig = await PlatformConfig.getConfig();
    const defaultFeePercent = parseFloat(platformConfig.defaultFeePercent);

    // Calculate total payment amount (what client pays now - could be deposit or full)
    const total = items.reduce((sum, item) => sum + ((item.unit_price || item.unitPrice) * (item.quantity || 1)), 0);
    
    // Get full court price from metadata (price x hours) for commission calculation
    // Commission should be calculated on the FULL court price, not just the deposit
    const fullPrice = metadata?.fullPrice || metadata?.full_price || total;
    const fee = mpService.calculateFee(parseFloat(fullPrice), establishment, defaultFeePercent);
    
    console.log(`💰 [Split Payment] Fee calculation:`);
    console.log(`   Payment amount (deposit/full): $${total}`);
    console.log(`   Full court price: $${fullPrice}`);
    console.log(`   Fee (${establishment.customFeePercent || defaultFeePercent}% of $${fullPrice}): $${fee}`);

    const notificationUrl = `${mpService.config.appUrl}/api/mp/webhooks`;

    // Create external reference with booking info
    const extRef = externalReference || `BOOKING-${bookingId || Date.now()}`;

    const preference = await mpService.createSplitPreference(
      {
        items,
        payer,
        backUrls: urls,
        externalReference: extRef,
        notificationUrl,
        metadata,
      },
      {
        accessToken: establishment.mpAccessToken
      },
      fee
    );

    res.json({
      success: true,
      preference: {
        id: preference.id,
        initPoint: preference.initPoint,
        sandboxInitPoint: preference.sandboxInitPoint,
        externalReference: preference.externalReference,
      },
      payment: {
        total: preference.total,
        establishmentAmount: preference.sellerAmount,
        platformFee: preference.marketplaceFee,
        feePercent: establishment.customFeePercent || defaultFeePercent
      }
    });

  } catch (err) {
    console.error('❌ Error creating split preference:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mp/payments/calculate-fee
 * Calculate platform fee for a given amount
 * Query: { amount: number, establishmentId?: string }
 * NOTE: This route MUST be defined BEFORE /:paymentId to avoid route conflicts
 */
router.get('/calculate-fee', async (req, res) => {
  try {
    const { amount, establishmentId, clientEmail } = req.query;
    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    let establishment = null;
    if (establishmentId) {
      establishment = await Establishment.findByPk(establishmentId, {
        attributes: ['id', 'customFeePercent', 'requireDeposit', 'depositType', 'depositPercentage', 'depositFixedAmount', 'allowFullPayment']
      });
    }

    const platformConfig = await PlatformConfig.getConfig();
    const defaultFeePercent = parseFloat(platformConfig.defaultFeePercent);
    
    const feePercent = establishment?.customFeePercent !== null && establishment?.customFeePercent !== undefined
      ? parseFloat(establishment.customFeePercent)
      : defaultFeePercent;

    const fee = mpService.calculateFee(parsedAmount, establishment, defaultFeePercent);

    // Calculate deposit amount based on establishment config
    let depositAmount = parsedAmount; // Default to full amount
    let depositPercent = 100;
    
    if (establishment) {
      const requireDeposit = establishment.requireDeposit !== false; // Default true
      console.log(`📊 [Calculate Fee] Establishment deposit config:`, {
        requireDeposit,
        depositType: establishment.depositType,
        depositPercentage: establishment.depositPercentage,
        depositFixedAmount: establishment.depositFixedAmount,
        allowFullPayment: establishment.allowFullPayment
      });
      
      if (requireDeposit) {
        if (establishment.depositType === 'fixed') {
          depositAmount = parseFloat(establishment.depositFixedAmount) || 5000;
          depositPercent = Math.round((depositAmount / parsedAmount) * 100);
        } else {
          // percentage type (default) - use establishment config or default to 50%
          depositPercent = establishment.depositPercentage !== null && establishment.depositPercentage !== undefined 
            ? establishment.depositPercentage 
            : 50;
          depositAmount = Math.round(parsedAmount * depositPercent / 100);
        }
      }
    } else {
      // No establishment found - use defaults
      depositPercent = 50;
      depositAmount = Math.round(parsedAmount * depositPercent / 100);
    }

    // Platform fee is ALWAYS calculated on the FULL court price (parsedAmount), not the deposit
    // This fee is the same whether paying deposit or full payment
    const platformFee = Math.round(parsedAmount * (feePercent / 100) * 100) / 100;
    
    // For deposit option: client pays deposit + full platform fee upfront
    const depositWithFee = depositAmount + platformFee;

    // For full payment option: client pays full price + platform fee
    const fullPaymentTotal = parsedAmount + platformFee;

    // Check for pending debts if clientEmail is provided
    let pendingDebt = {
      hasDebt: false,
      totalDebt: 0,
      debts: []
    };

    if (clientEmail && establishmentId) {
      const debts = await ClientDebt.findAll({
        where: {
          establishmentId,
          clientEmail: clientEmail.toLowerCase(),
          status: 'pending'
        },
        attributes: ['id', 'amount', 'reason', 'description', 'createdAt']
      });

      if (debts.length > 0) {
        const totalDebt = debts.reduce((sum, d) => sum + parseFloat(d.amount), 0);
        pendingDebt = {
          hasDebt: true,
          totalDebt,
          debts: debts.map(d => ({
            id: d.id,
            amount: parseFloat(d.amount),
            reason: d.reason,
            description: d.description
          }))
        };
      }
    }

    // Calculate what the fee would be with the default/general rate
    const generalFee = Math.round(parsedAmount * (defaultFeePercent / 100) * 100) / 100;
    const hasDiscount = feePercent < defaultFeePercent;
    const discountPercent = hasDiscount ? Math.round((1 - feePercent / defaultFeePercent) * 100) : 0;

    res.json({
      success: true,
      amount: parsedAmount,
      feePercent,
      fee: platformFee, // Fee calculated on full court price
      establishmentAmount: parsedAmount - platformFee,
      // Fee discount info (for showing crossed-out general fee)
      feeDiscount: {
        hasDiscount,
        generalFeePercent: defaultFeePercent,
        generalFee, // What the fee would be without discount
        discountPercent, // e.g., 100 for 0% fee, 50 for half price
        actualFee: platformFee
      },
      // Deposit option (seña)
      deposit: {
        required: establishment?.requireDeposit !== false,
        type: establishment?.depositType || 'percentage',
        percent: depositPercent,
        baseAmount: depositAmount,
        fee: platformFee, // Same fee for both options (calculated on full price)
        generalFee, // For showing crossed-out fee
        totalAmount: depositWithFee,
        remainingAmount: parsedAmount - depositAmount // Lo que queda por pagar en cancha
      },
      // Full payment option (pago completo)
      fullPayment: {
        enabled: establishment?.allowFullPayment === true,
        baseAmount: parsedAmount,
        fee: platformFee, // Same fee (calculated on full price)
        generalFee, // For showing crossed-out fee
        totalAmount: fullPaymentTotal,
        remainingAmount: 0 // Nada queda por pagar
      },
      // Pending debt info
      pendingDebt
    });

  } catch (err) {
    console.error('❌ Error calculating fee:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mp/payments/:paymentId
 * Get payment information
 * Query params:
 *   - establishmentId: optional, to use establishment's access token
 */
router.get('/:paymentId', optionalAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { establishmentId } = req.query;

    let accessToken = null;

    if (establishmentId) {
      const establishment = await Establishment.findByPk(establishmentId);
      if (establishment && establishment.mpAccessToken) {
        accessToken = establishment.mpAccessToken;
      }
    }

    const payment = await mpService.getPayment(paymentId, accessToken);

    res.json({
      success: true,
      payment,
    });

  } catch (err) {
    console.error('❌ Error getting payment:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
