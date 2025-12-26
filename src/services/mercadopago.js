const { MercadoPagoConfig, OAuth, Preference, Payment } = require('mercadopago');

// Configuration
const config = {
  accessToken: process.env.MP_ACCESS_TOKEN,
  publicKey: process.env.MP_PUBLIC_KEY,
  clientId: process.env.MP_CLIENT_ID,
  clientSecret: process.env.MP_CLIENT_SECRET,
  collectorId: process.env.MP_COLLECTOR_ID || null,
  webhookSecret: process.env.MP_WEBHOOK_SECRET,
  // Use APP_URL in production, NGROK_URL only for local development
  appUrl: process.env.APP_URL || process.env.NGROK_URL || 'http://localhost:8001',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4555',
  defaultFeePercent: parseFloat(process.env.MP_DEFAULT_FEE_PERCENT) || 10
};

// Main MP client (platform/marketplace)
const mpClient = new MercadoPagoConfig({
  accessToken: config.accessToken,
  options: { timeout: 5000 }
});

const oauth = new OAuth(mpClient);
const preference = new Preference(mpClient);
const payment = new Payment(mpClient);

/**
 * Generate OAuth authorization URL for sellers/establishments
 * @param {string} redirectUri - Callback URL after authorization
 * @param {string} state - State data to pass through OAuth flow
 */
function getAuthorizationUrl(redirectUri, state = '') {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: redirectUri,
  });

  if (state) {
    params.append('state', state);
  }

  return `https://auth.mercadopago.com.ar/authorization?${params.toString()}`;
}

/**
 * Exchange authorization code for access tokens
 * @param {string} code - Authorization code from OAuth callback
 * @param {string} redirectUri - Same redirect URI used in authorization
 */
async function exchangeCodeForToken(code, redirectUri) {
  const tokenData = await oauth.create({
    body: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    }
  });

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    userId: tokenData.user_id,
    publicKey: tokenData.public_key,
    expiresIn: tokenData.expires_in,
    tokenType: tokenData.token_type,
    scope: tokenData.scope,
  };
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 */
async function refreshAccessToken(refreshToken) {
  const tokenData = await oauth.create({
    body: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }
  });

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
  };
}

/**
 * Create a simple payment preference (no split)
 * @param {Object} options - Preference options
 */
async function createPreference(options) {
  const { items, payer, backUrls, externalReference, notificationUrl } = options;

  const preferenceData = await preference.create({
    body: {
      items: items.map(item => ({
        title: item.title,
        quantity: item.quantity || 1,
        unit_price: item.unitPrice,
        currency_id: item.currency || 'ARS',
        description: item.description || '',
      })),
      payer: payer ? {
        email: payer.email,
        name: payer.name,
        surname: payer.surname,
      } : undefined,
      back_urls: backUrls ? {
        success: backUrls.success,
        failure: backUrls.failure,
        pending: backUrls.pending,
      } : undefined,
      auto_return: backUrls ? 'approved' : undefined,
      external_reference: externalReference || `ORDER-${Date.now()}`,
      notification_url: notificationUrl,
    }
  });

  return {
    id: preferenceData.id,
    initPoint: preferenceData.init_point,
    sandboxInitPoint: preferenceData.sandbox_init_point,
    externalReference: preferenceData.external_reference,
  };
}

/**
 * Create a split payment preference (marketplace)
 * Payment goes to seller, platform takes a commission
 * @param {Object} options - Preference options
 * @param {Object} seller - Seller data with accessToken
 * @param {number} marketplaceFee - Platform fee amount (fixed)
 */
