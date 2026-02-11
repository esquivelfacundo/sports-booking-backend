/**
 * WhatsApp Notification Service
 * Sends booking notifications directly via WhatsApp Cloud API
 * Uses the approved template "nueva_reserva" (es_AR)
 */

const axios = require('axios');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

/**
 * Normalize an Argentine phone number to E.164 format (+549XXXXXXXXXX)
 * Handles various input formats:
 *   - 3795061706 → +543795061706
 *   - 543795061706 → +543795061706
 *   - +543795061706 → +543795061706
 *   - 1155551234 → +541155551234
 *   - 5491155551234 → +5491155551234
 *   - +5491155551234 → +5491155551234
 */
function normalizeArgentinePhone(phone) {
  if (!phone) return null;

  // Remove all non-digit characters except leading +
  let cleaned = phone.toString().replace(/[^\d+]/g, '');

  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // If starts with 549 (already has country code + mobile prefix)
  if (cleaned.startsWith('549') && cleaned.length >= 12) {
    return '+' + cleaned;
  }

  // If starts with 54 but not 549
  if (cleaned.startsWith('54') && !cleaned.startsWith('549')) {
    return '+' + cleaned;
  }

  // If starts with 0 (local format like 03795061706 or 01155551234)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // If starts with 15 (old mobile prefix), remove it and prepend area code later
  // This case is ambiguous without area code, so we just prepend 54
  if (cleaned.startsWith('15') && cleaned.length === 10) {
    // 15XXXXXXXX → assume Buenos Aires area: 5411XXXXXXXX
    return '+5411' + cleaned.substring(2);
  }

  // At this point we have a local number like 3795061706 or 1155551234
  // Prepend +54
  return '+54' + cleaned;
}

/**
 * Send a WhatsApp template message for a new booking
 * Template: nueva_reserva (es_AR)
 * 
 * Header: Image (QR code URL)
 * Body params: {{1}} clientName, {{2}} establishmentName, {{3}} dateTime,
 *              {{4}} courtName, {{5}} depositPaid, {{6}} pendingBalance
 * Button 0 (URL): "Ver mi turno" → suffix = reserva/{bookingId}
 * Button 1 (URL): "Volver a reservar" → suffix = establishmentSlug
 */
async function sendBookingWhatsApp(bookingData) {
  const {
    clientPhone,
    clientName,
    establishmentName,
    establishmentSlug,
    courtName,
    dateTime,
    depositPaid,
    pendingBalance,
    bookingId,
    qrImageUrl,
  } = bookingData;

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.log('[WhatsApp Notification] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    return { success: false, reason: 'WhatsApp not configured' };
  }

  const recipientPhone = normalizeArgentinePhone(clientPhone);
  if (!recipientPhone) {
    console.log('[WhatsApp Notification] No valid phone number for booking', bookingId);
    return { success: false, reason: 'No valid phone number' };
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'template',
    template: {
      name: 'nueva_reserva',
      language: { code: 'es_AR' },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: { link: qrImageUrl },
            },
          ],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: clientName || 'Cliente' },
            { type: 'text', text: establishmentName },
            { type: 'text', text: dateTime },
            { type: 'text', text: courtName },
            { type: 'text', text: `${depositPaid}` },
            { type: 'text', text: `${pendingBalance}` },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: `reservar/confirmacion?bookingId=${bookingId}` },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '1',
          parameters: [
            { type: 'text', text: establishmentSlug },
          ],
        },
      ],
    },
  };

  try {
    console.log(`[WhatsApp Notification] Sending to ${recipientPhone} for booking ${bookingId}`);

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log(`[WhatsApp Notification] Sent successfully to ${recipientPhone}, message ID: ${response.data?.messages?.[0]?.id}`);
    return { success: true, messageId: response.data?.messages?.[0]?.id };
  } catch (error) {
    const errData = error.response?.data?.error || error.message;
    console.error(`[WhatsApp Notification] Failed to send to ${recipientPhone}:`, JSON.stringify(errData));
    return { success: false, error: errData };
  }
}

/**
 * Send a WhatsApp template message for recurring bookings (turnos fijos)
 * Template: turnos_fijos (es_AR)
 * 
 * Header: Image (MisCanchas logo)
 * Body params: {{1}} clientName, {{2}} establishmentName, {{3}} dayAndTime (e.g. "Martes a las 18:00"),
 *              {{4}} courtName
 */
async function sendRecurringBookingWhatsApp(bookingData) {
  const {
    clientPhone,
    clientName,
    establishmentName,
    courtName,
    dayAndTime,
  } = bookingData;

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.log('[WhatsApp Notification] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    return { success: false, reason: 'WhatsApp not configured' };
  }

  const recipientPhone = normalizeArgentinePhone(clientPhone);
  if (!recipientPhone) {
    console.log('[WhatsApp Notification] No valid phone number for recurring booking');
    return { success: false, reason: 'No valid phone number' };
  }

  const logoUrl = 'https://www.miscanchas.com/assets/logos/miscanchas-whatsapp.png';

  const payload = {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'template',
    template: {
      name: 'turnos_fijos',
      language: { code: 'es_AR' },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: { link: logoUrl },
            },
          ],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: clientName || 'Cliente' },
            { type: 'text', text: establishmentName },
            { type: 'text', text: dayAndTime },
            { type: 'text', text: courtName },
          ],
        },
      ],
    },
  };

  try {
    console.log(`[WhatsApp Notification] Sending recurring booking msg to ${recipientPhone}`);

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log(`[WhatsApp Notification] Recurring booking sent to ${recipientPhone}, message ID: ${response.data?.messages?.[0]?.id}`);
    return { success: true, messageId: response.data?.messages?.[0]?.id };
  } catch (error) {
    const errData = error.response?.data?.error || error.message;
    console.error(`[WhatsApp Notification] Failed to send recurring to ${recipientPhone}:`, JSON.stringify(errData));
    return { success: false, error: errData };
  }
}

module.exports = {
  normalizeArgentinePhone,
  sendBookingWhatsApp,
  sendRecurringBookingWhatsApp,
};
