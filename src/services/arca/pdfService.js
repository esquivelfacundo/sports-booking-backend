/**
 * PDF Service for ARCA Invoices
 * 
 * Generates PDF documents for electronic invoices and credit notes
 * following AFIP requirements and standard Argentine invoice format
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { INVOICE_TYPE_NAMES, DOC_TYPES } = require('./wsfeService');

// Document type names
const DOC_TYPE_NAMES = {
  [DOC_TYPES.CUIT]: 'CUIT',
  [DOC_TYPES.CUIL]: 'CUIL',
  [DOC_TYPES.DNI]: 'DNI',
  99: 'Consumidor Final'
};

// Fiscal condition names
const FISCAL_CONDITION_NAMES = {
  1: 'IVA Responsable Inscripto',
  4: 'IVA Exento',
  5: 'Consumidor Final',
  6: 'Responsable Monotributo'
};

class PDFService {
  /**
   * Generate PDF for an invoice or credit note
   * @param {Object} invoice - Invoice data from database
   * @param {Object} establishment - Establishment data
   * @param {Object} afipConfig - AFIP configuration
   * @returns {Promise<Buffer>} - PDF buffer
   */
  async generateInvoicePDF(invoice, establishment, afipConfig) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });
        
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Header with invoice type
        await this.drawHeader(doc, invoice, afipConfig);
        
        // Emisor (establishment) info
        this.drawEmisorInfo(doc, afipConfig);
        
        // Receptor (client) info
        this.drawReceptorInfo(doc, invoice);
        
        // Items table
        this.drawItemsTable(doc, invoice);
        
        // Totals
        this.drawTotals(doc, invoice);
        
        // QR Code (AFIP requirement)
        await this.drawQRCode(doc, invoice, afipConfig);
        
        // CAE info
        this.drawCAEInfo(doc, invoice);
        
        // Footer
        this.drawFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw invoice header with type indicator
   */
  async drawHeader(doc, invoice, afipConfig) {
    const pageWidth = doc.page.width - 100;
    const centerX = doc.page.width / 2;
    
    // Invoice type letter (A, B, C)
    const typeLetter = this.getInvoiceTypeLetter(invoice.tipoComprobante);
    const isNC = [3, 8, 13].includes(invoice.tipoComprobante);
    
    // Box for invoice type
    doc.rect(centerX - 25, 30, 50, 50)
       .stroke();
    
    doc.fontSize(30)
       .font('Helvetica-Bold')
       .text(typeLetter, centerX - 25, 40, { width: 50, align: 'center' });
    
    // Invoice type name
    const tipoNombre = isNC ? 'NOTA DE CRÉDITO' : 'FACTURA';
    doc.fontSize(8)
       .font('Helvetica')
       .text(tipoNombre, centerX - 25, 72, { width: 50, align: 'center' });

    // Left side - Establishment info
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text(afipConfig.razonSocial, 50, 35, { width: (pageWidth / 2) - 40 });
    
    doc.fontSize(9)
       .font('Helvetica')
       .text(afipConfig.domicilioFiscal, 50, 55, { width: (pageWidth / 2) - 40 });

    // Right side - Invoice number and date
    const rightX = centerX + 40;
    
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .text(`${INVOICE_TYPE_NAMES[invoice.tipoComprobante]}`, rightX, 35);
    
    doc.fontSize(10)
       .font('Helvetica')
       .text(`Punto de Venta: ${String(invoice.puntoVenta).padStart(5, '0')}`, rightX, 50)
       .text(`Comp. Nro: ${String(invoice.numeroComprobante).padStart(8, '0')}`, rightX, 62);
    
    // Format date
    const fecha = this.formatDisplayDate(invoice.fechaEmision);
    doc.text(`Fecha: ${fecha}`, rightX, 74);
    
    // Separator line
    doc.moveTo(50, 95).lineTo(pageWidth + 50, 95).stroke();
  }

  /**
   * Draw emisor (establishment/seller) information
   */
  drawEmisorInfo(doc, afipConfig) {
    const y = 105;
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .text('EMISOR', 50, y);
    
    const condicionFiscalText = afipConfig.condicionFiscal === 'responsable_inscripto' 
      ? 'IVA Responsable Inscripto' 
      : 'Responsable Monotributo';
    
    doc.fontSize(9)
       .font('Helvetica')
       .text(`CUIT: ${this.formatCUIT(afipConfig.cuit)}`, 50, y + 12)
       .text(`Condición frente al IVA: ${condicionFiscalText}`, 50, y + 24)
       .text(`Inicio de Actividades: ${this.formatDisplayDate(afipConfig.inicioActividades)}`, 50, y + 36);
    
    doc.moveTo(50, y + 52).lineTo(doc.page.width - 50, y + 52).stroke();
  }

  /**
   * Draw receptor (client/buyer) information
   */
  drawReceptorInfo(doc, invoice) {
    const y = 165;
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .text('RECEPTOR', 50, y);
    
    const docTipoNombre = DOC_TYPE_NAMES[invoice.clienteDocTipo] || 'Documento';
    const docNro = invoice.clienteDocNro === '0' ? '-' : this.formatDocument(invoice.clienteDocTipo, invoice.clienteDocNro);
    const condicionIva = FISCAL_CONDITION_NAMES[invoice.clienteCondicionIva] || 'Consumidor Final';
    
    doc.fontSize(9)
       .font('Helvetica')
       .text(`Nombre/Razón Social: ${invoice.clienteNombre || 'Consumidor Final'}`, 50, y + 12)
       .text(`${docTipoNombre}: ${docNro}`, 50, y + 24)
       .text(`Condición frente al IVA: ${condicionIva}`, 50, y + 36);
    
    doc.moveTo(50, y + 52).lineTo(doc.page.width - 50, y + 52).stroke();
  }

  /**
   * Draw items table
   */
  drawItemsTable(doc, invoice) {
    const startY = 230;
    const tableWidth = doc.page.width - 100;
    
    // Table header
    doc.rect(50, startY, tableWidth, 20).fill('#f0f0f0').stroke();
    
    doc.fillColor('#000000')
       .fontSize(9)
       .font('Helvetica-Bold')
       .text('Descripción', 55, startY + 5, { width: tableWidth * 0.5 })
       .text('Cant.', 55 + tableWidth * 0.5, startY + 5, { width: tableWidth * 0.15, align: 'right' })
       .text('P. Unit.', 55 + tableWidth * 0.65, startY + 5, { width: tableWidth * 0.15, align: 'right' })
       .text('Subtotal', 55 + tableWidth * 0.8, startY + 5, { width: tableWidth * 0.15, align: 'right' });
    
    // Table rows
    let y = startY + 25;
    const items = invoice.items || [];
    
    doc.font('Helvetica').fontSize(9);
    
    for (const item of items) {
      const subtotal = (item.cantidad || 1) * (item.precioUnitario || 0);
      
      doc.text(item.descripcion || '-', 55, y, { width: tableWidth * 0.5 })
         .text(String(item.cantidad || 1), 55 + tableWidth * 0.5, y, { width: tableWidth * 0.15, align: 'right' })
         .text(this.formatCurrency(item.precioUnitario || 0), 55 + tableWidth * 0.65, y, { width: tableWidth * 0.15, align: 'right' })
         .text(this.formatCurrency(subtotal), 55 + tableWidth * 0.8, y, { width: tableWidth * 0.15, align: 'right' });
      
      y += 15;
      
      // Add page if needed
      if (y > doc.page.height - 200) {
        doc.addPage();
        y = 50;
      }
    }
    
    // Store current Y position for totals
    doc._itemsEndY = y + 10;
  }

  /**
   * Draw totals section
   */
  drawTotals(doc, invoice) {
    const y = doc._itemsEndY || 400;
    const rightX = doc.page.width - 200;
    
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
    
    const totalsY = y + 10;
    
    doc.fontSize(9).font('Helvetica');
    
    // Only show IVA breakdown for Factura A
    if (invoice.tipoComprobante === 1) {
      doc.text('Subtotal Neto:', rightX, totalsY)
         .text(this.formatCurrency(invoice.importeNeto), rightX + 80, totalsY, { align: 'right', width: 70 });
      
      doc.text('IVA 21%:', rightX, totalsY + 15)
         .text(this.formatCurrency(invoice.importeIva), rightX + 80, totalsY + 15, { align: 'right', width: 70 });
    }
    
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .text('TOTAL:', rightX, totalsY + 35)
       .text(this.formatCurrency(invoice.importeTotal), rightX + 80, totalsY + 35, { align: 'right', width: 70 });
    
    doc._totalsEndY = totalsY + 60;
  }

  /**
   * Draw QR code (AFIP requirement since 2021)
   */
  async drawQRCode(doc, invoice, afipConfig) {
    try {
      const qrData = this.buildQRData(invoice, afipConfig);
      const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(qrData)).toString('base64')}`;
      
      const qrImage = await QRCode.toDataURL(qrUrl, { width: 100 });
      
      const y = doc._totalsEndY || 470;
      doc.image(qrImage, 50, y, { width: 80, height: 80 });
      
      doc.fontSize(7)
         .font('Helvetica')
         .text('Comprobante autorizado', 50, y + 85, { width: 80, align: 'center' });
      
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  }

  /**
   * Build QR data object per AFIP specification
   */
  buildQRData(invoice, afipConfig) {
    return {
      ver: 1,
      fecha: invoice.fechaEmision,
      cuit: parseInt(afipConfig.cuit),
      ptoVta: invoice.puntoVenta,
      tipoCmp: invoice.tipoComprobante,
      nroCmp: invoice.numeroComprobante,
      importe: parseFloat(invoice.importeTotal),
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: invoice.clienteDocTipo,
      nroDocRec: parseInt(invoice.clienteDocNro) || 0,
      tipoCodAut: 'E', // CAE
      codAut: parseInt(invoice.cae)
    };
  }

  /**
   * Draw CAE information
   */
  drawCAEInfo(doc, invoice) {
    const y = doc._totalsEndY || 470;
    const rightX = doc.page.width - 250;
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .text('CAE:', rightX, y)
       .font('Helvetica')
       .text(invoice.cae, rightX + 30, y);
    
    doc.font('Helvetica-Bold')
       .text('Vencimiento CAE:', rightX, y + 15)
       .font('Helvetica')
       .text(this.formatDisplayDate(invoice.caeVencimiento), rightX + 100, y + 15);
  }

  /**
   * Draw footer
   */
  drawFooter(doc) {
    const bottomY = doc.page.height - 40;
    
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor('#666666')
       .text(
         'Este comprobante fue autorizado por AFIP. Puede verificarlo en www.afip.gob.ar',
         50,
         bottomY,
         { align: 'center', width: doc.page.width - 100 }
       );
  }

  /**
   * Get invoice type letter (A, B, C)
   */
  getInvoiceTypeLetter(tipoComprobante) {
    switch (tipoComprobante) {
      case 1:
      case 3:
        return 'A';
      case 6:
      case 8:
        return 'B';
      case 11:
      case 13:
      default:
        return 'C';
    }
  }

  /**
   * Format CUIT with dashes (XX-XXXXXXXX-X)
   */
  formatCUIT(cuit) {
    const c = String(cuit).replace(/\D/g, '');
    if (c.length !== 11) return cuit;
    return `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
  }

  /**
   * Format document number based on type
   */
  formatDocument(docTipo, docNro) {
    if (docTipo === DOC_TYPES.CUIT || docTipo === DOC_TYPES.CUIL) {
      return this.formatCUIT(docNro);
    }
    return String(docNro);
  }

  /**
   * Format currency value
   */
  formatCurrency(value) {
    return `$ ${parseFloat(value || 0).toLocaleString('es-AR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  }

  /**
   * Format date for display (DD/MM/YYYY)
   */
  formatDisplayDate(dateStr) {
    if (!dateStr) return '-';
    
    // Handle YYYYMMDD format
    if (/^\d{8}$/.test(dateStr)) {
      return `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}/${dateStr.slice(0, 4)}`;
    }
    
    // Handle ISO date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    return date.toLocaleDateString('es-AR');
  }
}

module.exports = new PDFService();
