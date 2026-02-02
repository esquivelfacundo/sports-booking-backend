/**
 * WSFE Service - Multi-Tenant
 * Web Service de Facturación Electrónica v1 de AFIP
 * 
 * Handles emission of electronic invoices (Factura A, B, C)
 * 
 * MULTI-TENANT: Each establishment has its own CUIT and punto de venta
 * 
 * INVOICE TYPES:
 * - 1:  Factura A (RI → RI)
 * - 6:  Factura B (RI → CF/Monotrib)
 * - 11: Factura C (Monotrib → Todos)
 */

const soap = require('soap');
const WSAAService = require('./wsaaService');

// AFIP Production URL (fixed)
const WSFE_URL = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL';

// Invoice type codes
const INVOICE_TYPES = {
  FACTURA_A: 1,
  FACTURA_B: 6,
  FACTURA_C: 11,
  NC_A: 3,
  NC_B: 8,
  NC_C: 13
};

// Invoice type names
const INVOICE_TYPE_NAMES = {
  1: 'Factura A',
  6: 'Factura B',
  11: 'Factura C',
  3: 'Nota de Crédito A',
  8: 'Nota de Crédito B',
  13: 'Nota de Crédito C'
};

// Document types
const DOC_TYPES = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  CONSUMIDOR_FINAL: 99
};

// IVA conditions
const IVA_CONDITIONS = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTISTA: 6
};

class WSFEService {
  /**
   * @param {Object} config - AFIP configuration
   * @param {string} config.establishmentId
   * @param {string} config.cuit
   * @param {string} config.encryptedCert
   * @param {string} config.encryptedKey
   * @param {string} config.condicionFiscal - 'monotributista' | 'responsable_inscripto'
   * @param {number} config.puntoVenta - Point of sale number
   */
  constructor(config) {
    this.establishmentId = config.establishmentId;
    this.cuit = config.cuit;
    this.condicionFiscal = config.condicionFiscal;
    this.puntoVenta = config.puntoVenta;
    this.wsfeUrl = WSFE_URL;
    
    // Initialize WSAA service with same config
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

    return new Promise((resolve, reject) => {
      soap.createClient(this.wsfeUrl, (err, client) => {
        if (err) {
          return reject(new Error(`Error creando cliente WSFE: ${err.message}`));
        }
        this.client = client;
        resolve(client);
      });
    });
  }

  /**
   * Get the appropriate invoice type based on fiscal conditions
   * @param {string} receptorCondicion - 'responsable_inscripto' | 'monotributista' | 'consumidor_final' | 'exento'
   * @returns {number} Invoice type code
   */
  getInvoiceType(receptorCondicion = 'consumidor_final') {
    if (this.condicionFiscal === 'monotributista') {
      // Monotributistas always emit Factura C
      return INVOICE_TYPES.FACTURA_C;
    }

    // Responsable Inscripto
    if (receptorCondicion === 'responsable_inscripto') {
      return INVOICE_TYPES.FACTURA_A;
    }
    
    // Everyone else gets Factura B
    return INVOICE_TYPES.FACTURA_B;
  }

  /**
   * Get the appropriate credit note type based on invoice type
   * @param {number} invoiceType - Original invoice type
   * @returns {number} Credit note type code
   */
  getCreditNoteType(invoiceType) {
    switch (invoiceType) {
      case INVOICE_TYPES.FACTURA_A:
        return INVOICE_TYPES.NC_A;
      case INVOICE_TYPES.FACTURA_B:
        return INVOICE_TYPES.NC_B;
      case INVOICE_TYPES.FACTURA_C:
      default:
        return INVOICE_TYPES.NC_C;
    }
  }

