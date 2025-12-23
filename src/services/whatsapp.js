/**
 * WhatsApp Business API Service
 * Handles sending messages, receiving webhooks, and managing conversations
 */
const axios = require('axios');
const integrationsService = require('./integrations');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

class WhatsAppService {
  /**
   * Creates a WhatsApp service instance for a specific establishment
   * @param {object} config - WhatsApp configuration
   * @param {string} config.accessToken - WhatsApp API access token
   * @param {string} config.phoneNumberId - WhatsApp phone number ID
   * @param {string} config.businessAccountId - WhatsApp business account ID
   * @param {string} config.verifyToken - Webhook verification token
   */
  constructor(config) {
    this.config = config;
    this.client = axios.create({
      baseURL: WHATSAPP_API_URL,
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Creates a WhatsApp service instance for an establishment
   * @param {string} establishmentId - Establishment ID
   * @returns {WhatsAppService|null} WhatsApp service instance or null if not configured
   */
  static async forEstablishment(establishmentId) {
    const config = await integrationsService.getWhatsAppConfig(establishmentId);
    if (!config) {
      return null;
    }
    return new WhatsAppService(config);
  }

  /**
   * Verifies the webhook (GET request from Meta)
   * @param {string} mode - hub.mode parameter
   * @param {string} token - hub.verify_token parameter
   * @param {string} challenge - hub.challenge parameter
   * @returns {string|null} Challenge string if verified, null otherwise
   */
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.config.verifyToken) {
      console.log('WhatsApp webhook verified successfully');
      return challenge;
    }
    console.warn('WhatsApp webhook verification failed', { mode, token });
    return null;
  }

  /**
   * Sends a simple text message
   * @param {string} to - Recipient phone number (with country code, no +)
   * @param {string} text - Message text
   * @returns {object} API response
   */
  async sendTextMessage(to, text) {
    const message = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body: text },
    };

    const response = await this.client.post(
      `/${this.config.phoneNumberId}/messages`,
      message
    );
    
