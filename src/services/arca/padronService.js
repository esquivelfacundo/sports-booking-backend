/**
 * Padrón Service - Consulta de contribuyentes
 * Usa API pública para consultar datos de CUIT sin necesidad de habilitación en AFIP
 * 
 * Permite obtener:
 * - Razón social
 * - Condición IVA (Responsable Inscripto, Monotributista, etc.)
 * - Tipo de persona (Física/Jurídica)
 */

// Cache for padrón queries (to avoid excessive API calls)
const padronCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class PadronService {
  /**
   * @param {Object} config - Configuration (not needed for public API, kept for compatibility)
   */
  constructor(config = {}) {
    this.establishmentId = config.establishmentId || 'default';
  }

  /**
   * Consultar datos de un CUIT usando API pública
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

    console.log(`[PADRON] Consulting CUIT ${cuitNormalized} via public API...`);

    try {
      // Try primary API: cuitonline
      const data = await this.consultarCuitOnline(cuitNormalized);
      
      // Cache the result
      padronCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      console.log(`[PADRON] Found: ${data.razonSocial} - ${data.condicionIva.name}`);
      return data;

    } catch (error) {
      console.error(`[PADRON] Error:`, error.message);
      throw error;
    }
  }

  /**
   * Consultar usando API de cuitonline (scraping-friendly)
   */
  async consultarCuitOnline(cuit) {
    try {
      const response = await fetch(`https://www.cuitonline.com/detalle/${cuit}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ARCA-Integration/1.0)',
          'Accept': 'text/html'
        }
      });

      if (!response.ok) {
        throw new Error('No se pudo consultar el CUIT');
      }

      const html = await response.text();
      return this.parseCuitOnlineHtml(html, cuit);
    } catch (error) {
      // Fallback to alternative API
      return this.consultarTangoFactura(cuit);
    }
  }

  /**
   * Parse HTML response from cuitonline
   */
  parseCuitOnlineHtml(html, cuit) {
    // Extract razón social
    const nombreMatch = html.match(/<h1[^>]*class="[^"]*denominacion[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                        html.match(/<div[^>]*class="[^"]*razon-social[^"]*"[^>]*>([^<]+)<\/div>/i) ||
                        html.match(/<title>([^-|<]+)/i);
    
    let razonSocial = nombreMatch ? nombreMatch[1].trim() : null;
    
    // Clean up razón social
    if (razonSocial) {
      razonSocial = razonSocial
        .replace(/CUIT.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Detect condición IVA from HTML content
    const htmlLower = html.toLowerCase();
    let condicionIva = this.detectCondicionIva(htmlLower);

    // Detect tipo persona
    const tipoPersona = cuit.startsWith('30') || cuit.startsWith('33') || cuit.startsWith('34') 
      ? 'JURIDICA' 
      : 'FISICA';

    if (!razonSocial || razonSocial.length < 2) {
      throw new Error('CUIT no encontrado');
    }

    return {
      cuit,
      razonSocial,
      tipoPersona,
      condicionIva,
      domicilioFiscal: null,
      estadoCuit: 'ACTIVO'
    };
  }

  /**
   * Fallback: consultar usando API de TangoFactura
   */
  async consultarTangoFactura(cuit) {
    try {
      const response = await fetch(`https://afip.tangofactura.com/Rest/GetContribuyenteFull?cuit=${cuit}`, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('No se pudo consultar el CUIT');
      }

      const data = await response.json();
      
      if (!data || data.errorGetData) {
        throw new Error('CUIT no encontrado');
      }

      // Map response to our format
      const condicionIva = this.mapTangoCondicionIva(data.idTipoContribuyente);
      const tipoPersona = data.tipoPersona === 'JURIDICA' ? 'JURIDICA' : 'FISICA';

      return {
        cuit,
        razonSocial: data.razonSocial || data.apellido + ', ' + data.nombre || 'Sin datos',
        tipoPersona,
        condicionIva,
        domicilioFiscal: data.domicilioFiscal || null,
        estadoCuit: data.estadoCuit || 'ACTIVO'
      };
    } catch (error) {
      console.error(`[PADRON] TangoFactura error:`, error.message);
      throw new Error('No se pudo consultar el CUIT');
    }
  }

  /**
   * Detect condición IVA from HTML content
   */
  detectCondicionIva(htmlLower) {
    if (htmlLower.includes('responsable inscripto') || htmlLower.includes('iva responsable inscripto')) {
      return {
        code: 1,
        name: 'IVA Responsable Inscripto',
        shortName: 'responsable_inscripto'
      };
    }
    
    if (htmlLower.includes('monotributo') || htmlLower.includes('responsable monotributo')) {
      return {
        code: 6,
        name: 'Responsable Monotributo',
        shortName: 'monotributista'
      };
    }
    
    if (htmlLower.includes('exento') || htmlLower.includes('iva exento')) {
      return {
        code: 4,
        name: 'IVA Sujeto Exento',
        shortName: 'exento'
      };
    }

    // Default: assume based on CUIT prefix (companies are usually RI)
    return {
      code: 5,
      name: 'Consumidor Final',
      shortName: 'consumidor_final'
    };
  }

  /**
   * Map TangoFactura tipoContribuyente to our format
   */
  mapTangoCondicionIva(tipoContribuyente) {
    const mapping = {
      1: { code: 1, name: 'IVA Responsable Inscripto', shortName: 'responsable_inscripto' },
      4: { code: 4, name: 'IVA Sujeto Exento', shortName: 'exento' },
      5: { code: 5, name: 'Consumidor Final', shortName: 'consumidor_final' },
      6: { code: 6, name: 'Responsable Monotributo', shortName: 'monotributista' },
    };

    return mapping[tipoContribuyente] || {
      code: 5,
      name: 'Consumidor Final',
      shortName: 'consumidor_final'
    };
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
