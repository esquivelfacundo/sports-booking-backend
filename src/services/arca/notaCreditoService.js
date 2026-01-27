/**
 * Nota de Crédito Service - Multi-Tenant
 * Extends WSFE functionality to handle Credit Notes
 * 
 * Credit Note Types:
 * - 3:  Nota de Crédito A (for Factura A)
 * - 8:  Nota de Crédito B (for Factura B)
 * - 13: Nota de Crédito C (for Factura C)
 * 
 * AFIP Requirements:
 * - Credit notes must reference the original invoice (CbtesAsoc)
 * - Must have same DocTipo/DocNro as original invoice
 */

const soap = require('soap');
const WSAAService = require('./wsaaService');
const { INVOICE_TYPES, INVOICE_TYPE_NAMES, DOC_TYPES } = require('./wsfeService');

// AFIP Production URL
const WSFE_URL = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL';

class NotaCreditoService {
  /**
   * @param {Object} config - AFIP configuration
   * @param {string} config.establishmentId
   * @param {string} config.cuit
   * @param {string} config.encryptedCert
   * @param {string} config.encryptedKey
   * @param {string} config.condicionFiscal
   * @param {number} config.puntoVenta
   */
  constructor(config) {
    this.establishmentId = config.establishmentId;
    this.cuit = config.cuit;
    this.condicionFiscal = config.condicionFiscal;
    this.puntoVenta = config.puntoVenta;
    this.wsfeUrl = WSFE_URL;
    
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
   * Get credit note type based on original invoice type
   */
  getCreditNoteType(tipoComprobanteOriginal) {
    switch (tipoComprobanteOriginal) {
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
   * Get last authorized credit note number
   */
  async getUltimoComprobante(tipoComprobante) {
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
  }

  /**
   * Validate credit note data
   */
  validateCreditNoteData(datos, facturaOriginal) {
    if (!facturaOriginal) {
      throw new Error('Debe especificar la factura original a anular');
    }

    if (!facturaOriginal.cae) {
      throw new Error('La factura original no tiene CAE');
    }

    if (!datos.total || datos.total <= 0) {
      throw new Error('El monto de la nota de crédito debe ser mayor a 0');
    }

    if (datos.total > facturaOriginal.importeTotal) {
      throw new Error('El monto de la NC no puede superar el monto de la factura original');
    }

    if (!datos.motivo || datos.motivo.trim().length === 0) {
      throw new Error('Debe especificar el motivo de la nota de crédito');
    }

    // Check invoice status
    if (facturaOriginal.status === 'anulado') {
      throw new Error('La factura original ya fue anulada');
    }
  }

  /**
   * Emit a Credit Note (Nota de Crédito A, B, or C)
   * @param {Object} datos - Credit note data
   * @param {number} datos.total - Amount to credit (can be partial)
   * @param {string} datos.motivo - Reason for credit note
   * @param {Array} datos.items - Items being credited
   * @param {Object} facturaOriginal - Original invoice data from database
   * @returns {Promise<Object>} - Credit note result with CAE
   */
  async emitirNotaCredito(datos, facturaOriginal) {
    try {
      console.log(`[NC] Emitting credit note for establishment ${this.establishmentId}`);

      // Validate
      this.validateCreditNoteData(datos, facturaOriginal);

      const client = await this.initClient();
      const credentials = await this.wsaaService.getCredentials();

      // Determine credit note type based on original invoice
      const tipoComprobante = this.getCreditNoteType(facturaOriginal.tipoComprobante);
      const tipoComprobanteNombre = INVOICE_TYPE_NAMES[tipoComprobante];
      
      console.log(`[NC] Credit note type: ${tipoComprobanteNombre} (${tipoComprobante})`);

      // Get next credit note number
      const ultimoNro = await this.getUltimoComprobante(tipoComprobante);
      const proximoNro = ultimoNro + 1;
      console.log(`[NC] Next credit note number: ${proximoNro}`);

      const fechaHoy = this.formatDate(new Date());
      const total = parseFloat(datos.total);

      // Build credit note request
      const comprobante = {
        Concepto: 1,
        DocTipo: facturaOriginal.clienteDocTipo,
        DocNro: parseInt(facturaOriginal.clienteDocNro) || 0,
        CbteDesde: proximoNro,
        CbteHasta: proximoNro,
        CbteFch: fechaHoy,
        ImpTotal: total,
        ImpTotConc: 0,
        ImpNeto: total,
        ImpOpEx: 0,
        ImpIVA: 0,
        ImpTrib: 0,
        MonId: 'PES',
        MonCotiz: 1,
        // Reference to original invoice (required for credit notes)
        CbtesAsoc: {
          CbteAsoc: {
            Tipo: facturaOriginal.tipoComprobante,
            PtoVta: facturaOriginal.puntoVenta,
            Nro: facturaOriginal.numeroComprobante,
            Cuit: this.cuit,
            CbteFch: facturaOriginal.fechaEmision.replace(/-/g, '')
          }
        }
      };

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

      console.log(`[NC] Sending request to AFIP...`);

      return new Promise((resolve, reject) => {
        client.FECAESolicitar(params, (err, result) => {
          if (err) {
            return reject(new Error(`Error en FECAESolicitar: ${err.message}`));
          }

          const response = result.FECAESolicitarResult;

          if (response.Errors) {
            const errors = Array.isArray(response.Errors.Err) 
              ? response.Errors.Err 
              : [response.Errors.Err];
            const errorMsg = errors.map(e => `[${e.Code}] ${e.Msg}`).join(', ');
            return reject(new Error(`Error AFIP: ${errorMsg}`));
          }

          const detalleArray = response.FeDetResp.FECAEDetResponse;
          const detalle = Array.isArray(detalleArray) ? detalleArray[0] : detalleArray;

          if (detalle.Resultado !== 'A') {
            let errorMsg = `Nota de crédito rechazada por AFIP`;
            
            if (detalle.Observaciones) {
              const obs = Array.isArray(detalle.Observaciones.Obs) 
                ? detalle.Observaciones.Obs 
                : [detalle.Observaciones.Obs];
              errorMsg = obs.map(o => `[${o.Code}] ${o.Msg}`).join(', ');
            }
            
            return reject(new Error(errorMsg));
          }

          console.log(`[NC] Credit note approved! CAE: ${detalle.CAE}`);

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
            importeNeto: total,
            importeIva: 0,
            cliente: {
              nombre: facturaOriginal.clienteNombre,
              docTipo: facturaOriginal.clienteDocTipo,
              docNro: facturaOriginal.clienteDocNro,
              condicionIva: facturaOriginal.clienteCondicionIva
            },
            items: datos.items || [{
              descripcion: `NC por Factura ${facturaOriginal.puntoVenta}-${facturaOriginal.numeroComprobante}`,
              cantidad: 1,
              precioUnitario: total,
              subtotal: total
            }],
            comprobanteAsociado: {
              tipo: facturaOriginal.tipoComprobante,
              puntoVenta: facturaOriginal.puntoVenta,
              numero: facturaOriginal.numeroComprobante,
              cae: facturaOriginal.cae
            },
            motivo: datos.motivo,
            afipResponse: {
              FeCabResp: response.FeCabResp,
              FeDetResp: detalle
            }
          };

          resolve(resultado);
        });
      });

    } catch (error) {
      console.error(`[NC] Error emitting credit note:`, error.message);
      throw error;
    }
  }
}

module.exports = NotaCreditoService;