  /**
   * Format date to YYYYMMDD
   */
  formatDate(date) {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Get last authorized invoice number
   * @param {number} tipoComprobante - Invoice type code
   * @returns {Promise<number>}
   */
  async getUltimoComprobante(tipoComprobante) {
    try {
      const client = await this.initClient();
      const credentials = await this.wsaaService.getCredentials();

      const params = {
        Auth: {
          Token: credentials.token,
          Sign: credentials.sign,
          Cuit: this.cuit
        },
        PtoVta: this.puntoVenta,
        CbteTipo: tipoComprobante
      };

      return new Promise((resolve, reject) => {
        client.FECompUltimoAutorizado(params, (err, result) => {
          if (err) {
            return reject(new Error(`Error consultando último comprobante: ${err.message}`));
          }

          const response = result.FECompUltimoAutorizadoResult;
          
          if (response.Errors) {
            const errors = Array.isArray(response.Errors.Err) 
              ? response.Errors.Err 
              : [response.Errors.Err];
            const errorMsg = errors.map(e => `[${e.Code}] ${e.Msg}`).join(', ');
            return reject(new Error(`Error AFIP: ${errorMsg}`));
          }

          resolve(response.CbteNro || 0);
        });
      });
    } catch (error) {
      console.error(`[WSFE] Error getting last invoice number:`, error.message);
      throw error;
    }
  }

  /**
   * Validate invoice data before emission
   */
  validateInvoiceData(datos) {
    if (!datos.items || !Array.isArray(datos.items) || datos.items.length === 0) {
      throw new Error('Debe incluir al menos un item en la factura');
    }

    if (!datos.total || datos.total <= 0) {
      throw new Error('El total debe ser mayor a 0');
    }

    // Validate items
    for (const item of datos.items) {
      if (!item.descripcion) {
        throw new Error('Cada item debe tener una descripción');
      }
      if (!item.cantidad || item.cantidad <= 0) {
        throw new Error('La cantidad de cada item debe ser mayor a 0');
      }
      if (!item.precioUnitario || item.precioUnitario < 0) {
        throw new Error('El precio unitario debe ser mayor o igual a 0');
      }
    }
  }

  /**
   * Emit an invoice (Factura A, B, or C)
   * @param {Object} datos - Invoice data
   * @param {Array} datos.items - [{descripcion, cantidad, precioUnitario}]
   * @param {number} datos.total - Total amount
   * @param {Object} datos.cliente - {nombre, docTipo, docNro, condicionIva}
   * @param {string} datos.receptorCondicion - Receptor fiscal condition
   * @returns {Promise<Object>} - Invoice result with CAE
   */
  async emitirFactura(datos) {
    try {
      console.log(`[WSFE] Emitting invoice for establishment ${this.establishmentId}`);
      
      // Validate data
      this.validateInvoiceData(datos);

      const client = await this.initClient();
      const credentials = await this.wsaaService.getCredentials();

      // Determine invoice type
      const tipoComprobante = this.getInvoiceType(datos.receptorCondicion);
      const tipoComprobanteNombre = INVOICE_TYPE_NAMES[tipoComprobante];
      
      console.log(`[WSFE] Invoice type: ${tipoComprobanteNombre} (${tipoComprobante})`);

      // Get next invoice number
      const ultimoNro = await this.getUltimoComprobante(tipoComprobante);
      const proximoNro = ultimoNro + 1;
      console.log(`[WSFE] Next invoice number: ${proximoNro}`);

      // Prepare data
      const fechaHoy = this.formatDate(new Date());
      const total = parseFloat(datos.total);

      // Document configuration
      let docTipo = datos.cliente?.docTipo || DOC_TYPES.CONSUMIDOR_FINAL;
      let docNro = datos.cliente?.docNro || '0';

      // AFIP rule: DocTipo 99 (CF) requires DocNro = 0
      if (docTipo === DOC_TYPES.CONSUMIDOR_FINAL) {
        docNro = '0';
      }

      // Factura A requires CUIT
      if (tipoComprobante === INVOICE_TYPES.FACTURA_A && docTipo !== DOC_TYPES.CUIT) {
        throw new Error('Factura A requiere CUIT del receptor');
      }

      // Build invoice request - calculate IVA for Factura A/B
      const isFacturaC = tipoComprobante === INVOICE_TYPES.FACTURA_C;
      
      // For Factura C (Monotributista): ImpNeto = total, ImpIVA = 0, no Iva array
      // For Factura A/B (Resp. Inscripto): Must discriminate IVA 21%
      let impNeto, impIVA, ivaArray;
      
      if (isFacturaC) {
        // Monotributista - no IVA discrimination
        impNeto = total;
        impIVA = 0;
        ivaArray = null;
      } else {
        // Responsable Inscripto - must discriminate IVA 21%
        // Total includes IVA, so: total = neto * 1.21
        impNeto = Math.round((total / 1.21) * 100) / 100; // Round to 2 decimals
        impIVA = Math.round((total - impNeto) * 100) / 100;
        
        // AFIP requires Iva array when ImpIVA > 0
        ivaArray = {
          AlicIva: [{
            Id: 5, // 5 = 21%
            BaseImp: impNeto,
            Importe: impIVA
          }]
        };
      }

      const comprobante = {
        Concepto: 1, // 1 = Products
        DocTipo: docTipo,
        DocNro: parseInt(docNro) || 0,
        CbteDesde: proximoNro,
        CbteHasta: proximoNro,
        CbteFch: fechaHoy,
        ImpTotal: total,
        ImpTotConc: 0, // No taxable amount
        ImpNeto: impNeto,
        ImpOpEx: 0, // Exempt
        ImpIVA: impIVA,
        ImpTrib: 0, // Other taxes
        MonId: 'PES', // Currency: Pesos
        MonCotiz: 1 // Exchange rate
      };

      // Add IVA array for Factura A/B
      if (ivaArray) {
        comprobante.Iva = ivaArray;
      }

      const params = {
        Auth: {
          Token: credentials.token,
          Sign: credentials.sign,
          Cuit: this.cuit
        },
        FeCAEReq: {
          FeCabReq: {
            CantReg: 1,
            PtoVta: this.puntoVenta,
            CbteTipo: tipoComprobante
          },
          FeDetReq: {
            FECAEDetRequest: comprobante
          }
        }
      };

      console.log(`[WSFE] Sending request to AFIP...`);

      return new Promise((resolve, reject) => {
        client.FECAESolicitar(params, (err, result) => {
          if (err) {
            return reject(new Error(`Error en FECAESolicitar: ${err.message}`));
          }

          const response = result.FECAESolicitarResult;

          // Check for general errors
          if (response.Errors) {
            const errors = Array.isArray(response.Errors.Err) 
              ? response.Errors.Err 
              : [response.Errors.Err];
            const errorMsg = errors.map(e => `[${e.Code}] ${e.Msg}`).join(', ');
            return reject(new Error(`Error AFIP: ${errorMsg}`));
          }

          // Get invoice detail
          const detalleArray = response.FeDetResp.FECAEDetResponse;
          const detalle = Array.isArray(detalleArray) ? detalleArray[0] : detalleArray;

          // Check if rejected
          if (detalle.Resultado !== 'A') {
            let errorMsg = `Factura rechazada por AFIP (Resultado: ${detalle.Resultado})`;
            
            if (detalle.Observaciones) {
              const obs = Array.isArray(detalle.Observaciones.Obs) 
                ? detalle.Observaciones.Obs 
                : [detalle.Observaciones.Obs];
              errorMsg = obs.map(o => `[${o.Code}] ${o.Msg}`).join(', ');
            }
            
            return reject(new Error(errorMsg));
          }

          // Success!
          console.log(`[WSFE] Invoice approved! CAE: ${detalle.CAE}`);

          const resultado = {
            resultado: 'APROBADO',
            cae: detalle.CAE,
            caeVencimiento: detalle.CAEFchVto,
            tipoComprobante,
            tipoComprobanteNombre,
            numeroComprobante: proximoNro,
            puntoVenta: this.puntoVenta,
            fechaEmision: fechaHoy,
            importeTotal: total,
            importeNeto: impNeto,
            importeIva: impIVA,
            cliente: {
              nombre: datos.cliente?.nombre || 'Consumidor Final',
              docTipo,
              docNro: String(docNro),
              condicionIva: datos.cliente?.condicionIva || IVA_CONDITIONS.CONSUMIDOR_FINAL
            },
            items: datos.items.map(item => ({
              descripcion: item.descripcion,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              subtotal: item.cantidad * item.precioUnitario
            })),
            afipResponse: {
              FeCabResp: response.FeCabResp,
              FeDetResp: detalle
            }
          };

          resolve(resultado);
        });
      });

    } catch (error) {
      console.error(`[WSFE] Error emitting invoice:`, error.message);
      throw error;
    }
  }

  /**
   * Get available points of sale from AFIP
   * @returns {Promise<Array>}
   */
  async getPuntosVenta() {
    try {
      const client = await this.initClient();
      const credentials = await this.wsaaService.getCredentials();

      const params = {
        Auth: {
          Token: credentials.token,
          Sign: credentials.sign,
          Cuit: this.cuit
        }
      };

      return new Promise((resolve, reject) => {
        client.FEParamGetPtosVenta(params, (err, result) => {
          if (err) {
            return reject(new Error(`Error consultando puntos de venta: ${err.message}`));
          }

          const response = result.FEParamGetPtosVentaResult;
          
          if (response.Errors) {
            const errors = Array.isArray(response.Errors.Err) 
              ? response.Errors.Err 
              : [response.Errors.Err];
            const errorMsg = errors.map(e => `[${e.Code}] ${e.Msg}`).join(', ');
            return reject(new Error(`Error AFIP: ${errorMsg}`));
          }

          const puntosVenta = response.ResultGet?.PtoVenta || [];
          const lista = Array.isArray(puntosVenta) ? puntosVenta : [puntosVenta];
          
          resolve(lista.filter(pv => pv.Bloqueado === 'N').map(pv => ({
            numero: pv.Nro,
            emisionTipo: pv.EmisionTipo,
            bloqueado: pv.Bloqueado === 'S',
            fechaBaja: pv.FchBaja
          })));
        });
      });
    } catch (error) {
      console.error(`[WSFE] Error getting points of sale:`, error.message);
      throw error;
    }
  }

  /**
   * Check AFIP server status
   * @returns {Promise<{appServer: string, dbServer: string, authServer: string}>}
   */
  async checkServerStatus() {
    try {
      const client = await this.initClient();

      return new Promise((resolve, reject) => {
        client.FEDummy({}, (err, result) => {
          if (err) {
            return reject(new Error(`Error consultando estado AFIP: ${err.message}`));
          }

          const response = result.FEDummyResult;
          resolve({
            appServer: response.AppServer,
            dbServer: response.DbServer,
            authServer: response.AuthServer
          });
        });
      });
    } catch (error) {
      console.error(`[WSFE] Error checking server status:`, error.message);
      throw error;
    }
  }
}

// Export class and constants
module.exports = WSFEService;
module.exports.INVOICE_TYPES = INVOICE_TYPES;
module.exports.INVOICE_TYPE_NAMES = INVOICE_TYPE_NAMES;
module.exports.DOC_TYPES = DOC_TYPES;
module.exports.IVA_CONDITIONS = IVA_CONDITIONS;
