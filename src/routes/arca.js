/**
 * ARCA Routes - Electronic Invoicing API
 * 
 * Endpoints for AFIP configuration and electronic invoicing
 * All routes are protected and require establishment context
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { 
  EstablishmentAfipConfig, 
  EstablishmentAfipPuntoVenta, 
  Invoice,
  Establishment,
  Order,
  Booking,
  User,
  sequelize
} = require('../models');
const { 
  ArcaFactory, 
  encryptionService, 
  pdfService,
  INVOICE_TYPES,
  INVOICE_TYPE_NAMES,
  DOC_TYPES
} = require('../services/arca');
const PadronService = require('../services/arca/padronService');
const { Op } = require('sequelize');

// =====================================================
// AFIP CONFIGURATION ENDPOINTS
// =====================================================

/**
 * GET /api/arca/config/:establishmentId
 * Get AFIP configuration for an establishment
 */
router.get('/config/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const config = await EstablishmentAfipConfig.findOne({
      where: { establishmentId },
      attributes: [
        'id', 'cuit', 'razonSocial', 'domicilioFiscal', 'condicionFiscal',
        'inicioActividades', 'certExpiration', 'isActive', 'isVerified',
        'lastTestedAt', 'lastTestResult', 'encryptedCert', 'encryptedKey'
      ],
      include: [{
        model: EstablishmentAfipPuntoVenta,
        as: 'puntosVenta',
        where: { isActive: true },
        required: false,
        attributes: ['id', 'numero', 'descripcion', 'isDefault', 'isActive']
      }]
    });

    if (!config) {
      return res.json({ 
        configured: false,
        config: null 
      });
    }

    const configJson = config.toJSON();
    const hasCertificate = !!configJson.encryptedCert;
    const hasPrivateKey = !!configJson.encryptedKey;
    delete configJson.encryptedCert;
    delete configJson.encryptedKey;

    res.json({
      configured: true,
      config: {
        ...configJson,
        hasCertificate,
        hasPrivateKey
      }
    });

  } catch (error) {
    console.error('[ARCA] Error getting config:', error);
    res.status(500).json({
      error: 'Error al obtener la configuración AFIP',
      details: error.message
    });
  }
});

/**
 * POST /api/arca/config/:establishmentId
 * Create or update AFIP configuration
 */
router.post('/config/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { 
      cuit, razonSocial, domicilioFiscal, condicionFiscal, 
      inicioActividades, certificado, clavePrivada 
    } = req.body;

    // Validate required fields
    if (!cuit || !razonSocial || !domicilioFiscal || !condicionFiscal || !inicioActividades) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos',
        required: ['cuit', 'razonSocial', 'domicilioFiscal', 'condicionFiscal', 'inicioActividades']
      });
    }

    // Validate CUIT format (11 digits)
    if (!/^\d{11}$/.test(cuit.replace(/\D/g, ''))) {
      return res.status(400).json({ error: 'El CUIT debe tener 11 dígitos' });
    }

    // Validate condicionFiscal
    if (!['monotributista', 'responsable_inscripto'].includes(condicionFiscal)) {
      return res.status(400).json({ 
        error: 'Condición fiscal inválida',
        valid: ['monotributista', 'responsable_inscripto']
      });
    }

    // Validate certificates if provided
    if (certificado && !encryptionService.isValidCertificate(certificado)) {
      return res.status(400).json({ error: 'El certificado no tiene un formato PEM válido' });
    }

    if (clavePrivada && !encryptionService.isValidPrivateKey(clavePrivada)) {
      return res.status(400).json({ error: 'La clave privada no tiene un formato PEM válido' });
    }

    // Save configuration
    const config = await ArcaFactory.saveConfiguration(
      establishmentId,
      {
        cuit: cuit.replace(/\D/g, ''),
        razonSocial,
        domicilioFiscal,
        condicionFiscal,
        inicioActividades,
        certificado,
        clavePrivada
      },
      req.user.id
    );

    // Invalidate cache if certificates changed
    if (certificado || clavePrivada) {
      ArcaFactory.invalidateCache(establishmentId);
    }

    res.json({
      success: true,
      message: 'Configuración guardada exitosamente',
      config: {
        id: config.id,
        cuit: config.cuit,
        razonSocial: config.razonSocial,
        isVerified: config.isVerified
      }
    });

  } catch (error) {
    console.error('[ARCA] Error saving config:', error);
    res.status(500).json({ error: error.message || 'Error al guardar la configuración' });
  }
});