    console.log('WhatsApp text message sent', { to, messageId: response.data.messages?.[0]?.id });
    return response.data;
  }

  /**
   * Sends an interactive button message (max 3 buttons)
   * @param {string} to - Recipient phone number
   * @param {string} body - Message body text
   * @param {Array<{id: string, title: string}>} buttons - Button options (max 3)
   * @param {string} [header] - Optional header text
   * @param {string} [footer] - Optional footer text
   * @returns {object} API response
   */
  async sendButtonMessage(to, body, buttons, header = null, footer = null) {
    if (buttons.length > 3) {
      throw new Error('Maximum 3 buttons allowed');
    }

    const interactiveButtons = buttons.map(btn => ({
      type: 'reply',
      reply: { id: btn.id, title: btn.title.substring(0, 20) },
    }));

    const message = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: { buttons: interactiveButtons },
      },
    };

    if (header) message.interactive.header = { type: 'text', text: header };
    if (footer) message.interactive.footer = { text: footer };

    const response = await this.client.post(
      `/${this.config.phoneNumberId}/messages`,
      message
    );
    
    console.log('WhatsApp button message sent', { to, messageId: response.data.messages?.[0]?.id });
    return response.data;
  }

  /**
   * Sends an interactive list message
   * @param {string} to - Recipient phone number
   * @param {string} body - Message body text
   * @param {string} buttonText - Button text to open list (max 20 chars)
   * @param {Array<{title?: string, rows: Array<{id: string, title: string, description?: string}>}>} sections - List sections
   * @param {string} [header] - Optional header text
   * @param {string} [footer] - Optional footer text
   * @returns {object} API response
   */
  async sendListMessage(to, body, buttonText, sections, header = null, footer = null) {
    const message = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: buttonText.substring(0, 20),
          sections: sections.map(section => ({
            title: section.title?.substring(0, 24),
            rows: section.rows.map(row => ({
              id: row.id,
              title: row.title.substring(0, 24),
              description: row.description?.substring(0, 72),
            })),
          })),
        },
      },
    };

    if (header) message.interactive.header = { type: 'text', text: header };
    if (footer) message.interactive.footer = { text: footer };

    const response = await this.client.post(
      `/${this.config.phoneNumberId}/messages`,
      message
    );
    
    console.log('WhatsApp list message sent', { to, messageId: response.data.messages?.[0]?.id });
    return response.data;
  }

  /**
   * Sends a template message (pre-approved by Meta)
   * @param {string} to - Recipient phone number
   * @param {string} templateName - Template name
   * @param {string} languageCode - Language code (e.g., 'es_AR', 'en_US')
   * @param {Array} [components] - Template components with parameters
   * @returns {object} API response
   */
  async sendTemplateMessage(to, templateName, languageCode, components = null) {
    const message = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components) {
      message.template.components = components;
    }

    const response = await this.client.post(
      `/${this.config.phoneNumberId}/messages`,
      message
    );
    
    console.log('WhatsApp template message sent', { to, templateName, messageId: response.data.messages?.[0]?.id });
    return response.data;
  }

  /**
   * Downloads media content from a message
   * @param {string} mediaId - Media ID from incoming message
   * @returns {Buffer} Media content as buffer
   */
  async downloadMedia(mediaId) {
    // First get the media URL
    const urlResponse = await this.client.get(`/${mediaId}`);
    const mediaUrl = urlResponse.data.url;

    // Then download the actual media
    const mediaResponse = await axios.get(mediaUrl, {
      headers: { 'Authorization': `Bearer ${this.config.accessToken}` },
      responseType: 'arraybuffer',
    });

    return Buffer.from(mediaResponse.data);
  }

  /**
   * Marks a message as read
   * @param {string} messageId - Message ID to mark as read
   */
  async markAsRead(messageId) {
    await this.client.post(`/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
    
    console.log('WhatsApp message marked as read', { messageId });
  }

  /**
   * Parses webhook payload and extracts messages
   * @param {object} payload - Webhook payload from Meta
   * @returns {Array<{message: object, phoneNumberId: string, contactName: string, contactPhone: string}>}
   */
  static parseWebhookPayload(payload) {
    const messages = [];

    if (payload.object !== 'whatsapp_business_account') {
      return messages;
    }

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages' || !change.value?.messages) continue;

        const phoneNumberId = change.value.metadata?.phone_number_id;
        const contacts = change.value.contacts || [];

        for (const message of change.value.messages) {
          const contact = contacts.find(c => c.wa_id === message.from);
          messages.push({
            message,
            phoneNumberId,
            contactName: contact?.profile?.name || 'Unknown',
            contactPhone: message.from,
          });
        }
      }
    }

    return messages;
  }

  /**
   * Extracts text content from an incoming message
   * @param {object} message - Incoming message object
   * @returns {string|null} Message text content
   */
  static extractMessageContent(message) {
    switch (message.type) {
      case 'text':
        return message.text?.body || null;
      case 'interactive':
        if (message.interactive?.type === 'button_reply') {
          return message.interactive.button_reply?.title || null;
        }
        if (message.interactive?.type === 'list_reply') {
          return message.interactive.list_reply?.title || null;
        }
        return null;
      case 'image':
      case 'document':
        return message.image?.caption || message.document?.caption || null;
      default:
        return null;
    }
  }

  /**
   * Gets the selection ID from an interactive reply
   * @param {object} message - Incoming message object
   * @returns {string|null} Selection ID
   */
  static getInteractiveReplyId(message) {
    if (message.type !== 'interactive') return null;
    
    if (message.interactive?.type === 'button_reply') {
      return message.interactive.button_reply?.id || null;
    }
    if (message.interactive?.type === 'list_reply') {
      return message.interactive.list_reply?.id || null;
    }
    return null;
  }

  /**
   * Sends a booking confirmation message
   * @param {string} to - Recipient phone number
   * @param {object} booking - Booking details
   * @returns {object} API response
   */
  async sendBookingConfirmation(to, booking) {
    const { courtName, date, startTime, endTime, totalAmount, establishmentName } = booking;
    
    const body = `✅ *Reserva Confirmada*\n\n` +
      `📍 *${establishmentName}*\n` +
      `🏟️ Cancha: ${courtName}\n` +
      `📅 Fecha: ${date}\n` +
      `🕐 Horario: ${startTime} - ${endTime}\n` +
      `💰 Total: $${totalAmount}\n\n` +
      `¡Te esperamos!`;

    return this.sendTextMessage(to, body);
  }

  /**
   * Sends a booking reminder message
   * @param {string} to - Recipient phone number
   * @param {object} booking - Booking details
   * @returns {object} API response
   */
  async sendBookingReminder(to, booking) {
    const { courtName, date, startTime, establishmentName } = booking;
    
    const body = `⏰ *Recordatorio de Reserva*\n\n` +
      `Tu reserva en *${establishmentName}* es mañana:\n\n` +
      `🏟️ Cancha: ${courtName}\n` +
      `📅 Fecha: ${date}\n` +
      `🕐 Hora: ${startTime}\n\n` +
      `¡No faltes!`;

    return this.sendTextMessage(to, body);
  }

  /**
   * Sends a booking cancellation message
   * @param {string} to - Recipient phone number
   * @param {object} booking - Booking details
   * @returns {object} API response
   */
  async sendBookingCancellation(to, booking) {
    const { courtName, date, startTime, establishmentName, reason } = booking;
    
    let body = `❌ *Reserva Cancelada*\n\n` +
      `Tu reserva en *${establishmentName}* ha sido cancelada:\n\n` +
      `🏟️ Cancha: ${courtName}\n` +
      `📅 Fecha: ${date}\n` +
      `🕐 Hora: ${startTime}`;
    
    if (reason) {
      body += `\n\n📝 Motivo: ${reason}`;
    }

    return this.sendTextMessage(to, body);
  }

  /**
   * Sends available courts for a specific date
   * @param {string} to - Recipient phone number
   * @param {string} date - Date string
   * @param {Array<{id: string, name: string, availableSlots: number}>} courts - Available courts
   * @param {string} establishmentName - Establishment name
   * @returns {object} API response
   */
  async sendAvailableCourts(to, date, courts, establishmentName) {
    if (courts.length === 0) {
      return this.sendTextMessage(
        to,
        `😔 Lo sentimos, no hay canchas disponibles para el ${date} en ${establishmentName}.`
      );
    }

    const sections = [{
      title: 'Canchas Disponibles',
      rows: courts.map(court => ({
        id: `court_${court.id}`,
        title: court.name,
        description: `${court.availableSlots} horarios disponibles`,
      })),
    }];

    return this.sendListMessage(
      to,
      `🏟️ *Canchas disponibles para ${date}*\n\nSelecciona una cancha para ver los horarios:`,
      'Ver Canchas',
      sections,
      establishmentName
    );
  }

  /**
   * Sends available time slots for a court
   * @param {string} to - Recipient phone number
   * @param {string} courtName - Court name
   * @param {string} date - Date string
   * @param {Array<{id: string, time: string, price: number}>} slots - Available time slots
   * @returns {object} API response
   */
  async sendAvailableSlots(to, courtName, date, slots) {
    if (slots.length === 0) {
      return this.sendTextMessage(
        to,
        `😔 No hay horarios disponibles para ${courtName} el ${date}.`
      );
    }

    const sections = [{
      title: 'Horarios',
      rows: slots.slice(0, 10).map(slot => ({
        id: `slot_${slot.id}`,
        title: slot.time,
        description: `$${slot.price}`,
      })),
    }];

    return this.sendListMessage(
      to,
      `🕐 *Horarios disponibles*\n\n🏟️ ${courtName}\n📅 ${date}\n\nSelecciona un horario:`,
      'Ver Horarios',
      sections
    );
  }

  /**
   * Sends booking confirmation request
   * @param {string} to - Recipient phone number
   * @param {object} bookingDetails - Booking details to confirm
   * @returns {object} API response
   */
  async sendBookingConfirmationRequest(to, bookingDetails) {
    const { courtName, date, time, duration, price } = bookingDetails;
    
    const body = `📋 *Confirmar Reserva*\n\n` +
      `🏟️ Cancha: ${courtName}\n` +
      `📅 Fecha: ${date}\n` +
      `🕐 Hora: ${time}\n` +
      `⏱️ Duración: ${duration} minutos\n` +
      `💰 Precio: $${price}\n\n` +
      `¿Deseas confirmar esta reserva?`;

    const buttons = [
      { id: 'confirm_booking', title: '✅ Confirmar' },
      { id: 'cancel_booking', title: '❌ Cancelar' },
    ];

    return this.sendButtonMessage(to, body, buttons);
  }
}

// Add method to get WhatsApp config to integrations service
integrationsService.getWhatsAppConfig = async function(establishmentId) {
  const { EstablishmentIntegration } = require('../models');
  
  const integration = await EstablishmentIntegration.findOne({
    where: {
      establishmentId,
      type: 'WHATSAPP',
      isActive: true,
    },
  });

  if (!integration) {
    return null;
  }

  try {
    const accessToken = this.decrypt(integration.encryptedApiKey);
    
    return {
      accessToken,
      phoneNumberId: integration.phoneNumberId,
      businessAccountId: integration.businessAccountId,
      verifyToken: integration.verifyToken,
    };
  } catch (error) {
    console.error('Failed to get WhatsApp config:', error);
    return null;
  }
};

module.exports = WhatsAppService;
