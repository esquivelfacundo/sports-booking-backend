/**
 * Padrón Service - Consulta de contribuyentes AFIP
 * Web Service ws_sr_padron_a13 (Consulta por CUIT)
 * 
 * Permite obtener:
 * - Razón social
 * - Condición IVA (Responsable Inscripto, Monotributista, etc.)
 * - Domicilio fiscal
 * - Estado del contribuyente
 */

const soap = require('soap');
const WSAAService = require('./wsaaService');

// AFIP Production URL for Padrón A13
const PADRON_URL = 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL';
const PADRON_SERVICE = 'ws_sr_padron_a13';

// IVA condition mapping from AFIP codes
const IVA_CONDITIONS = {
  1: { code: 1, name: 'IVA Responsable Inscripto', shortName: 'responsable_inscripto' },
  2: { code: 2, name: 'IVA no Responsable', shortName: 'no_responsable' },
  3: { code: 3, name: 'IVA no Inscripto', shortName: 'no_inscripto' },
  4: { code: 4, name: 'IVA Sujeto Exento', shortName: 'exento' },
  5: { code: 5, name: 'Consumidor Final', shortName: 'consumidor_final' },
  6: { code: 6, name: 'Responsable Monotributo', shortName: 'monotributista' },
  7: { code: 7, name: 'Sujeto no Categorizado', shortName: 'no_categorizado' },
  8: { code: 8, name: 'Proveedor del Exterior', shortName: 'exterior' },
  9: { code: 9, name: 'Cliente del Exterior', shortName: 'cliente_exterior' },
  10: { code: 10, name: 'IVA Liberado - Ley Nº 19.640', shortName: 'liberado' },
  11: { code: 11, name: 'IVA Responsable Inscripto - Agente de Percepción', shortName: 'responsable_inscripto' },
  12: { code: 12, name: 'Pequeño Contribuyente Eventual', shortName: 'eventual' },
  13: { code: 13, name: 'Monotributista Social', shortName: 'monotributista' },
  14: { code: 14, name: 'Pequeño Contribuyente Eventual Social', shortName: 'eventual_social' },
};

// Cache for padrón queries (to avoid excessive AFIP calls)
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
    
    // Create WSAA service for authentication (different service name)
    this.wsaaService = new WSAAService({
      establishmentId: config.establishmentId,
      cuit: config.cuit,
      encryptedCert: config.encryptedCert,
      encryptedKey: config.encryptedKey,
      serviceName: PADRON_SERVICE // Override service name for padrón
    });
    
    this.client = null;
  }

  /**
   * Initialize SOAP client
   */
  async initClient() {
    if (this.client) return this.client;

    try {
      this.client = await soap.createClientAsync(PADRON_URL);
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
    // Normalize CUIT (remove dashes)
    const cuitNormalized = String(cuitConsulta).replace(/-/g, '');
    
    // Validate CUIT format
    if (!/^\d{11}$/.test(cuitNormalized)) {
      throw new Error('CUIT inválido. Debe tener 11 dígitos.');
    }

    // Check cache first
    const cacheKey = `${this.establishmentId}_${cuitNormalized}`;
    const cached = padronCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`[PADRON] Using cached data for CUIT ${cuitNormalized}`);
      return cached.data;
    }

    try {
      const client = await this.initClient();
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

            // Extract IVA condition
            const datosGenerales = persona.datosGenerales;
            const datosRegimenGeneral = persona.datosRegimenGeneral;
            const datosMonotributo = persona.datosMonotributo;

            // Determine IVA condition
            let condicionIvaCode = 5; // Default: Consumidor Final
            let condicionIvaName = 'Consumidor Final';
            let condicionIvaShort = 'consumidor_final';

            // Check if monotributista
            if (datosMonotributo && datosMonotributo.impuesto) {
              condicionIvaCode = 6;
              condicionIvaName = 'Responsable Monotributo';
              condicionIvaShort = 'monotributista';
            }
            // Check impuestos for IVA inscription
            else if (datosRegimenGeneral && datosRegimenGeneral.impuesto) {
              const impuestos = Array.isArray(datosRegimenGeneral.impuesto) 
                ? datosRegimenGeneral.impuesto 
                : [datosRegimenGeneral.impuesto];
              
              // Look for IVA (code 30) or similar
              const tieneIVA = impuestos.some(imp => 
                imp.idImpuesto === 30 || imp.idImpuesto === 32
              );
              
              if (tieneIVA) {
                condicionIvaCode = 1;
                condicionIvaName = 'IVA Responsable Inscripto';
                condicionIvaShort = 'responsable_inscripto';
              }
            }

            // Build response
            const data = {
              cuit: cuitNormalized,
              razonSocial: this.extractRazonSocial(datosGenerales),
              tipoPersona: datosGenerales?.tipoPersona || 'FISICA',
              condicionIva: {
                code: condicionIvaCode,
                name: condicionIvaName,
                shortName: condicionIvaShort
              },
              domicilioFiscal: this.extractDomicilio(datosGenerales?.domicilioFiscal),
              estadoCuit: datosGenerales?.estadoCUIT || 'ACTIVO',
              fechaInscripcion: datosGenerales?.fechaInscripcion,
              actividadPrincipal: this.extractActividad(datosRegimenGeneral?.actividad || datosMonotributo?.actividad)
            };

            // Cache the result
            padronCache.set(cacheKey, {
              data,
              timestamp: Date.now()
            });

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
   * Extract razón social from AFIP response
   */
  extractRazonSocial(datosGenerales) {
    if (!datosGenerales) return 'Sin datos';
    
    // For companies (persona jurídica)
    if (datosGenerales.razonSocial) {
      return datosGenerales.razonSocial;
    }
    
    // For individuals (persona física)
    const nombre = datosGenerales.nombre || '';
    const apellido = datosGenerales.apellido || '';
    return `${apellido}, ${nombre}`.trim().replace(/^,\s*/, '').replace(/,\s*$/, '') || 'Sin datos';
  }

  /**
   * Extract domicilio from AFIP response
   */
  extractDomicilio(domicilio) {
    if (!domicilio) return null;
    
    const parts = [
      domicilio.direccion,
      domicilio.localidad,
      domicilio.provincia?.descripcionProvincia,
      domicilio.codPostal ? `CP ${domicilio.codPostal}` : null
    ].filter(Boolean);
    
    return parts.join(', ') || null;
  }

  /**
   * Extract main activity from AFIP response
   */
  extractActividad(actividades) {
    if (!actividades) return null;
    
    const acts = Array.isArray(actividades) ? actividades : [actividades];
    const principal = acts.find(a => a.orden === 1) || acts[0];
    
    return principal ? {
      codigo: principal.idActividad,
      descripcion: principal.descripcionActividad
    } : null;
  }

  /**
   * Clear cache for a specific CUIT or all
   */
  static clearCache(cuit = null) {
    if (cuit) {
      for (const key of padronCache.keys()) {
        if (key.endsWith(`_${cuit}`)) {
          padronCache.delete(key);
        }
      }
    } else {
      padronCache.clear();
    }
  }
}

module.exports = PadronService;
