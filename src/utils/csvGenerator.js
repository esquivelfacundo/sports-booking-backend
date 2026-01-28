const { Parser } = require('json2csv');

/**
 * Genera un archivo CSV a partir de datos JSON
 * @param {Array} data - Array de objetos con los datos
 * @param {Array} fields - Array de objetos con configuración de campos
 * @param {String} filename - Nombre del archivo (opcional)
 * @returns {String} - CSV string
 */
const generateCSV = (data, fields, filename = 'export.csv') => {
  try {
    // Configuración del parser
    // Usar punto y coma como delimitador para compatibilidad con Excel en español/latino
    const opts = {
      fields,
      delimiter: ';',
      quote: '"',
      withBOM: true, // Para compatibilidad con Excel
      excelStrings: false
    };

    const parser = new Parser(opts);
    const csv = parser.parse(data);
    
    return csv;
  } catch (error) {
    console.error('Error generating CSV:', error);
    throw new Error('Failed to generate CSV file');
  }
};

/**
 * Formatea una fecha para CSV
 * @param {Date|String} date - Fecha a formatear
 * @returns {String} - Fecha formateada DD/MM/YYYY
 */
const formatDateForCSV = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Formatea una fecha y hora para CSV
 * @param {Date|String} datetime - Fecha y hora a formatear
 * @returns {String} - Fecha y hora formateada DD/MM/YYYY HH:mm
 */
const formatDateTimeForCSV = (datetime) => {
  if (!datetime) return '';
  const d = new Date(datetime);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * Formatea un número para CSV (punto decimal, sin separador de miles)
 * @param {Number} number - Número a formatear
 * @param {Number} decimals - Cantidad de decimales (default: 2)
 * @returns {String} - Número formateado
 */
const formatNumberForCSV = (number, decimals = 2) => {
  if (number === null || number === undefined) return '0';
  return Number(number).toFixed(decimals);
};

/**
 * Formatea un monto de dinero para CSV
 * @param {Number} amount - Monto a formatear
 * @returns {String} - Monto formateado con símbolo $
 */
const formatCurrencyForCSV = (amount) => {
  if (amount === null || amount === undefined) return '$0.00';
  return `$${formatNumberForCSV(amount, 2)}`;
};

/**
 * Escapa caracteres especiales para CSV
 * @param {String} text - Texto a escapar
 * @returns {String} - Texto escapado
 */
const escapeCSVField = (text) => {
  if (!text) return '';
  const str = String(text);
  // Si contiene comas, comillas o saltos de línea, envolver en comillas
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Envía el CSV como respuesta HTTP
 * @param {Object} res - Objeto response de Express
 * @param {String} csv - Contenido CSV
 * @param {String} filename - Nombre del archivo
 */
const sendCSVResponse = (res, csv, filename) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Pragma', 'no-cache');
  
  // Agregar BOM para UTF-8 (compatibilidad con Excel)
  const BOM = '\uFEFF';
  res.send(BOM + csv);
};

/**
 * Valida que los datos no excedan el límite de registros
 * @param {Array} data - Datos a validar
 * @param {Number} maxRecords - Máximo de registros permitidos (default: 10000)
 * @throws {Error} - Si excede el límite
 */
const validateDataSize = (data, maxRecords = 10000) => {
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array');
  }
  
  if (data.length > maxRecords) {
    throw new Error(`Export exceeds maximum allowed records (${maxRecords}). Please apply filters to reduce the dataset.`);
  }
};

module.exports = {
  generateCSV,
  formatDateForCSV,
  formatDateTimeForCSV,
  formatNumberForCSV,
  formatCurrencyForCSV,
  escapeCSVField,
  sendCSVResponse,
  validateDataSize
};
