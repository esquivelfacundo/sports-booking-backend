/**
 * ARCA Services - Main Export
 * 
 * Multi-tenant electronic invoicing services for AFIP Argentina
 * 
 * Usage:
 *   const { ArcaFactory, encryptionService } = require('./services/arca');
 *   
 *   // Get services for an establishment
 *   const { wsfe, notaCredito } = await ArcaFactory.forEstablishment(establishmentId);
 *   
 *   // Emit invoice
 *   const resultado = await wsfe.emitirFactura({ items, total, cliente });
 */

const ArcaFactory = require('./arcaFactory');
const WSAAService = require('./wsaaService');
const WSFEService = require('./wsfeService');
const NotaCreditoService = require('./notaCreditoService');
const encryptionService = require('./encryptionService');
const pdfService = require('./pdfService');

// Export constants from WSFE
const { 
  INVOICE_TYPES, 
  INVOICE_TYPE_NAMES, 
  DOC_TYPES, 
  IVA_CONDITIONS 
} = require('./wsfeService');

module.exports = {
  // Main factory (recommended entry point)
  ArcaFactory,
  
  // Individual services (for advanced usage)
  WSAAService,
  WSFEService,
  NotaCreditoService,
  
  // Utilities
  encryptionService,
  pdfService,
  
  // Constants
  INVOICE_TYPES,
  INVOICE_TYPE_NAMES,
  DOC_TYPES,
  IVA_CONDITIONS
};