/**
 * POST /api/arca/config/:establishmentId/test
 * Test AFIP connection
 */
router.post('/config/:establishmentId/test', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const result = await ArcaFactory.testConnection(establishmentId);

    res.json(result);

  } catch (error) {
    console.error('[ARCA] Error testing connection:', error);
    res.status(500).json({ 
      success: false,
      message: error.message || 'Error al probar la conexión' 
    });
  }
});

/**
 * PUT /api/arca/config/:establishmentId/activate
 * Activate/deactivate AFIP configuration
 */
router.put('/config/:establishmentId/activate', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { isActive } = req.body;

    const config = await EstablishmentAfipConfig.findOne({
      where: { establishmentId }
    });

    if (!config) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }

    // Must be verified to activate
    if (isActive && !config.isVerified) {
      return res.status(400).json({ 
        error: 'Debe verificar la conexión con AFIP antes de activar la facturación' 
      });
    }

    await config.update({ 
      isActive: !!isActive,
      updatedById: req.user.id
    });

    res.json({
      success: true,
      message: isActive ? 'Facturación electrónica activada' : 'Facturación electrónica desactivada',
      isActive: config.isActive
    });

  } catch (error) {
    console.error('[ARCA] Error activating config:', error);
    res.status(500).json({ error: 'Error al cambiar estado de la configuración' });
  }
});

/**
 * DELETE /api/arca/config/:establishmentId
 * Disconnect AFIP configuration (clear sensitive data, keep history)
 */
router.delete('/config/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const config = await EstablishmentAfipConfig.findOne({
      where: { establishmentId }
    });

    if (!config) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }

    // Clear all data using raw query to bypass model validations
    // Keep record for invoice history foreign key references
    await sequelize.query(`
      UPDATE establishment_afip_configs 
      SET 
        cuit = '00000000000',
        razon_social = '',
        domicilio_fiscal = '',
        condicion_fiscal = 'monotributista',
        inicio_actividades = '2000-01-01',
        encrypted_cert = '',
        encrypted_key = '',
        cert_expiration = NULL,
        is_active = false,
        is_verified = false,
        last_test_result = NULL,
        last_tested_at = NULL,
        updated_by_id = :userId,
        updated_at = NOW()
      WHERE establishment_id = :establishmentId
    `, {
      replacements: { establishmentId, userId: req.user.id },
      type: sequelize.QueryTypes.UPDATE
    });

    // Deactivate all puntos de venta (don't delete - needed for invoice history)
    await EstablishmentAfipPuntoVenta.update(
      { isActive: false },
      { where: { establishmentId } }
    );

    // Invalidate cache
    ArcaFactory.invalidateCache(establishmentId);

    res.json({
      success: true,
      message: 'Configuración AFIP desconectada. Puede configurar una nueva cuenta.'
    });

  } catch (error) {
    console.error('[ARCA] Error disconnecting config:', error);
    res.status(500).json({ error: 'Error al desconectar la configuración AFIP' });
  }
});

// =====================================================
// PUNTOS DE VENTA ENDPOINTS
// =====================================================

/**
 * GET /api/arca/puntos-venta/:establishmentId
 * Get configured points of sale
 */
router.get('/puntos-venta/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const puntosVenta = await EstablishmentAfipPuntoVenta.findAll({
      where: { establishmentId, isActive: true },
      order: [['numero', 'ASC']]
    });

    res.json(puntosVenta);

  } catch (error) {
    console.error('[ARCA] Error getting puntos de venta:', error);
    res.status(500).json({ error: 'Error al obtener puntos de venta' });
  }
});

/**
 * GET /api/arca/puntos-venta/:establishmentId/afip
 * Get available points of sale from AFIP
 */
router.get('/puntos-venta/:establishmentId/afip', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const puntosVenta = await ArcaFactory.getPuntosVentaFromAFIP(establishmentId);

    res.json(puntosVenta);

  } catch (error) {
    console.error('[ARCA] Error getting AFIP puntos de venta:', error);
    res.status(500).json({ error: error.message || 'Error al consultar puntos de venta en AFIP' });
  }
});

/**
 * POST /api/arca/puntos-venta/:establishmentId
 * Add a new punto de venta
 */
