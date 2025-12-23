/**
 * OCR Service
 * Extracts data from invoices/receipts using GPT-4 Vision
 * Designed for Argentine invoices (AFIP format)
 */
const integrationsService = require('./integrations');

// Invoice patterns for Argentine invoices
const INVOICE_PATTERNS = {
  invoiceNumber: [
    /(?:factura|fact|fc|comp|nro|n°|#)\s*[:\s]?\s*(\d{4,5}[-\s]?\d{8})/i,
    /(\d{4,5}[-\s]\d{8})/,
    /(?:nro|n°|#)\s*[:\s]?\s*(\d+)/i,
  ],
  cuit: [
    /cuit[:\s]*(\d{2}[-\s]?\d{8}[-\s]?\d{1})/i,
    /(\d{2}-\d{8}-\d{1})/,
  ],
  cae: /cae[:\s]*(\d{14})/i,
  date: [
    /fecha[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,
  ],
  total: [
    /total[:\s]*\$?\s*([\d.,]+)/i,
    /importe\s*total[:\s]*\$?\s*([\d.,]+)/i,
  ],
};

class OCRService {
  /**
   * Processes an image and extracts invoice data
   * @param {string} establishmentId - Establishment ID
   * @param {Buffer|string} imageData - Image buffer or base64 string
   * @returns {object} Extracted invoice data
   */
  async processImage(establishmentId, imageData) {
    const startTime = Date.now();
    
    // Get OpenAI API key for this establishment
    const apiKey = await integrationsService.getDecryptedApiKey(establishmentId, 'OPENAI');
    
    if (!apiKey) {
      throw new Error('OpenAI integration not configured for this establishment');
    }

    try {
      // Convert to base64 if buffer
      let imageBase64;
      if (Buffer.isBuffer(imageData)) {
        imageBase64 = imageData.toString('base64');
      } else if (typeof imageData === 'string') {
        // Check if already base64 or if it's a data URL
        if (imageData.startsWith('data:')) {
          imageBase64 = imageData.split(',')[1];
        } else {
          imageBase64 = imageData;
        }
      } else {
        throw new Error('Invalid image data format');
      }

      // Extract data using GPT-4 Vision
      const extractedData = await this.extractWithOpenAI(apiKey, imageBase64);
      
      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        data: extractedData,
        confidence: this.calculateConfidence(extractedData),
        warnings: this.generateWarnings(extractedData),
        processingTimeMs,
        provider: 'openai'
      };
    } catch (error) {
      console.error('OCR processing failed:', error);
      
      return {
        success: false,
        data: null,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
        provider: 'openai'
      };
    }
  }

  /**
   * Extracts data using GPT-4 Vision
   * @param {string} apiKey - OpenAI API key
   * @param {string} imageBase64 - Base64 encoded image
   * @returns {object} Extracted invoice data
   */
  async extractWithOpenAI(apiKey, imageBase64) {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `Eres un experto en extracción de datos de facturas y comprobantes argentinos.
Tu tarea es analizar la imagen de una factura y extraer TODOS los datos posibles en formato JSON estructurado.

IMPORTANTE:
- Extrae EXACTAMENTE lo que ves, no inventes datos
- Para campos que no puedas leer claramente, usa null
- Los montos deben ser números (sin símbolos de moneda)
- Las fechas deben estar en formato YYYY-MM-DD
- El CUIT debe tener formato XX-XXXXXXXX-X
- El CAE tiene exactamente 14 dígitos
- La letra de factura es A, B, C, M o E

Responde SOLO con JSON válido, sin texto adicional.`;

    const userPrompt = `Analiza esta imagen de factura/comprobante y extrae los siguientes datos en JSON:

{
  "invoiceNumber": "número de factura completo (ej: 0001-00012345)",
  "invoiceType": "tipo de comprobante (Factura, Recibo, Ticket, Nota de Crédito, etc)",
  "invoiceLetter": "letra AFIP (A, B, C, M, E) o null",
  "invoiceDate": "fecha en formato YYYY-MM-DD",
  "subtotal": número sin IVA,
  "taxAmount": monto de IVA,
  "total": monto total,
  "currency": "ARS" o "USD",
  "vendor": {
    "name": "nombre o razón social del emisor",
    "taxId": "CUIT del emisor (XX-XXXXXXXX-X)",
    "address": "dirección del emisor",
    "phone": "teléfono del emisor"
  },
  "cae": "código CAE de 14 dígitos o null",
  "caeDueDate": "vencimiento CAE en YYYY-MM-DD o null",
  "lineItems": [
    {
      "description": "descripción del ítem",
      "quantity": cantidad numérica,
      "unitPrice": precio unitario,
      "total": total del ítem
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse JSON from response
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return this.normalizeExtractedData(parsed);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content.substring(0, 500));
      throw new Error('Invalid JSON response from OpenAI');
    }
  }

  /**
   * Normalizes and validates extracted data
   * @param {object} raw - Raw extracted data
   * @returns {object} Normalized data
   */
  normalizeExtractedData(raw) {
    return {
      invoiceNumber: typeof raw.invoiceNumber === 'string' ? raw.invoiceNumber : null,
      invoiceType: typeof raw.invoiceType === 'string' ? raw.invoiceType : null,
      invoiceLetter: this.validateInvoiceLetter(raw.invoiceLetter),
      invoiceDate: this.validateDate(raw.invoiceDate),
      subtotal: this.validateNumber(raw.subtotal),
      taxAmount: this.validateNumber(raw.taxAmount),
      total: this.validateNumber(raw.total),
      currency: raw.currency === 'USD' ? 'USD' : 'ARS',
      vendor: this.normalizeVendor(raw.vendor),
      cae: this.validateCAE(raw.cae),
      caeDueDate: this.validateDate(raw.caeDueDate),
      lineItems: this.normalizeLineItems(raw.lineItems),
    };
  }

  validateInvoiceLetter(value) {
    if (typeof value === 'string' && ['A', 'B', 'C', 'M', 'E'].includes(value.toUpperCase())) {
      return value.toUpperCase();
    }
    return null;
  }

  validateDate(value) {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }

  validateNumber(value) {
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (typeof value === 'string') {
      const num = parseFloat(value.replace(/[,$]/g, ''));
      if (!isNaN(num)) return num;
    }
    return null;
  }

  validateCAE(value) {
    if (typeof value === 'string' && /^\d{14}$/.test(value)) {
      return value;
    }
    return null;
  }

  normalizeVendor(raw) {
    if (!raw || typeof raw !== 'object') {
      return { name: null, taxId: null, address: null, phone: null };
    }
    return {
      name: typeof raw.name === 'string' ? raw.name : null,
      taxId: typeof raw.taxId === 'string' ? raw.taxId : null,
      address: typeof raw.address === 'string' ? raw.address : null,
      phone: typeof raw.phone === 'string' ? raw.phone : null,
    };
  }

  normalizeLineItems(raw) {
    if (!Array.isArray(raw)) return [];
    
    return raw
      .filter(item => item !== null && typeof item === 'object')
      .map(item => ({
        description: typeof item.description === 'string' ? item.description : '',
        quantity: this.validateNumber(item.quantity) || 1,
        unitPrice: this.validateNumber(item.unitPrice) || 0,
        total: this.validateNumber(item.total) || 0,
      }))
      .filter(item => item.description.length > 0);
  }

  /**
   * Calculates confidence score based on extracted data completeness
   * @param {object} data - Extracted data
   * @returns {number} Confidence score 0-1
   */
  calculateConfidence(data) {
    if (!data) return 0;

    let score = 0;
    let maxScore = 0;

    // Required fields (higher weight)
    const requiredFields = ['invoiceNumber', 'invoiceDate', 'total'];
    requiredFields.forEach(field => {
      maxScore += 2;
      if (data[field] !== null && data[field] !== undefined) {
        score += 2;
      }
    });

    // Optional fields
    const optionalFields = ['invoiceType', 'invoiceLetter', 'subtotal', 'taxAmount', 'cae'];
    optionalFields.forEach(field => {
      maxScore += 1;
      if (data[field] !== null && data[field] !== undefined) {
        score += 1;
      }
    });

    // Vendor info
    if (data.vendor) {
      maxScore += 2;
      if (data.vendor.name) score += 1;
      if (data.vendor.taxId) score += 1;
    }

    // Line items
    maxScore += 1;
    if (data.lineItems && data.lineItems.length > 0) {
      score += 1;
    }

    return Math.round((score / maxScore) * 100) / 100;
  }

  /**
   * Generates warnings based on extracted data
   * @param {object} data - Extracted data
   * @returns {array} Warning messages
   */
  generateWarnings(data) {
    const warnings = [];

    if (!data) return ['No se pudo extraer ningún dato'];

    if (!data.invoiceNumber) {
      warnings.push('No se pudo detectar el número de factura');
    }

    if (!data.invoiceDate) {
      warnings.push('No se pudo detectar la fecha');
    }

    if (!data.total) {
      warnings.push('No se pudo detectar el monto total');
    }

    if (!data.vendor?.taxId) {
      warnings.push('No se pudo detectar el CUIT del proveedor');
    }

    // Math check if we have line items
    if (data.lineItems && data.lineItems.length > 0 && data.total) {
      const calculatedTotal = data.lineItems.reduce((sum, item) => sum + item.total, 0);
      const difference = Math.abs(data.total - calculatedTotal);
      const tolerance = data.total * 0.01; // 1% tolerance
      
      if (difference > tolerance) {
        warnings.push(`El total calculado ($${calculatedTotal.toFixed(2)}) no coincide con el total declarado ($${data.total.toFixed(2)})`);
      }
    }

    return warnings;
  }
}

module.exports = new OCRService();
