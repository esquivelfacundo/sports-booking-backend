/**
 * WhatsApp Meta Webhook Routes
 * Handles webhook verification and incoming notifications from Meta's WhatsApp Business API
 * Uses a global WHATSAPP_VERIFY_TOKEN from environment variables
 * 
 * This is separate from the per-establishment WhatsApp integration in /api/whatsapp
 */
const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp');
const { EstablishmentIntegration, Establishment } = require('../models');

/**
 * GET /webhook/whatsapp
 * Webhook verification endpoint (called by Meta when setting up webhook)
 * Uses a global WHATSAPP_VERIFY_TOKEN from environment variables
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[Meta Webhook] Verification request:', { mode, token: token?.substring(0, 10) + '...' });

  if (!mode || !token) {
    return res.status(400).send('Missing parameters');
  }

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('[Meta Webhook] WHATSAPP_VERIFY_TOKEN not configured in environment variables');
    return res.status(500).send('Server misconfigured');
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Meta Webhook] Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('[Meta Webhook] Verification failed - token mismatch');
  return res.status(403).send('Verification failed');
});

/**
 * POST /webhook/whatsapp
 * Receives incoming messages and status updates from WhatsApp Business API
 */
router.post('/', async (req, res) => {
  // Always respond 200 quickly to avoid Meta retries
  res.status(200).send('EVENT_RECEIVED');

  try {
    const payload = req.body;

    if (payload.object !== 'whatsapp_business_account') {
      console.log('[Meta Webhook] Ignoring non-WhatsApp payload');
      return;
    }

    // Extract messages from the webhook payload
    const messages = WhatsAppService.parseWebhookPayload(payload);

    // Also extract status updates (message delivered, read, etc.)
    const statuses = extractStatusUpdates(payload);

    // Process status updates
    for (const status of statuses) {
      console.log('[Meta Webhook] Status update:', {
        messageId: status.id,
        status: status.status,
        recipientId: status.recipientId,
        timestamp: status.timestamp,
      });
      // TODO: Update message delivery status in DB if needed
    }

    // Process incoming messages
    for (const { message, phoneNumberId, contactName, contactPhone } of messages) {
      console.log('[Meta Webhook] Incoming message:', {
        from: contactPhone,
        name: contactName,
        type: message.type,
        phoneNumberId,
      });

      // Find the establishment integration by phone number ID
      const integration = await EstablishmentIntegration.findOne({
        where: {
          type: 'WHATSAPP',
          phoneNumberId,
          isActive: true,
        },
        include: [{
          model: Establishment,
          as: 'establishment',
        }],
      });

      if (!integration) {
        console.warn('[Meta Webhook] No integration found for phone number ID:', phoneNumberId);
        continue;
      }

      // Create WhatsApp service for this establishment and process
      const whatsapp = await WhatsAppService.forEstablishment(integration.establishmentId);
      if (!whatsapp) {
        console.error('[Meta Webhook] Failed to create WhatsApp service for establishment:', integration.establishmentId);
        continue;
      }

      // Mark message as read
      try {
        await whatsapp.markAsRead(message.id);
      } catch (err) {
        console.error('[Meta Webhook] Failed to mark message as read:', err.message);
      }

      // TODO: Route message to appropriate handler (chatbot, notification, etc.)
      console.log('[Meta Webhook] Message processed for establishment:', integration.establishmentId);
    }
  } catch (error) {
    console.error('[Meta Webhook] Error processing webhook:', error);
  }
});

/**
 * Extracts status updates from webhook payload
 * @param {object} payload - Webhook payload from Meta
 * @returns {Array<{id: string, status: string, recipientId: string, timestamp: string}>}
 */
function extractStatusUpdates(payload) {
  const statuses = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages' || !change.value?.statuses) continue;

      for (const status of change.value.statuses) {
        statuses.push({
          id: status.id,
          status: status.status, // sent, delivered, read, failed
          recipientId: status.recipient_id,
          timestamp: status.timestamp,
          errors: status.errors || null,
        });
      }
    }
  }

  return statuses;
}

module.exports = router;