router.post('/puntos-venta/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { numero, descripcion, isDefault } = req.body;

    if (!numero || numero < 1 || numero > 99999) {
      return res.status(400).json({ error: 'Número de punto de venta inválido (1-99999)' });
    }

    const config = await EstablishmentAfipConfig.findOne({
      where: { establishmentId }
    });

    if (!config) {
      return res.status(400).json({ error: 'Debe configurar AFIP primero' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await EstablishmentAfipPuntoVenta.update(
        { isDefault: false },
        { where: { establishmentId } }
      );
    }

    const puntoVenta = await EstablishmentAfipPuntoVenta.create({
      establishmentId,
      afipConfigId: config.id,
      numero,
      descripcion: descripcion || `Punto de Venta ${numero}`,
      isDefault: !!isDefault,
      isActive: true
    });

    res.json({
      success: true,
      puntoVenta
    });

  } catch (error) {
    console.error('[ARCA] Error creating punto de venta:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Este punto de venta ya está configurado' });
    }
    
    res.status(500).json({ error: 'Error al crear punto de venta' });
  }
});

/**
 * PUT /api/arca/puntos-venta/:id
 * Update a punto de venta
 */
router.put('/puntos-venta/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { descripcion, isDefault, isActive } = req.body;

    const puntoVenta = await EstablishmentAfipPuntoVenta.findByPk(id);

    if (!puntoVenta) {
      return res.status(404).json({ error: 'Punto de venta no encontrado' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await EstablishmentAfipPuntoVenta.update(
        { isDefault: false },
        { where: { establishmentId: puntoVenta.establishmentId } }
      );
    }

    await puntoVenta.update({
      descripcion: descripcion !== undefined ? descripcion : puntoVenta.descripcion,
      isDefault: isDefault !== undefined ? isDefault : puntoVenta.isDefault,
      isActive: isActive !== undefined ? isActive : puntoVenta.isActive
    });

    res.json({
      success: true,
      puntoVenta
    });

  } catch (error) {
    console.error('[ARCA] Error updating punto de venta:', error);
    res.status(500).json({ error: 'Error al actualizar punto de venta' });
  }
});

// =====================================================
// PADRON (CUIT LOOKUP) ENDPOINTS
// =====================================================

/**
 * GET /api/arca/consultar-cuit/:establishmentId/:cuit
 * Lookup a CUIT in AFIP's padrón to get taxpayer info
 * Returns: razón social, condición IVA, domicilio, etc.
 */
router.get('/consultar-cuit/:establishmentId/:cuit', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, cuit } = req.params;
    
    console.log(`\n========== [PADRON DEBUG] ==========`);
    console.log(`[PADRON] Endpoint called: /consultar-cuit/${establishmentId}/${cuit}`);
    console.log(`[PADRON] User: ${req.user?.id || 'unknown'}`);

    // Get establishment's AFIP config (needed for authentication)
    const afipConfig = await EstablishmentAfipConfig.findOne({
      where: { 
        establishmentId,
        isActive: true
      }
    });

    if (!afipConfig) {
      console.log(`[PADRON] ERROR: No active AFIP config for establishment ${establishmentId}`);
      return res.status(400).json({ 
        error: 'El establecimiento no tiene configuración AFIP activa' 
      });
    }
    
    console.log(`[PADRON] AFIP Config found:`);
    console.log(`  - CUIT emisor: ${afipConfig.cuit}`);
    console.log(`  - Condición fiscal: ${afipConfig.condicionFiscal}`);
    console.log(`  - Has cert: ${!!afipConfig.encryptedCert}`);
    console.log(`  - Has key: ${!!afipConfig.encryptedKey}`);

    // Create padrón service with establishment credentials
    const padronService = new PadronService({
      establishmentId,
      cuit: afipConfig.cuit,
      encryptedCert: afipConfig.encryptedCert,
      encryptedKey: afipConfig.encryptedKey
    });

    console.log(`[PADRON] Calling AFIP ws_sr_padron_a13 for CUIT: ${cuit}`);
    
    // Query AFIP padrón
    const contribuyente = await padronService.consultarCuit(cuit);

    console.log(`[PADRON] SUCCESS! Response:`);
    console.log(JSON.stringify(contribuyente, null, 2));
    console.log(`========== [PADRON DEBUG END] ==========\n`);

    res.json({
      success: true,
      contribuyente
    });

  } catch (error) {
    console.error(`[PADRON] ERROR:`, error.message);
    console.error(`[PADRON] Stack:`, error.stack);
    console.log(`========== [PADRON DEBUG END] ==========\n`);
    
    // Return specific error for not found
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message || 'Error al consultar CUIT' });
  }
});

