/**
 * WhatsApp Webhook Routes
 * Handles incoming webhooks from Meta and provides endpoints for WhatsApp integration
 */
const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp');
const integrationsService = require('../services/integrations');
const { authenticateToken } = require('../middleware/auth');
const { EstablishmentIntegration, Establishment, Court, Booking } = require('../models');

/**
 * GET /api/whatsapp/webhook
 * Webhook verification endpoint (called by Meta when setting up webhook)
 */
router.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('WhatsApp webhook verification request:', { mode, token: token?.substring(0, 10) + '...' });

  if (!mode || !token) {
    return res.status(400).send('Missing parameters');
  }

  // Find integration by verify token
  try {
    const integration = await EstablishmentIntegration.findOne({
      where: {
        type: 'WHATSAPP',
        verifyToken: token,
        isActive: true,
      },
    });

    if (integration && mode === 'subscribe') {
      console.log('WhatsApp webhook verified for establishment:', integration.establishmentId);
      return res.status(200).send(challenge);
    }

    console.warn('WhatsApp webhook verification failed - token not found');
    return res.status(403).send('Verification failed');
  } catch (error) {
    console.error('Error verifying webhook:', error);
    return res.status(500).send('Internal error');
  }
});

/**
 * POST /api/whatsapp/webhook
 * Receives incoming messages and status updates from WhatsApp
 */
router.post('/webhook', async (req, res) => {
  // Always respond 200 quickly to avoid retries
  res.status(200).send('EVENT_RECEIVED');

  try {
    const payload = req.body;
    
    if (payload.object !== 'whatsapp_business_account') {
      console.log('Ignoring non-WhatsApp webhook');
      return;
    }

    const messages = WhatsAppService.parseWebhookPayload(payload);
    
    for (const { message, phoneNumberId, contactName, contactPhone } of messages) {
      console.log('Incoming WhatsApp message:', {
        from: contactPhone,
        name: contactName,
        type: message.type,
        phoneNumberId,
      });

      // Find establishment by phone number ID
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
        console.warn('No integration found for phone number ID:', phoneNumberId);
        continue;
      }

      // Create WhatsApp service for this establishment
      const whatsapp = await WhatsAppService.forEstablishment(integration.establishmentId);
      if (!whatsapp) {
        console.error('Failed to create WhatsApp service');
        continue;
      }

      // Mark message as read
      await whatsapp.markAsRead(message.id);

      // Process the message
      await processIncomingMessage(whatsapp, integration, message, contactName, contactPhone);
    }
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
  }
});

/**
 * Process incoming message and generate appropriate response
 */
async function processIncomingMessage(whatsapp, integration, message, contactName, contactPhone) {
  const establishment = integration.establishment;
  const content = WhatsAppService.extractMessageContent(message);
  const replyId = WhatsAppService.getInteractiveReplyId(message);

  console.log('Processing message:', { content, replyId, type: message.type });

  // Handle interactive replies
  if (replyId) {
    if (replyId.startsWith('court_')) {
      // User selected a court - show available slots
      const courtId = replyId.replace('court_', '');
      // TODO: Implement slot selection
      await whatsapp.sendTextMessage(
        contactPhone,
        `Has seleccionado una cancha. Pronto podrás ver los horarios disponibles.`
      );
      return;
    }

    if (replyId.startsWith('slot_')) {
      // User selected a time slot
      const slotId = replyId.replace('slot_', '');
      // TODO: Implement booking confirmation
      await whatsapp.sendTextMessage(
        contactPhone,
        `Has seleccionado un horario. Pronto podrás confirmar tu reserva.`
      );
      return;
    }

    if (replyId === 'confirm_booking') {
      // TODO: Create the booking
      await whatsapp.sendTextMessage(
        contactPhone,
        `✅ ¡Reserva confirmada! Te enviaremos los detalles en breve.`
      );
      return;
    }

    if (replyId === 'cancel_booking') {
      await whatsapp.sendTextMessage(
        contactPhone,
        `❌ Reserva cancelada. ¿En qué más puedo ayudarte?`
      );
      return;
    }
  }

  // Handle text messages
  if (content) {
    const lowerContent = content.toLowerCase().trim();

    // Greeting
    if (['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hi', 'hello'].some(g => lowerContent.includes(g))) {
      await sendWelcomeMessage(whatsapp, contactPhone, contactName, establishment.name);
      return;
    }

    // Availability inquiry
    if (['disponibilidad', 'disponible', 'canchas', 'horarios', 'reservar'].some(k => lowerContent.includes(k))) {
      await sendAvailabilityOptions(whatsapp, contactPhone, establishment);
      return;
    }

    // Help
    if (['ayuda', 'help', 'opciones', 'menu'].some(k => lowerContent.includes(k))) {
      await sendHelpMessage(whatsapp, contactPhone, establishment.name);
      return;
    }

    // Default response
    await sendDefaultResponse(whatsapp, contactPhone, establishment.name);
  }
}

/**
 * Send welcome message with options
 */
