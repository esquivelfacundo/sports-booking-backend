/**
 * ARCA Factory - Multi-Tenant Service Factory
 * 
 * Main entry point for ARCA services. Creates service instances
 * with the correct configuration per establishment.
 * 
 * Usage:
 *   const arcaFactory = require('./services/arca/arcaFactory');
 *   const { wsfe, notaCredito } = await arcaFactory.forEstablishment(establishmentId, puntoVentaId);
 *   const resultado = await wsfe.emitirFactura(datos);
 */

const { 
  EstablishmentAfipConfig, 
  EstablishmentAfipPuntoVenta,
  Establishment 
} = require('../../models');

const WSAAService = require('./wsaaService');
const WSFEService = require('./wsfeService');
const NotaCreditoService = require('./notaCreditoService');
const encryptionService = require('./encryptionService');

class ArcaFactory {
  /**
   * Create ARCA services for a specific establishment
   * @param {string} establishmentId - Establishment UUID
   * @param {string} [puntoVentaId] - Optional specific punto de venta UUID. Uses default if not specified.
   * @returns {Promise<{wsfe: WSFEService, notaCredito: NotaCreditoService, config: Object}>}
   */
  static async forEstablishment(establishmentId, puntoVentaId = null) {
    // Get AFIP configuration
    const afipConfig = await EstablishmentAfipConfig.findOne({
      where: { 
        establishmentId,
        isActive: true 
      },
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: ['id', 'name']
      }]
    });

    if (!afipConfig) {
      throw new Error('No hay configuración AFIP activa para este establecimiento');
    }

    if (!afipConfig.isVerified) {
      throw new Error('La configuración AFIP no ha sido verificada. Por favor, pruebe la conexión primero.');
    }

    // Get punto de venta
    let puntoVenta;
    
    if (puntoVentaId) {
      puntoVenta = await EstablishmentAfipPuntoVenta.findOne({
        where: { 
          id: puntoVentaId,
          establishmentId,
          afipConfigId: afipConfig.id,
          isActive: true
        }
      });
      
      if (!puntoVenta) {
        throw new Error('Punto de venta no encontrado o inactivo');
      }
    } else {
      // Get default punto de venta
      puntoVenta = await EstablishmentAfipPuntoVenta.findOne({
        where: { 
          establishmentId,
          afipConfigId: afipConfig.id,
          isDefault: true,
          isActive: true
        }
      });
      
      if (!puntoVenta) {
        // If no default, get any active punto de venta
        puntoVenta = await EstablishmentAfipPuntoVenta.findOne({
          where: { 
            establishmentId,
            afipConfigId: afipConfig.id,
            isActive: true
          }
        });
      }
      
      if (!puntoVenta) {
        throw new Error('No hay puntos de venta configurados para este establecimiento');
      }
    }

    // Build service configuration
    const serviceConfig = {
      establishmentId: afipConfig.establishmentId,
      cuit: afipConfig.cuit,
      encryptedCert: afipConfig.encryptedCert,
      encryptedKey: afipConfig.encryptedKey,
      condicionFiscal: afipConfig.condicionFiscal,
      puntoVenta: puntoVenta.numero
    };

    // Create service instances
    const wsfe = new WSFEService(serviceConfig);
    const notaCredito = new NotaCreditoService(serviceConfig);

    return {
      wsfe,
      notaCredito,
      config: {
        cuit: afipConfig.cuit,
        razonSocial: afipConfig.razonSocial,
        condicionFiscal: afipConfig.condicionFiscal,
        puntoVenta: puntoVenta.numero,
        puntoVentaDescripcion: puntoVenta.descripcion
      }
    };
  }

  /**
   * Test AFIP connection for an establishment
   * @param {string} establishmentId
   * @returns {Promise<{success: boolean, message: string, details?: Object}>}
   */
  static async testConnection(establishmentId) {
    const afipConfig = await EstablishmentAfipConfig.findOne({
      where: { establishmentId }
    });

    if (!afipConfig) {
      return {
        success: false,
        message: 'No hay configuración AFIP para este establecimiento'
      };
    }

    try {
      const wsaaService = new WSAAService({
        establishmentId: afipConfig.establishmentId,
        cuit: afipConfig.cuit,
        encryptedCert: afipConfig.encryptedCert,
        encryptedKey: afipConfig.encryptedKey
      });

      const result = await wsaaService.testConnection();

      // Update config with test result
      await afipConfig.update({
        lastTestedAt: new Date(),
        lastTestResult: result,
        isVerified: result.success
      });

      if (result.success) {
        // Also check WSFE server status
        const wsfe = new WSFEService({
          establishmentId: afipConfig.establishmentId,
          cuit: afipConfig.cuit,
          encryptedCert: afipConfig.encryptedCert,
          encryptedKey: afipConfig.encryptedKey,
          condicionFiscal: afipConfig.condicionFiscal,
          puntoVenta: 1 // Dummy for status check
        });

        const serverStatus = await wsfe.checkServerStatus();

        return {
          success: true,
          message: 'Conexión con AFIP exitosa',
          details: {
            cuit: afipConfig.cuit,
            tokenExpiration: result.expiresAt,
            serverStatus
          }
        };
      }

      return result;

    } catch (error) {
      // Update config with failure
      await afipConfig.update({
        lastTestedAt: new Date(),
        lastTestResult: { success: false, message: error.message },
        isVerified: false
      });

      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get available points of sale from AFIP for an establishment
   * @param {string} establishmentId
   * @returns {Promise<Array>}
   */
  static async getPuntosVentaFromAFIP(establishmentId) {
    const afipConfig = await EstablishmentAfipConfig.findOne({
      where: { establishmentId, isActive: true }
    });

    if (!afipConfig) {
      throw new Error('No hay configuración AFIP activa para este establecimiento');
    }

    const wsfe = new WSFEService({
      establishmentId: afipConfig.establishmentId,
      cuit: afipConfig.cuit,
      encryptedCert: afipConfig.encryptedCert,
      encryptedKey: afipConfig.encryptedKey,
      condicionFiscal: afipConfig.condicionFiscal,
      puntoVenta: 1 // Dummy, not used for this query
    });

    return await wsfe.getPuntosVenta();
  }

  /**
   * Create or update AFIP configuration for an establishment
   * @param {string} establishmentId
   * @param {Object} data
   * @param {string} userId - User making the change
   * @returns {Promise<EstablishmentAfipConfig>}
   */
  static async saveConfiguration(establishmentId, data, userId) {
    // Validate certificates
    if (data.certificado && !encryptionService.isValidCertificate(data.certificado)) {
      throw new Error('El certificado no tiene un formato válido');
    }

    if (data.clavePrivada && !encryptionService.isValidPrivateKey(data.clavePrivada)) {
      throw new Error('La clave privada no tiene un formato válido');
    }

    // Check if config exists
    let afipConfig = await EstablishmentAfipConfig.findOne({
      where: { establishmentId }
    });

    // Prepare update data
    const updateData = {
      cuit: data.cuit,
      razonSocial: data.razonSocial,
      domicilioFiscal: data.domicilioFiscal,
      condicionFiscal: data.condicionFiscal,
      inicioActividades: data.inicioActividades,
      updatedById: userId
    };

    // Only encrypt and update certificates if provided
    if (data.certificado) {
      updateData.encryptedCert = encryptionService.encryptCertificate(data.certificado);
      updateData.certExpiration = encryptionService.getCertificateExpiration(data.certificado);
    }

    if (data.clavePrivada) {
      updateData.encryptedKey = encryptionService.encryptCertificate(data.clavePrivada);
    }

    if (afipConfig) {
      // Update existing
      await afipConfig.update({
        ...updateData,
        isVerified: false // Reset verification when config changes
      });
    } else {
      // Create new
      afipConfig = await EstablishmentAfipConfig.create({
        ...updateData,
        establishmentId,
        isActive: true,
        isVerified: false,
        createdById: userId
      });
    }

    return afipConfig;
  }

  /**
   * Invalidate WSAA cache for an establishment (useful after config change)
   */
  static invalidateCache(establishmentId) {
    WSAAService.invalidateCacheFor(establishmentId);
  }
}

module.exports = ArcaFactory;