/**
 * DELETE /api/arca/consultar-cuit/cache/:cuit
 * Clear cache for a specific CUIT (for debugging)
 */
router.delete('/consultar-cuit/cache/:cuit', authenticateToken, async (req, res) => {
  const { cuit } = req.params;
  console.log(`[PADRON] Clearing cache for CUIT: ${cuit}`);
  PadronService.clearCache(cuit);
  res.json({ success: true, message: `Cache cleared for CUIT ${cuit}` });
});

/**
 * DELETE /api/arca/consultar-cuit/cache
 * Clear all padrón cache (for debugging)
 */
router.delete('/consultar-cuit/cache', authenticateToken, async (req, res) => {
  console.log(`[PADRON] Clearing ALL cache`);
  PadronService.clearCache();
  res.json({ success: true, message: 'All padrón cache cleared' });
});

// =====================================================
// INVOICING ENDPOINTS
// =====================================================

/**
 * POST /api/arca/facturas/:establishmentId
 * Emit a new invoice
 */
router.post('/facturas/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { 
      items, total, cliente, receptorCondicion,
      orderId, bookingId, puntoVentaId 
    } = req.body;

    // Validate
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un item' });
    }

    if (!total || total <= 0) {
      return res.status(400).json({ error: 'El total debe ser mayor a 0' });
    }

    // Check if already invoiced
    if (orderId) {
      const existingInvoice = await Invoice.findOne({
        where: { orderId, status: 'emitido' }
      });
      if (existingInvoice) {
        return res.status(400).json({ error: 'Esta venta ya tiene una factura emitida' });
      }
    }

    if (bookingId) {
      const existingInvoice = await Invoice.findOne({
        where: { bookingId, status: 'emitido' }
      });
      if (existingInvoice) {
        return res.status(400).json({ error: 'Esta reserva ya tiene una factura emitida' });
      }
    }

    // Get ARCA services
    const { wsfe, config } = await ArcaFactory.forEstablishment(establishmentId, puntoVentaId);

    // Get AFIP config for DB reference
    const afipConfig = await EstablishmentAfipConfig.findOne({
      where: { establishmentId, isActive: true }
    });

    const puntoVenta = await EstablishmentAfipPuntoVenta.findOne({
      where: puntoVentaId 
        ? { id: puntoVentaId }
        : { establishmentId, isDefault: true, isActive: true }
    });

    // Emit invoice
    const resultado = await wsfe.emitirFactura({
      items,
      total,
      cliente: cliente || {},
      receptorCondicion: receptorCondicion || 'consumidor_final'
    });

    // Save to database
    const invoice = await Invoice.create({
      establishmentId,
      afipConfigId: afipConfig.id,
      puntoVentaId: puntoVenta.id,
      cae: resultado.cae,
      caeVencimiento: parseAFIPDate(resultado.caeVencimiento),
      tipoComprobante: resultado.tipoComprobante,
      tipoComprobanteNombre: resultado.tipoComprobanteNombre,
      numeroComprobante: resultado.numeroComprobante,
      puntoVenta: resultado.puntoVenta,
      fechaEmision: parseAFIPDate(resultado.fechaEmision),
      importeTotal: resultado.importeTotal,
      importeNeto: resultado.importeNeto,
      importeIva: resultado.importeIva || 0,
      clienteNombre: resultado.cliente.nombre,
      clienteDocTipo: resultado.cliente.docTipo,
      clienteDocNro: resultado.cliente.docNro,
      clienteCondicionIva: resultado.cliente.condicionIva,
      items: resultado.items,
      orderId: orderId || null,
      bookingId: bookingId || null,
      status: 'emitido',
      afipResponse: resultado.afipResponse,
      createdById: req.user.id
    });

    // Update order/booking with invoice reference
    if (orderId) {
      await Order.update({ invoiceId: invoice.id }, { where: { id: orderId } });
    }
    if (bookingId) {
      await Booking.update({ invoiceId: invoice.id }, { where: { id: bookingId } });
    }

    res.json({
      success: true,
      message: 'Factura emitida exitosamente',
      invoice: {
        id: invoice.id,
        tipoComprobante: invoice.tipoComprobanteNombre,
        numero: `${String(invoice.puntoVenta).padStart(5, '0')}-${String(invoice.numeroComprobante).padStart(8, '0')}`,
        cae: invoice.cae,
        total: invoice.importeTotal
      }
    });

  } catch (error) {
    console.error('[ARCA] Error emitting invoice:', error);
    res.status(500).json({ error: error.message || 'Error al emitir factura' });
  }
});

