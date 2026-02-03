/**
 * Padrón Service - Consulta de contribuyentes
 * Usa API pública de TangoFactura para consultar datos de CUIT
 * 
 * Permite obtener:
 * - Razón social
 * - Condición IVA (Responsable Inscripto, Monotributista, etc.)
 * - Tipo de persona (Física/Jurídica)
 * - Domicilio fiscal
 * - Actividad principal
 */

// Cache for padrón queries (to avoid excessive API calls)
const padronCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class PadronService {
  constructor(config = {}) {
    this.establishmentId = config.establishmentId || 'default';
  }

  /**
   * Consultar datos de un CUIT usando API pública
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

    console.log(`[PADRON] Consulting CUIT ${cuitNormalized}...`);

    // Try TangoFactura API first (most reliable)
    try {
      const data = await this.consultarTangoFactura(cuitNormalized);
      
      // Cache the result
      padronCache.set(cacheKey, { data, timestamp: Date.now() });
      console.log(`[PADRON] Found: ${data.razonSocial} - ${data.condicionIva.name}`);
      return data;
    } catch (err1) {
      console.log(`[PADRON] TangoFactura failed: ${err1.message}, trying Nosis...`);
      
      // Fallback to Nosis API
      try {
        const data = await this.consultarNosis(cuitNormalized);
        padronCache.set(cacheKey, { data, timestamp: Date.now() });
        console.log(`[PADRON] Found via Nosis: ${data.razonSocial}`);
        return data;
      } catch (err2) {
        console.error(`[PADRON] All APIs failed`);
        throw new Error('No se pudo consultar el CUIT. Intente nuevamente.');
      }
    }
  }

  /**
   * Consultar usando API de TangoFactura (JSON, confiable)
   */
  async consultarTangoFactura(cuit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        `https://afip.tangofactura.com/Rest/GetContribuyenteFull?cuit=${cuit}`,
        {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data || data.errorGetData || !data.Contribuyente) {
        throw new Error('CUIT no encontrado');
      }

      const contrib = data.Contribuyente;
      
      // Build razón social
      let razonSocial = contrib.nombre || '';
      if (!razonSocial && contrib.apellido) {
        razonSocial = `${contrib.apellido}, ${contrib.nombre || ''}`.trim();
      }
      
      // Map condición IVA
      const condicionIva = this.mapCondicionIva(contrib.idImpuestoIVA, contrib.monotributo);
      
      // Determine tipo persona
      const tipoPersona = cuit.startsWith('30') || cuit.startsWith('33') || cuit.startsWith('34') 
        ? 'JURIDICA' 
        : 'FISICA';

      return {
        cuit,
        razonSocial: razonSocial || 'Sin datos',
        tipoPersona,
        condicionIva,
        domicilioFiscal: contrib.domicilioFiscal || null,
        estadoCuit: contrib.estadoCUIT || 'ACTIVO',
        actividadPrincipal: contrib.actividadPrincipal || null,
        fechaInscripcion: contrib.fechaInscripcion || null,
        // Raw data for debugging
        _raw: contrib
      };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Fallback: Nosis API
   */
  async consultarNosis(cuit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        `https://api.cuitonline.com/v2/constancia/${cuit}`,
        {
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'ARCA-Integration/1.0'
          },
          signal: controller.signal
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data || !data.nombre) {
        throw new Error('CUIT no encontrado');
      }

      const condicionIva = this.detectCondicionFromText(data.condicionIVA || '');
      const tipoPersona = cuit.startsWith('30') || cuit.startsWith('33') || cuit.startsWith('34') 
        ? 'JURIDICA' 
        : 'FISICA';

      return {
        cuit,
        razonSocial: data.nombre || data.razonSocial || 'Sin datos',
        tipoPersona,
        condicionIva,
        domicilioFiscal: data.domicilio || null,
        estadoCuit: data.estado || 'ACTIVO',
        _raw: data
      };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Map IVA condition from TangoFactura
   */
  mapCondicionIva(idImpuestoIVA, monotributo) {
    // If monotributo is true or has data
    if (monotributo === true || monotributo === 'S') {
      return {
        code: 6,
        name: 'Responsable Monotributo',
        shortName: 'monotributista'
      };
    }

    const mapping = {
      1: { code: 1, name: 'IVA Responsable Inscripto', shortName: 'responsable_inscripto' },
      2: { code: 1, name: 'IVA Responsable Inscripto', shortName: 'responsable_inscripto' },
      3: { code: 1, name: 'IVA Responsable Inscripto', shortName: 'responsable_inscripto' },
      4: { code: 4, name: 'IVA Sujeto Exento', shortName: 'exento' },
      5: { code: 5, name: 'Consumidor Final', shortName: 'consumidor_final' },
      6: { code: 6, name: 'Responsable Monotributo', shortName: 'monotributista' },
    };

    return mapping[idImpuestoIVA] || {
      code: 1,
      name: 'IVA Responsable Inscripto',
      shortName: 'responsable_inscripto'
    };
  }

  /**
   * Detect condición IVA from text
   */
  detectCondicionFromText(text) {
    const t = (text || '').toLowerCase();
    
    if (t.includes('responsable inscripto') || t.includes('ri')) {
      return { code: 1, name: 'IVA Responsable Inscripto', shortName: 'responsable_inscripto' };
    }
    if (t.includes('monotributo')) {
      return { code: 6, name: 'Responsable Monotributo', shortName: 'monotributista' };
    }
    if (t.includes('exento')) {
      return { code: 4, name: 'IVA Sujeto Exento', shortName: 'exento' };
    }
    
    return { code: 5, name: 'Consumidor Final', shortName: 'consumidor_final' };
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