async function createSplitPreference(options, seller, marketplaceFee = null) {
  const { items, payer, backUrls, externalReference, notificationUrl, metadata } = options;

  // Calculate total (support both camelCase and snake_case)
  const total = items.reduce((sum, item) => sum + ((item.unit_price || item.unitPrice) * (item.quantity || 1)), 0);

  // Calculate marketplace fee
  const fee = marketplaceFee !== null 
    ? marketplaceFee 
    : Math.round(total * (config.defaultFeePercent / 100) * 100) / 100;

  console.log('💳 [Split Payment] Creating preference:');
  console.log(`   Total: $${total}`);
  console.log(`   Marketplace fee (to platform): $${fee}`);
  console.log(`   Seller receives: $${total - fee}`);
  console.log(`   Platform Collector ID: ${config.collectorId}`);
  console.log(`   Platform Client ID: ${config.clientId}`);
  console.log(`   Seller accessToken: ${seller.accessToken?.substring(0, 20)}...`);

  // Create client with seller's access token
  const sellerClient = new MercadoPagoConfig({
    accessToken: seller.accessToken,
    options: { timeout: 5000 }
  });

  const sellerPreference = new Preference(sellerClient);

  const preferenceData = await sellerPreference.create({
    body: {
      items: items.map(item => ({
        title: item.title,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || item.unitPrice,
        currency_id: item.currency_id || item.currency || 'ARS',
        description: item.description || '',
      })),
      payer: payer ? {
        email: payer.email,
        name: payer.name,
        surname: payer.surname,
      } : undefined,
      back_urls: (backUrls && backUrls.success) ? {
        success: backUrls.success,
        failure: backUrls.failure || backUrls.success,
        pending: backUrls.pending || backUrls.success,
      } : undefined,
      // Only set auto_return if back_urls are HTTPS (MP requirement for production)
      auto_return: (backUrls && backUrls.success && backUrls.success.startsWith('https://')) ? 'approved' : undefined,
      external_reference: externalReference || `ORDER-${Date.now()}`,
      notification_url: notificationUrl,
      // Metadata for booking creation
      metadata: metadata || {},
      // Split Payment Configuration
      // marketplace_fee: The amount that goes to the marketplace (platform)
      // marketplace: The Application ID (Client ID) that identifies the marketplace
      // The fee will go to the Collector ID associated with this Application ID
      marketplace_fee: fee,
      marketplace: config.clientId,
    }
  });

  return {
    id: preferenceData.id,
    initPoint: preferenceData.init_point,
    sandboxInitPoint: preferenceData.sandbox_init_point,
    externalReference: preferenceData.external_reference,
    marketplaceFee: fee,
    sellerAmount: total - fee,
    total: total,
  };
}

/**
 * Get payment information
 * @param {string} paymentId - Payment ID
 * @param {string} accessToken - Seller's access token (optional)
 */
async function getPayment(paymentId, accessToken = null) {
  const client = accessToken 
    ? new MercadoPagoConfig({ accessToken, options: { timeout: 5000 } })
    : mpClient;

  const paymentClient = new Payment(client);
  const paymentData = await paymentClient.get({ id: paymentId });

  return {
    id: paymentData.id,
    status: paymentData.status,
    statusDetail: paymentData.status_detail,
    amount: paymentData.transaction_amount,
    currency: paymentData.currency_id,
    paymentMethod: paymentData.payment_method_id,
    paymentType: paymentData.payment_type_id,
    externalReference: paymentData.external_reference,
    dateCreated: paymentData.date_created,
    dateApproved: paymentData.date_approved,
    payer: paymentData.payer,
    feeDetails: paymentData.fee_details,
    metadata: paymentData.metadata,
  };
}

/**
 * Calculate fee for a given amount and establishment
 * @param {number} amount - Total amount
 * @param {Object} establishment - Establishment with optional customFeePercent
 * @param {number} defaultFeePercent - Platform default fee percent
 */
function calculateFee(amount, establishment, defaultFeePercent) {
  const feePercent = establishment?.customFeePercent !== null && establishment?.customFeePercent !== undefined
    ? parseFloat(establishment.customFeePercent)
    : defaultFeePercent;
  
  return Math.round(amount * (feePercent / 100) * 100) / 100;
}

/**
 * Get merchant order details
 * @param {string} merchantOrderId - Merchant order ID
 * @param {string} accessToken - Optional seller access token
 */
async function getMerchantOrder(merchantOrderId, accessToken = null) {
  const client = accessToken 
    ? new MercadoPagoConfig({ accessToken, options: { timeout: 5000 } })
    : mpClient;

  const { MerchantOrder } = require('mercadopago');
  const merchantOrderClient = new MerchantOrder(client);
  const orderData = await merchantOrderClient.get({ merchantOrderId });

  return {
    id: orderData.id,
    status: orderData.status,
    externalReference: orderData.external_reference,
    preferenceId: orderData.preference_id,
    payments: orderData.payments,
    shipments: orderData.shipments,
    totalAmount: orderData.total_amount,
    paidAmount: orderData.paid_amount,
    refundedAmount: orderData.refunded_amount,
    marketplace: orderData.marketplace,
    dateCreated: orderData.date_created,
    lastUpdated: orderData.last_updated,
  };
}

module.exports = {
  config,
  mpClient,
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  createPreference,
  createSplitPreference,
  getPayment,
  getMerchantOrder,
  calculateFee
};
