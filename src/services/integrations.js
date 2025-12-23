/**
 * Integrations Service
 * Handles management of external integrations (OpenAI, WhatsApp)
 * with encrypted API key storage and connection testing
 */
const crypto = require('crypto');
const { EstablishmentIntegration } = require('../models');

// Encryption configuration
const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || 'default-key-change-in-production-32!';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

class IntegrationsService {
  /**
   * Encrypts a value using AES-256-GCM
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted text in format: iv:authTag:encrypted (hex)
   */
  encrypt(text) {
    // Ensure key is 32 bytes
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts a value encrypted with AES-256-GCM
   * @param {string} encryptedText - Encrypted text in format iv:authTag:encrypted
   * @returns {string} Original decrypted text
   */
  decrypt(encryptedText) {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Masks an API key for display in UI
   * Shows only first 4 and last 4 characters
   * @param {string} apiKey - Full API key
   * @returns {string} Masked API key (e.g., "sk-p...xyz1")
   */
  maskApiKey(apiKey) {
    if (!apiKey || apiKey.length <= 8) {
      return '****';
    }
    return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
  }

  /**
   * Creates or updates an integration
   * @param {string} establishmentId - Establishment ID
   * @param {string} userId - User ID performing the action
   * @param {object} data - Integration data
   * @returns {object} Created/updated integration with masked API key
   */
  async upsert(establishmentId, userId, data) {
    const { type, apiKey, phoneNumberId, businessAccountId, verifyToken, config } = data;

    // Encrypt API key
    const encryptedApiKey = this.encrypt(apiKey);

    // Find existing integration
    const existing = await EstablishmentIntegration.findOne({
      where: { establishmentId, type }
    });

    let integration;

    if (existing) {
      // Update existing
      integration = await existing.update({
        encryptedApiKey,
        phoneNumberId: type === 'WHATSAPP' ? phoneNumberId : null,
        businessAccountId: type === 'WHATSAPP' ? businessAccountId : null,
        verifyToken: type === 'WHATSAPP' ? verifyToken : null,
        config: config || {},
        updatedById: userId,
        // Reset test status when credentials change
        lastTestedAt: null,
        lastTestSuccess: null
      });
      console.log(`Integration updated: ${type} for establishment ${establishmentId}`);
    } else {
      // Create new
      integration = await EstablishmentIntegration.create({
        establishmentId,
        type,
        encryptedApiKey,
        phoneNumberId: type === 'WHATSAPP' ? phoneNumberId : null,
        businessAccountId: type === 'WHATSAPP' ? businessAccountId : null,
        verifyToken: type === 'WHATSAPP' ? verifyToken : null,
        config: config || {},
        createdById: userId,
        updatedById: userId,
        isActive: true
      });
      console.log(`Integration created: ${type} for establishment ${establishmentId}`);
    }

    // Return with masked API key
    return {
      ...integration.toJSON(),
      maskedApiKey: this.maskApiKey(apiKey),
      encryptedApiKey: undefined // Don't expose encrypted value
    };
  }

  /**
   * Gets all integrations for an establishment
   * @param {string} establishmentId - Establishment ID
   * @returns {array} Integrations with masked API keys
   */
  async findAll(establishmentId) {
    const integrations = await EstablishmentIntegration.findAll({
      where: { establishmentId },
      order: [['type', 'ASC']]
    });

    return integrations.map(integration => {
      let maskedApiKey = '****';
      try {
        const decrypted = this.decrypt(integration.encryptedApiKey);
        maskedApiKey = this.maskApiKey(decrypted);
      } catch (error) {
        console.error('Failed to decrypt API key for masking:', error);
      }

      return {
        ...integration.toJSON(),
        maskedApiKey,
        encryptedApiKey: undefined
      };
    });
  }

  /**
   * Gets an integration by type
   * @param {string} establishmentId - Establishment ID
   * @param {string} type - Integration type (OPENAI, WHATSAPP)
   * @returns {object|null} Integration with masked API key
   */
  async findByType(establishmentId, type) {
    const integration = await EstablishmentIntegration.findOne({
      where: { establishmentId, type }
    });

    if (!integration) {
      return null;
    }

    let maskedApiKey = '****';
    try {
      const decrypted = this.decrypt(integration.encryptedApiKey);
      maskedApiKey = this.maskApiKey(decrypted);
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
    }

    return {
      ...integration.toJSON(),
      maskedApiKey,
      encryptedApiKey: undefined
    };
  }

  /**
   * Gets decrypted API key (for internal use only)
   * NEVER expose this in API responses
   * @param {string} establishmentId - Establishment ID
   * @param {string} type - Integration type
   * @returns {string|null} Decrypted API key
   */
  async getDecryptedApiKey(establishmentId, type) {
    const integration = await EstablishmentIntegration.findOne({
      where: { establishmentId, type, isActive: true }
    });

    if (!integration) {
      return null;
    }

    try {
      return this.decrypt(integration.encryptedApiKey);
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      return null;
    }
  }

  /**
   * Toggles an integration's active status
   * @param {string} establishmentId - Establishment ID
   * @param {string} type - Integration type
   * @param {string} userId - User ID performing the action
   * @returns {object} Updated integration
   */
  async toggle(establishmentId, type, userId) {
    const integration = await EstablishmentIntegration.findOne({
      where: { establishmentId, type }
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    await integration.update({
      isActive: !integration.isActive,
      updatedById: userId
    });

    console.log(`Integration toggled: ${type} for establishment ${establishmentId}, active: ${integration.isActive}`);

    return {
      ...integration.toJSON(),
      maskedApiKey: '****',
      encryptedApiKey: undefined
    };
  }

  /**
   * Deletes an integration
   * @param {string} establishmentId - Establishment ID
   * @param {string} type - Integration type
   * @returns {boolean} Success
   */
  async delete(establishmentId, type) {
    const integration = await EstablishmentIntegration.findOne({
      where: { establishmentId, type }
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    await integration.destroy();
    console.log(`Integration deleted: ${type} for establishment ${establishmentId}`);

    return true;
  }

  /**
   * Tests an integration's connection
   * @param {string} establishmentId - Establishment ID
   * @param {string} type - Integration type
   * @returns {object} Test result with success, message, and details
   */
  async testConnection(establishmentId, type) {
    const integration = await EstablishmentIntegration.findOne({
      where: { establishmentId, type }
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    let success = false;
    let message = '';
    let details = {};

    try {
      const apiKey = this.decrypt(integration.encryptedApiKey);

      if (type === 'OPENAI') {
        // Test OpenAI connection
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey });
        
        const response = await openai.models.list();
        
        // Check for GPT-4 Vision access
        const hasVision = response.data.some(
          model => model.id.includes('gpt-4') && 
                   (model.id.includes('vision') || model.id.includes('gpt-4o'))
        );

        success = true;
        message = hasVision 
          ? 'Conexión exitosa. Acceso a GPT-4 Vision confirmado.'
          : 'Conexión exitosa, pero no se detectó acceso a GPT-4 Vision.';
        details = {
          modelsAvailable: response.data.length,
          hasVisionAccess: hasVision
        };
      } else if (type === 'WHATSAPP') {
        // Test WhatsApp connection
        const axios = require('axios');
        
        if (!integration.phoneNumberId) {
          throw new Error('Phone Number ID es requerido para WhatsApp');
        }

        const response = await axios.get(
          `https://graph.facebook.com/v18.0/${integration.phoneNumberId}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`
            }
          }
        );

        success = true;
        message = 'Conexión exitosa con WhatsApp Business API.';
        details = {
          phoneNumber: response.data.display_phone_number,
          verifiedName: response.data.verified_name,
          qualityRating: response.data.quality_rating
        };
      }
    } catch (error) {
      success = false;
      
      if (error.response) {
        message = `Error de conexión: ${error.response.data?.error?.message || error.message}`;
        details = { statusCode: error.response.status };
      } else {
        message = `Error: ${error.message}`;
      }
      
      console.error('Integration test failed:', error);
    }

    // Update test status in database
    await integration.update({
      lastTestedAt: new Date(),
      lastTestSuccess: success
    });

    return { success, message, details };
  }
}

module.exports = new IntegrationsService();
