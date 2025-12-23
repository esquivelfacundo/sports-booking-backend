const QRCode = require('qrcode');
const crypto = require('crypto');

const config = {
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4555'
};

/**
 * Generate a unique check-in code for a booking
 */
function generateCheckInCode() {
  return crypto.randomBytes(16).toString('hex').toUpperCase().slice(0, 12);
}

/**
 * Generate QR code URL for a booking
 * The URL will point to a page that shows booking details and allows check-in
 */
function getBookingQRUrl(bookingId, checkInCode) {
  return `${config.frontendUrl}/reserva/${bookingId}?code=${checkInCode}`;
}

/**
 * Generate QR code as base64 data URL
 */
async function generateQRCodeDataURL(bookingId, checkInCode, options = {}) {
  const url = getBookingQRUrl(bookingId, checkInCode);
  
  const qrOptions = {
    type: 'image/png',
    width: options.width || 200,
    margin: options.margin || 2,
    color: {
      dark: options.darkColor || '#ffffff',
      light: options.lightColor || '#00000000' // Transparent background
    },
    errorCorrectionLevel: 'M'
  };

  try {
    const dataUrl = await QRCode.toDataURL(url, qrOptions);
    return dataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

/**
 * Generate QR code as SVG string
 */
async function generateQRCodeSVG(bookingId, checkInCode, options = {}) {
  const url = getBookingQRUrl(bookingId, checkInCode);
  
  const qrOptions = {
    type: 'svg',
    width: options.width || 200,
    margin: options.margin || 2,
    color: {
      dark: options.darkColor || '#ffffff',
      light: options.lightColor || '#00000000'
    },
    errorCorrectionLevel: 'M'
  };

  try {
    const svg = await QRCode.toString(url, qrOptions);
    return svg;
  } catch (error) {
    console.error('Error generating QR SVG:', error);
    throw error;
  }
}

/**
 * Generate QR code as Buffer (for serving as image)
 */
async function generateQRCodeBuffer(bookingId, checkInCode, options = {}) {
  const url = getBookingQRUrl(bookingId, checkInCode);
  
  const qrOptions = {
    type: 'png',
    width: options.width || 200,
    margin: options.margin || 2,
    color: {
      dark: options.darkColor || '#000000',
      light: options.lightColor || '#ffffff'
    },
    errorCorrectionLevel: 'M'
  };

  try {
    const buffer = await QRCode.toBuffer(url, qrOptions);
    return buffer;
  } catch (error) {
    console.error('Error generating QR buffer:', error);
    throw error;
  }
}

module.exports = {
  generateCheckInCode,
  getBookingQRUrl,
  generateQRCodeDataURL,
  generateQRCodeSVG,
  generateQRCodeBuffer
};
