/**
 * Padrón Service - Consulta de contribuyentes AFIP
 * Web Service ws_sr_padron_a13 (Consulta por CUIT)
 * 
 * Permite obtener:
 * - Razón social
 * - Condición IVA (Responsable Inscripto, Monotributista, etc.)
 * - Domicilio fiscal
 * - Actividades
 */

const soap = require('soap');
const WSAAService = require('./wsaaService');

// AFIP Production URL for Padrón A13
const PADRON_WSDL = 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL';
const PADRON_SERVICE = 'ws_sr_padron_a13';

// Cache for padrón queries
const padronCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class PadronService {
  /**
   * @param {Object} config - AFIP configuration
   * @param {string} config.establishmentId
   * @param {string} config.cuit - CUIT del establecimiento (para autenticación)
   * @param {string} config.encryptedCert
   * @param {string} config.encryptedKey
   */
  constructor(config) {
    this.establishmentId = config.establishmentId;
    this.cuit = config.cuit;
    
    // Create WSAA service for authentication
    this.wsaaService = new WSAAService({
      establishmentId: config.establishmentId,
      cuit: config.cuit,
      encryptedCert: config.encryptedCert,
      encryptedKey: config.encryptedKey
    });
    
    this.client = null;
  }

  /**
   * Initialize SOAP client
   */
  async initClient() {
    if (this.client) return this.client;

    try {
      this.client = await soap.createClientAsync(PADRON_WSDL);
      console.log(`[PADRON] SOAP client initialized`);
      return this.client;
    } catch (error) {
      console.error(`[PADRON] Error initializing SOAP client:`, error.message);
      throw new Error(`Error conectando con AFIP Padrón: ${error.message}`);
    }
  }

  /**
   * Consultar datos de un CUIT en el padrón de AFIP
   * @param {string} cuitConsulta - CUIT a consultar
   * @returns {Promise<Object>} Datos del contribuyente
   */
  async consultarCuit(cuitConsulta) {
    // Normalize CUIT (remove dashes and spaces)
    const cuitNormalized = String(cuitConsulta).replace(/[-\s]/g, '');
    
    // Validate CUIT format
    if (!/^\d{11}$/.test(cuitNormalized)) {
      throw new Error('CUIT inválido. Debe tener 11 dígitos.');
    }

    // Check cache first
    const cacheKey = `padron_${cuitNormalized}`;
    const cached = padronCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`[PADRON] Using cached data for CUIT ${cuitNormalized}`);
      return cached.data;
    }

    try {
      const client = await this.initClient();
      
      // Get credentials for padrón service specifically
      const credentials = await this.wsaaService.getCredentials(PADRON_SERVICE);

      const params = {
        token: credentials.token,
        sign: credentials.sign,
        cuitRepresentada: this.cuit,
        idPersona: cuitNormalized
      };

      console.log(`[PADRON] Consulting CUIT ${cuitNormalized}...`);

      return new Promise((resolve, reject) => {
        client.getPersona(params, (err, result) => {
          if (err) {
            console.error(`[PADRON] SOAP error:`, err.message);
            return reject(new Error(`Error consultando AFIP: ${err.message}`));
          }

          try {
            const persona = result?.personaReturn?.persona;
            
            if (!persona) {
              return reject(new Error('CUIT no encontrado en el padrón de AFIP'));
            }

            const data = this.parsePersonaResponse(persona, cuitNormalized);

            // Cache the result
            padronCache.set(cacheKey, { data, timestamp: Date.now() });

            console.log(`[PADRON] Found: ${data.razonSocial} - ${data.condicionIva.name}`);
            resolve(data);

          } catch (parseError) {
            console.error(`[PADRON] Error parsing response:`, parseError.message);
            reject(new Error('Error procesando respuesta de AFIP'));
          }
        });
      });

    } catch (error) {
      console.error(`[PADRON] Error:`, error.message);
      throw error;
    }
  }

  /**
   * Parse AFIP persona response
   */
  parsePersonaResponse(persona, cuit) {
    const datosGenerales = persona.datosGenerales || {};
    const datosRegimenGeneral = persona.datosRegimenGeneral || {};
    const datosMonotributo = persona.datosMonotributo || {};

    // Determine IVA condition
    let condicionIva = this.determineCondicionIva(datosRegimenGeneral, datosMonotributo);

    // Build razón social
    let razonSocial = datosGenerales.razonSocial || '';
    if (!razonSocial) {
      const apellido = datosGenerales.apellido || '';
      const nombre = datosGenerales.nombre || '';
      razonSocial = apellido && nombre ? `${apellido}, ${nombre}` : (apellido || nombre || 'Sin datos');
    }

    // Build domicilio
    const domicilioFiscal = this.buildDomicilio(datosGenerales.domicilioFiscal);

    // Get actividad principal
    const actividadPrincipal = this.getActividadPrincipal(
      datosRegimenGeneral.actividad || datosMonotributo.actividad
    );

    return {
      cuit,
      razonSocial,
      tipoPersona: datosGenerales.tipoPersona || 'FISICA',
      condicionIva,
      domicilioFiscal,
      estadoCuit: datosGenerales.estadoCUIT || 'ACTIVO',
      fechaInscripcion: datosGenerales.fechaInscripcion || null,
      actividadPrincipal,
      // Include raw data for debugging
      _raw: {
        datosGenerales,
        datosRegimenGeneral: Object.keys(datosRegimenGeneral).length > 0 ? datosRegimenGeneral : null,
        datosMonotributo: Object.keys(datosMonotributo).length > 0 ? datosMonotributo : null
      }
    };
  }

  /**
   * Determine IVA condition from AFIP data
   */
  determineCondicionIva(datosRegimenGeneral, datosMonotributo) {
    // Check if monotributista (has monotributo data with active impuesto)
    if (datosMonotributo && datosMonotributo.impuesto) {
      const impuestos = Array.isArray(datosMonotributo.impuesto) 
        ? datosMonotributo.impuesto 
        : [datosMonotributo.impuesto];
      
      const tieneMonotributo = impuestos.some(imp => 
        imp.idImpuesto === 20 || imp.descripcionImpuesto?.toLowerCase().includes('monotributo')
      );
      
      if (tieneMonotributo) {
        return {
          code: 6,
          name: 'Responsable Monotributo',
          shortName: 'monotributista'
        };
      }
    }

    // Check for IVA inscription in régimen general
    if (datosRegimenGeneral && datosRegimenGeneral.impuesto) {
      const impuestos = Array.isArray(datosRegimenGeneral.impuesto) 
        ? datosRegimenGeneral.impuesto 
        : [datosRegimenGeneral.impuesto];
      
      // Look for IVA (code 30) 
      const tieneIVA = impuestos.some(imp => imp.idImpuesto === 30);
      
      if (tieneIVA) {
        return {
          code: 1,
          name: 'IVA Responsable Inscripto',
          shortName: 'responsable_inscripto'
        };
      }
    }

    // Default: Consumidor Final
    return {
      code: 5,
      name: 'Consumidor Final',
      shortName: 'consumidor_final'
    };
  }

  /**
   * Build domicilio string from AFIP data
   */
  buildDomicilio(domicilio) {
    if (!domicilio) return null;
    
    const parts = [
      domicilio.direccion,
      domicilio.localidad,
      domicilio.descripcionProvincia || domicilio.provincia,
      domicilio.codPostal ? `CP ${domicilio.codPostal}` : null
    ].filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Get actividad principal
   */
  getActividadPrincipal(actividades) {
    if (!actividades) return null;
    
    const acts = Array.isArray(actividades) ? actividades : [actividades];
    const principal = acts.find(a => a.orden === 1) || acts[0];
    
    if (!principal) return null;
    
    return {
      codigo: principal.idActividad,
      descripcion: principal.descripcionActividad
    };
  }

  /**
   * Clear cache
   */
  static clearCache(cuit = null) {
    if (cuit) {
      padronCache.delete(`padron_${cuit.replace(/[-\s]/g, '')}`);
    } else {
      padronCache.clear();
    }
  }
}

module.exports = PadronService;