/**
 * POST /api/arca/notas-credito/:establishmentId
 * Emit a credit note
 */
router.post('/notas-credito/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { facturaId, total, motivo, items, puntoVentaId } = req.body;

    // Validate
    if (!facturaId) {
      return res.status(400).json({ error: 'Debe especificar la factura a anular' });
    }

    if (!total || total <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }

    if (!motivo || motivo.trim().length === 0) {
      return res.status(400).json({ error: 'Debe especificar el motivo de la nota de crédito' });
    }

    // Get original invoice
    const facturaOriginal = await Invoice.findOne({
      where: { id: facturaId, establishmentId, status: 'emitido' }
    });

    if (!facturaOriginal) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // Check if already has a credit note for full amount
    if (facturaOriginal.anuladoPorId) {
      return res.status(400).json({ error: 'Esta factura ya fue anulada' });
    }

    // Get ARCA services
    const { notaCredito, config } = await ArcaFactory.forEstablishment(establishmentId, puntoVentaId);

    // Get AFIP config
    const afipConfig = await EstablishmentAfipConfig.findOne({
      where: { establishmentId, isActive: true }
    });

    const puntoVenta = await EstablishmentAfipPuntoVenta.findOne({
      where: puntoVentaId 
        ? { id: puntoVentaId }
        : { establishmentId, isDefault: true, isActive: true }
    });

    // Emit credit note
    const resultado = await notaCredito.emitirNotaCredito(
      { total, motivo, items },
      {
        cae: facturaOriginal.cae,
        tipoComprobante: facturaOriginal.tipoComprobante,
        puntoVenta: facturaOriginal.puntoVenta,
        numeroComprobante: facturaOriginal.numeroComprobante,
        fechaEmision: facturaOriginal.fechaEmision,
        importeTotal: parseFloat(facturaOriginal.importeTotal),
        clienteNombre: facturaOriginal.clienteNombre,
        clienteDocTipo: facturaOriginal.clienteDocTipo,
        clienteDocNro: facturaOriginal.clienteDocNro,
        clienteCondicionIva: facturaOriginal.clienteCondicionIva,
        status: facturaOriginal.status
      }
    );

    // Save credit note to database
    const notaCreditoDoc = await Invoice.create({
      establishmentId,
      afipConfigId: afipConfig.id,
      puntoVentaId: puntoVenta.id,
      cae: resultado.cae,
      caeVencimiento: parseAFIPDate(resultado.caeVencimiento),
      tipoComprobante: resultado.tipoComprobante,
      tipoComprobanteNombre: resultado.tipoComprobanteNombre,
      numeroComprobante: resultado.numeroComprobante,
      puntoVenta: resultado.puntoVenta,
      fechaEmision: parseAFIPDate(resultado.fechaEmision),
      importeTotal: resultado.importeTotal,
      importeNeto: resultado.importeNeto,
      importeIva: resultado.importeIva || 0,
      clienteNombre: resultado.cliente.nombre,
      clienteDocTipo: resultado.cliente.docTipo,
      clienteDocNro: resultado.cliente.docNro,
      clienteCondicionIva: resultado.cliente.condicionIva,
      items: resultado.items,
      comprobanteAsociadoId: facturaOriginal.id,
      motivoNc: motivo,
      status: 'emitido',
      afipResponse: resultado.afipResponse,
      createdById: req.user.id
    });

    // Mark original invoice as cancelled if full amount
    if (parseFloat(total) >= parseFloat(facturaOriginal.importeTotal)) {
      await facturaOriginal.update({ 
        status: 'anulado',
        anuladoPorId: notaCreditoDoc.id 
      });
    }

    res.json({
      success: true,
      message: 'Nota de crédito emitida exitosamente',
      notaCredito: {
        id: notaCreditoDoc.id,
        tipoComprobante: notaCreditoDoc.tipoComprobanteNombre,
        numero: `${String(notaCreditoDoc.puntoVenta).padStart(5, '0')}-${String(notaCreditoDoc.numeroComprobante).padStart(8, '0')}`,
        cae: notaCreditoDoc.cae,
        total: notaCreditoDoc.importeTotal
      }
    });

  } catch (error) {
    console.error('[ARCA] Error emitting credit note:', error);
    res.status(500).json({ error: error.message || 'Error al emitir nota de crédito' });
  }
});

