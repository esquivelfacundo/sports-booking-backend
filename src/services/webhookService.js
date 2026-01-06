/**
 * Webhook Service
 * Handles sending booking data to external webhooks (Make.com, etc.)
 */

const { PlatformConfig, Booking, Establishment, Court, Client, User } = require('../models');

class WebhookService {
  /**
   * Get webhook configuration from PlatformConfig
   */
  static async getWebhookConfig() {
    const config = await PlatformConfig.getConfig();
    return config.settings?.webhooks?.make || null;
  }

  /**
   * Save webhook configuration to PlatformConfig
   */
  static async saveWebhookConfig(webhookConfig) {
    const config = await PlatformConfig.getConfig();
    const currentSettings = config.settings || {};
    
    await config.update({
      settings: {
        ...currentSettings,
        webhooks: {
          ...currentSettings.webhooks,
          make: {
            url: webhookConfig.url,
            isActive: webhookConfig.isActive,
            lastTestAt: webhookConfig.lastTestAt || null,
            lastTestStatus: webhookConfig.lastTestStatus || null,
            updatedAt: new Date()
          }
        }
      }
    });

    return this.getWebhookConfig();
  }

  /**
   * Build payload for booking notification
   */
  static async buildBookingPayload(bookingId) {
    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'address', 'phone', 'email', 'city']
        },
        {
          model: Court,
          as: 'court',
          attributes: ['id', 'name', 'sportType']
        },
        {
          model: Client,
          as: 'client',
          attributes: ['id', 'name', 'phone', 'email']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'email']
        }
      ]
    });

    if (!booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    // Determine player info (client or user)
    let playerInfo = {};
    if (booking.client) {
      playerInfo = {
        name: booking.client.name,
        phone: booking.client.phone || '',
        email: booking.client.email || ''
      };
    } else if (booking.user) {
      playerInfo = {
        name: `${booking.user.firstName} ${booking.user.lastName}`.trim(),
        phone: booking.user.phone || '',
        email: booking.user.email || ''
      };
    } else if (booking.playerName) {
      playerInfo = {
        name: booking.playerName,
        phone: booking.playerPhone || '',
        email: ''
      };
    }

    // Calculate amounts
    const totalPrice = parseFloat(booking.totalPrice) || 0;
    const amountPaid = parseFloat(booking.amountPaid) || 0;
    const pendingAmount = totalPrice - amountPaid;

    // Build QR URL
    const baseUrl = process.env.FRONTEND_URL || 'https://www.mismatchs.com';
    const qrCodeUrl = `${baseUrl}/reserva/${booking.id}/qr`;

    return {
      type: 'booking_confirmed',
      timestamp: new Date().toISOString(),
      establishment: {
        id: booking.establishment?.id,
        name: booking.establishment?.name || '',
        address: booking.establishment?.address || '',
        city: booking.establishment?.city || '',
        phone: booking.establishment?.phone || '',
        email: booking.establishment?.email || ''
      },
      player: playerInfo,
      booking: {
        id: booking.id,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        courtName: booking.court?.name || '',
        sportType: booking.court?.sportType || '',
        totalPrice: totalPrice,
        amountPaid: amountPaid,
        pendingAmount: pendingAmount,
        status: booking.status,
        qrCodeUrl: qrCodeUrl,
        notes: booking.notes || ''
      }
    };
  }

  /**
   * Build test payload with mock data
   */
  static buildTestPayload() {
    return {
      type: 'booking_confirmed',
      timestamp: new Date().toISOString(),
      isTest: true,
      establishment: {
        id: 'test-est-123',
        name: 'Establecimiento de Prueba',
        address: 'Av. Siempre Viva 742',
        city: 'Buenos Aires',
        phone: '+54 11 1234-5678',
        email: 'test@establecimiento.com'
      },
      player: {
        name: 'Juan Pérez',
        phone: '+54 9 11 9876-5432',
        email: 'juan.perez@email.com'
      },
      booking: {
        id: 'test-booking-456',
        date: new Date().toISOString().split('T')[0],
        startTime: '18:00',
        endTime: '19:00',
        courtName: 'Cancha 1',
        sportType: 'padel',
        totalPrice: 15000,
        amountPaid: 5000,
        pendingAmount: 10000,
        status: 'confirmed',
        qrCodeUrl: 'https://www.mismatchs.com/reserva/test-booking-456/qr',
        notes: 'Reserva de prueba - esto es un test'
      }
    };
  }

  /**
   * Send payload to webhook URL
   */
  static async sendToWebhook(url, payload) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const success = response.ok;
      let responseData = null;
      
      try {
        responseData = await response.text();
      } catch (e) {
        // Ignore parse errors
      }

      return {
        success,
        status: response.status,
        statusText: response.statusText,
        response: responseData
      };
    } catch (error) {
      console.error('[WebhookService] Error sending to webhook:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send booking notification to Make.com webhook
   */
  static async sendBookingNotification(bookingId) {
    try {
      const webhookConfig = await this.getWebhookConfig();
      
      if (!webhookConfig || !webhookConfig.isActive || !webhookConfig.url) {
        console.log('[WebhookService] Webhook not configured or inactive');
        return { skipped: true, reason: 'Webhook not configured or inactive' };
      }

      const payload = await this.buildBookingPayload(bookingId);
      const result = await this.sendToWebhook(webhookConfig.url, payload);

      console.log(`[WebhookService] Booking notification sent for ${bookingId}:`, result.success ? 'SUCCESS' : 'FAILED');
      
      return result;
    } catch (error) {
      console.error('[WebhookService] Error sending booking notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send test notification to webhook
   */
  static async sendTestNotification(webhookUrl) {
    try {
      const payload = this.buildTestPayload();
      const result = await this.sendToWebhook(webhookUrl, payload);

      // Update last test status in config
      const currentConfig = await this.getWebhookConfig();
      if (currentConfig) {
        await this.saveWebhookConfig({
          ...currentConfig,
          lastTestAt: new Date(),
          lastTestStatus: result.success ? 'success' : 'error'
        });
      }

      return result;
    } catch (error) {
      console.error('[WebhookService] Error sending test notification:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = WebhookService;
