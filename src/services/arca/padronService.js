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
      console.log(`[PADRON] Initializing SOAP client...`);
      console.log(`[PADRON] WSDL URL: ${PADRON_WSDL}`);
      this.client = await soap.createClientAsync(PADRON_WSDL);
      console.log(`[PADRON] SOAP client initialized successfully`);
      
      // Log available methods
      const methods = Object.keys(this.client.describe()?.PersonaServiceA13Soap?.PersonaServiceA13Soap || {});
      console.log(`[PADRON] Available methods: ${methods.join(', ')}`);
      
      return this.client;
    } catch (error) {
      console.error(`[PADRON] Error initializing SOAP client:`, error.message);
      console.error(`[PADRON] Error stack:`, error.stack);
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
      console.log(`[PADRON] Getting credentials for service: ${PADRON_SERVICE}`);
      const credentials = await this.wsaaService.getCredentials(PADRON_SERVICE);
      console.log(`[PADRON] Credentials obtained:`);
      console.log(`  - Token (first 50 chars): ${credentials.token?.substring(0, 50)}...`);
      console.log(`  - Sign (first 50 chars): ${credentials.sign?.substring(0, 50)}...`);

      const params = {
        token: credentials.token,
        sign: credentials.sign,
        cuitRepresentada: this.cuit,
        idPersona: cuitNormalized
      };

      console.log(`[PADRON] SOAP Request params:`);
      console.log(`  - cuitRepresentada: ${params.cuitRepresentada}`);
      console.log(`  - idPersona: ${params.idPersona}`);
      console.log(`[PADRON] Calling getPersona()...`);

      return new Promise((resolve, reject) => {
        client.getPersona(params, (err, result) => {
          if (err) {
            console.error(`[PADRON] SOAP error:`, err.message);
            console.error(`[PADRON] SOAP error details:`, JSON.stringify(err, null, 2));
            return reject(new Error(`Error consultando AFIP: ${err.message}`));
          }

          try {
            console.log(`[PADRON] Raw SOAP response:`);
            console.log(JSON.stringify(result, null, 2));
            
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
   * Note: AFIP returns data directly in persona object, not in datosGenerales
   */
  parsePersonaResponse(persona, cuit) {
    console.log('[PADRON] Parsing persona response...');
    
    // AFIP returns data directly in persona object
    // razonSocial for companies, apellido+nombre for individuals
    let razonSocial = persona.razonSocial || '';
    if (!razonSocial) {
      const apellido = persona.apellido || '';
      const nombre = persona.nombre || '';
      razonSocial = apellido && nombre ? `${apellido}, ${nombre}` : (apellido || nombre || 'Sin datos');
    }
    console.log(`[PADRON] Razón social: ${razonSocial}`);

    // Tipo persona
    const tipoPersona = persona.tipoPersona || 'FISICA';
    console.log(`[PADRON] Tipo persona: ${tipoPersona}`);

    // Build domicilio from domicilio array
    const domicilioFiscal = this.buildDomicilioFromArray(persona.domicilio);
    console.log(`[PADRON] Domicilio: ${domicilioFiscal}`);

    // Get actividad principal
    const actividadPrincipal = persona.descripcionActividadPrincipal ? {
      codigo: persona.idActividadPrincipal,
      descripcion: persona.descripcionActividadPrincipal
    } : null;
    console.log(`[PADRON] Actividad: ${actividadPrincipal?.descripcion || 'N/A'}`);

    // Determine IVA condition from impuesto array
    const condicionIva = this.determineCondicionIvaFromPersona(persona);
    console.log(`[PADRON] Condición IVA: ${condicionIva.name}`);

    return {
      cuit,
      razonSocial,
      tipoPersona,
      condicionIva,
      domicilioFiscal,
      estadoCuit: persona.estadoClave || persona.estadoCuit || 'ACTIVO',
      fechaInscripcion: persona.fechaContratoSocial || null,
      actividadPrincipal,
      formaJuridica: persona.formaJuridica || null,
      // Include raw data for debugging
      _raw: persona
    };
  }

  /**
   * Determine IVA condition from persona object
   * ws_sr_padron_a13 doesn't always return impuesto array, so we use heuristics
   */
  determineCondicionIvaFromPersona(persona) {
    // First check if we have impuesto array
    const impuestos = persona.impuesto || [];
    const impuestosArr = Array.isArray(impuestos) ? impuestos : (impuestos ? [impuestos] : []);
    
    console.log(`[PADRON] Checking ${impuestosArr.length} impuestos...`);
    
    if (impuestosArr.length > 0) {
      // Log all impuestos for debugging
      impuestosArr.forEach((imp, i) => {
        console.log(`[PADRON]   Impuesto ${i}: id=${imp.idImpuesto}, desc=${imp.descripcionImpuesto}, estado=${imp.estado}`);
      });
      
      // Check for Monotributo (id 20)
      const tieneMonotributo = impuestosArr.some(imp => 
        imp.idImpuesto === 20 && imp.estado === 'ACTIVO'
      );
      
      if (tieneMonotributo) {
        return {
          code: 6,
          name: 'Responsable Monotributo',
          shortName: 'monotributista'
        };
      }

      // Check for IVA (id 30)
      const tieneIVA = impuestosArr.some(imp => 
        imp.idImpuesto === 30 && imp.estado === 'ACTIVO'
      );
      
      if (tieneIVA) {
        return {
          code: 1,
          name: 'IVA Responsable Inscripto',
          shortName: 'responsable_inscripto'
        };
      }

      // Check for IVA Exento (id 32)
      const tieneExento = impuestosArr.some(imp => 
        imp.idImpuesto === 32 && imp.estado === 'ACTIVO'
      );
      
      if (tieneExento) {
        return {
          code: 4,
          name: 'IVA Sujeto Exento',
          shortName: 'exento'
        };
      }
    }

    // HEURISTIC: ws_sr_padron_a13 doesn't return impuesto array for all CUITs
    // Use persona type and activity to infer IVA condition
    console.log(`[PADRON] No impuesto array, using heuristics...`);
    console.log(`[PADRON]   tipoPersona: ${persona.tipoPersona}`);
    console.log(`[PADRON]   formaJuridica: ${persona.formaJuridica}`);
    console.log(`[PADRON]   idActividadPrincipal: ${persona.idActividadPrincipal}`);
    
    // Persona JURIDICA (SA, SRL, etc.) with economic activity = Responsable Inscripto
    if (persona.tipoPersona === 'JURIDICA' && persona.idActividadPrincipal) {
      console.log(`[PADRON] Heuristic: JURIDICA with activity -> Responsable Inscripto`);
      return {
        code: 1,
        name: 'IVA Responsable Inscripto',
        shortName: 'responsable_inscripto'
      };
    }

    // Persona FISICA with activity could be Monotributista or RI
    // We'll default to Monotributista for individuals with activity
    if (persona.tipoPersona === 'FISICA' && persona.idActividadPrincipal) {
      console.log(`[PADRON] Heuristic: FISICA with activity -> Monotributista (default)`);
      return {
        code: 6,
        name: 'Responsable Monotributo',
        shortName: 'monotributista'
      };
    }

    // Default: Consumidor Final
    console.log(`[PADRON] Heuristic: No activity -> Consumidor Final`);
    return {
      code: 5,
      name: 'Consumidor Final',
      shortName: 'consumidor_final'
    };
  }

  /**
   * Build domicilio string from AFIP domicilio array
   */
  buildDomicilioFromArray(domicilios) {
    if (!domicilios || !Array.isArray(domicilios)) return null;
    
    // Find FISCAL domicilio first, then LEGAL/REAL
    const fiscal = domicilios.find(d => d.tipoDomicilio === 'FISCAL') ||
                   domicilios.find(d => d.tipoDomicilio === 'LEGAL/REAL') ||
                   domicilios[0];
    
    if (!fiscal) return null;
    
    const parts = [
      fiscal.direccion,
      fiscal.descripcionProvincia,
      fiscal.codigoPostal ? `CP ${fiscal.codigoPostal}` : null
    ].filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : null;
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