/**
 * GET /api/arca/facturas/:establishmentId
 * List invoices with filters
 */
router.get('/facturas/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { 
      page = 1, limit = 20, 
      tipo, status, fechaDesde, fechaHasta,
      search, orderId, bookingId 
    } = req.query;

    const where = { establishmentId };

    if (tipo) {
      where.tipoComprobante = tipo;
    }

    if (status) {
      where.status = status;
    }

    if (fechaDesde || fechaHasta) {
      where.fechaEmision = {};
      if (fechaDesde) where.fechaEmision[Op.gte] = fechaDesde;
      if (fechaHasta) where.fechaEmision[Op.lte] = fechaHasta;
    }

    if (search) {
      where[Op.or] = [
        { cae: { [Op.iLike]: `%${search}%` } },
        { clienteNombre: { [Op.iLike]: `%${search}%` } },
        { clienteDocNro: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (orderId) {
      where.orderId = orderId;
    }

    if (bookingId) {
      where.bookingId = bookingId;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Invoice.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'createdBy',
          attributes: ['id', 'firstName', 'lastName'],
          required: false
        },
        {
          model: Invoice,
          as: 'comprobanteAsociado',
          attributes: ['id', 'tipoComprobanteNombre', 'numeroComprobante', 'puntoVenta'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      invoices: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('[ARCA] Error listing invoices:', error.message);
    console.error('[ARCA] Error stack:', error.stack);
    res.status(500).json({ error: 'Error al obtener facturas', details: error.message });
  }
});

/**
 * GET /api/arca/facturas/:establishmentId/:invoiceId
 * Get single invoice details
 */
router.get('/facturas/:establishmentId/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, invoiceId } = req.params;

    const invoice = await Invoice.findOne({
      where: { id: invoiceId, establishmentId },
      include: [
        {
          model: User,
          as: 'createdBy',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: Invoice,
          as: 'comprobanteAsociado',
          attributes: ['id', 'tipoComprobanteNombre', 'numeroComprobante', 'puntoVenta', 'cae']
        },
        {
          model: Invoice,
          as: 'notasCredito',
          attributes: ['id', 'tipoComprobanteNombre', 'numeroComprobante', 'puntoVenta', 'cae', 'importeTotal', 'motivoNc']
        },
        {
          model: Order,
          as: 'order',
          attributes: ['id', 'orderNumber', 'total']
        },
        {
          model: Booking,
          as: 'booking',
          attributes: ['id', 'date', 'totalAmount']
        }
      ]
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    res.json(invoice);

  } catch (error) {
    console.error('[ARCA] Error getting invoice:', error);
    res.status(500).json({ error: 'Error al obtener factura' });
  }
});

/**
 * GET /api/arca/facturas/:establishmentId/:invoiceId/pdf
 * Download invoice PDF
 */
router.get('/facturas/:establishmentId/:invoiceId/pdf', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, invoiceId } = req.params;

    const invoice = await Invoice.findOne({
      where: { id: invoiceId, establishmentId }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const establishment = await Establishment.findByPk(establishmentId);
    const afipConfig = await EstablishmentAfipConfig.findOne({
      where: { establishmentId }
    });

    // Generate PDF
    const pdfBuffer = await pdfService.generateInvoicePDF(
      invoice.toJSON(),
      establishment.toJSON(),
      afipConfig.toJSON()
    );

    // Set response headers
    const filename = `${invoice.tipoComprobanteNombre.replace(/\s+/g, '_')}_${String(invoice.puntoVenta).padStart(5, '0')}-${String(invoice.numeroComprobante).padStart(8, '0')}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);

  } catch (error) {
    console.error('[ARCA] Error generating PDF:', error);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

// =====================================================
// HELPER METHODS
// =====================================================

/**
 * Parse AFIP date format (YYYYMMDD) to ISO date
 */
function parseAFIPDate(dateStr) {
  if (!dateStr) return null;
  
  if (/^\d{8}$/.test(dateStr)) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  
  return dateStr;
}

module.exports = router;