async function sendWelcomeMessage(whatsapp, to, contactName, establishmentName) {
  const buttons = [
    { id: 'check_availability', title: '🏟️ Ver Canchas' },
    { id: 'my_bookings', title: '📋 Mis Reservas' },
    { id: 'help', title: '❓ Ayuda' },
  ];

  await whatsapp.sendButtonMessage(
    to,
    `¡Hola ${contactName}! 👋\n\nBienvenido a *${establishmentName}*.\n\n¿En qué puedo ayudarte?`,
    buttons,
    '🎾 Sistema de Reservas'
  );
}

/**
 * Send availability options
 */
async function sendAvailabilityOptions(whatsapp, to, establishment) {
  // Get courts for this establishment
  const courts = await Court.findAll({
    where: {
      establishmentId: establishment.id,
      isActive: true,
    },
    order: [['name', 'ASC']],
  });

  if (courts.length === 0) {
    await whatsapp.sendTextMessage(
      to,
      `😔 Lo sentimos, no hay canchas disponibles en este momento.`
    );
    return;
  }

  const sections = [{
    title: 'Canchas',
    rows: courts.map(court => ({
      id: `court_${court.id}`,
      title: court.name,
      description: `${court.sport} - $${court.pricePerHour}/hora`,
    })),
  }];

  await whatsapp.sendListMessage(
    to,
    `🏟️ *Canchas disponibles en ${establishment.name}*\n\nSelecciona una cancha para ver los horarios:`,
    'Ver Canchas',
    sections
  );
}

/**
 * Send help message
 */
async function sendHelpMessage(whatsapp, to, establishmentName) {
  const helpText = `❓ *Ayuda - ${establishmentName}*\n\n` +
    `Puedo ayudarte con:\n\n` +
    `🏟️ *Ver canchas* - Consulta las canchas disponibles\n` +
    `📅 *Reservar* - Realiza una nueva reserva\n` +
    `📋 *Mis reservas* - Consulta tus reservas activas\n` +
    `❌ *Cancelar* - Cancela una reserva existente\n\n` +
    `Escribe cualquiera de estas opciones o simplemente dime qué necesitas.`;

  await whatsapp.sendTextMessage(to, helpText);
}

/**
 * Send default response
 */
async function sendDefaultResponse(whatsapp, to, establishmentName) {
  const buttons = [
    { id: 'check_availability', title: '🏟️ Ver Canchas' },
    { id: 'help', title: '❓ Ayuda' },
  ];

  await whatsapp.sendButtonMessage(
    to,
    `No entendí tu mensaje. ¿En qué puedo ayudarte?`,
    buttons,
    establishmentName
  );
}

// ==================== AUTHENTICATED ENDPOINTS ====================

/**
 * POST /api/whatsapp/send
 * Send a message to a phone number (for admin use)
 */
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const establishmentId = req.user.establishmentId;
    const { to, message, type = 'text' } = req.body;

    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user',
      });
    }

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'to and message are required',
      });
    }

    const whatsapp = await WhatsAppService.forEstablishment(establishmentId);
    if (!whatsapp) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp integration not configured for this establishment',
      });
    }

    let result;
    if (type === 'text') {
      result = await whatsapp.sendTextMessage(to, message);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid message type',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/whatsapp/send-booking-confirmation
 * Send booking confirmation to a client
 */
router.post('/send-booking-confirmation', authenticateToken, async (req, res) => {
  try {
    const establishmentId = req.user.establishmentId;
    const { bookingId, phoneNumber } = req.body;

    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user',
      });
    }

    if (!bookingId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'bookingId and phoneNumber are required',
      });
    }

    const whatsapp = await WhatsAppService.forEstablishment(establishmentId);
    if (!whatsapp) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp integration not configured',
      });
    }

    // Get booking details
    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: Court, as: 'court' },
        { model: Establishment, as: 'establishment' },
      ],
    });

    if (!booking || booking.establishmentId !== establishmentId) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    const result = await whatsapp.sendBookingConfirmation(phoneNumber, {
      courtName: booking.court?.name || 'Cancha',
      date: new Date(booking.date).toLocaleDateString('es-AR'),
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalAmount: booking.totalAmount,
      establishmentName: booking.establishment?.name || 'Establecimiento',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error sending booking confirmation:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/whatsapp/send-booking-reminder
 * Send booking reminder to a client
 */
router.post('/send-booking-reminder', authenticateToken, async (req, res) => {
  try {
    const establishmentId = req.user.establishmentId;
    const { bookingId, phoneNumber } = req.body;

    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user',
      });
    }

    const whatsapp = await WhatsAppService.forEstablishment(establishmentId);
    if (!whatsapp) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp integration not configured',
      });
    }

    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: Court, as: 'court' },
        { model: Establishment, as: 'establishment' },
      ],
    });

    if (!booking || booking.establishmentId !== establishmentId) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    const result = await whatsapp.sendBookingReminder(phoneNumber, {
      courtName: booking.court?.name || 'Cancha',
      date: new Date(booking.date).toLocaleDateString('es-AR'),
      startTime: booking.startTime,
      establishmentName: booking.establishment?.name || 'Establecimiento',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error sending booking reminder:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
