/**
 * ARCA Encryption Service
 * Handles encryption/decryption of AFIP certificates using AES-256-GCM
 * 
 * SECURITY NOTES:
 * - ARCA_ENCRYPTION_KEY must be 32 bytes (64 hex characters)
 * - Never log or expose decrypted certificates
 * - Store encrypted data as JSON string in database
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment
 * @throws {Error} if key is not configured or invalid
 */
function getEncryptionKey() {
  const keyHex = process.env.ARCA_ENCRYPTION_KEY;
  const arcaEnvKeys = Object.keys(process.env || {}).filter((k) => k.startsWith('ARCA_'));
  
  if (!keyHex) {
    throw new Error(
      `ARCA_ENCRYPTION_KEY not configured in environment variables. Present ARCA_* vars: ${arcaEnvKeys.join(', ') || '(none)'}`
    );
  }
  
  if (keyHex.length !== 64) {
    throw new Error(
      `ARCA_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Received length: ${keyHex.length}. Present ARCA_* vars: ${arcaEnvKeys.join(', ') || '(none)'}`
    );
  }

  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      `ARCA_ENCRYPTION_KEY must be a 64-character hex string (0-9, a-f). Present ARCA_* vars: ${arcaEnvKeys.join(', ') || '(none)'}`
    );
  }
  
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a certificate or private key
 * @param {string} plaintext - The certificate/key content as string
 * @returns {string} - JSON string containing {iv, authTag, content}
 */
function encryptCertificate(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Invalid plaintext for encryption');
  }
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  const encryptedData = {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    content: encrypted
  };
  
  return JSON.stringify(encryptedData);
}

/**
 * Decrypt a certificate or private key
 * @param {string} encryptedJson - JSON string from database
 * @returns {string} - Decrypted certificate/key content
 */
function decryptCertificate(encryptedJson) {
  if (!encryptedJson || typeof encryptedJson !== 'string') {
    throw new Error('Invalid encrypted data for decryption');
  }
  
  let encrypted;
  try {
    encrypted = JSON.parse(encryptedJson);
  } catch (e) {
    throw new Error('Invalid encrypted data format (not valid JSON)');
  }
  
  if (!encrypted.iv || !encrypted.authTag || !encrypted.content) {
    throw new Error('Invalid encrypted data structure (missing iv, authTag, or content)');
  }
  
  const key = getEncryptionKey();
  
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(encrypted.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Validate that a certificate looks valid (basic PEM format check)
 * @param {string} certContent - Certificate content
 * @returns {boolean}
 */
function isValidCertificate(certContent) {
  if (!certContent || typeof certContent !== 'string') {
    return false;
  }
  
  const trimmed = certContent.trim();
  return (
    trimmed.includes('-----BEGIN CERTIFICATE-----') &&
    trimmed.includes('-----END CERTIFICATE-----')
  );
}

/**
 * Validate that a private key looks valid (basic PEM format check)
 * @param {string} keyContent - Private key content
 * @returns {boolean}
 */
function isValidPrivateKey(keyContent) {
  if (!keyContent || typeof keyContent !== 'string') {
    return false;
  }
  
  const trimmed = keyContent.trim();
  return (
    (trimmed.includes('-----BEGIN PRIVATE KEY-----') && trimmed.includes('-----END PRIVATE KEY-----')) ||
    (trimmed.includes('-----BEGIN RSA PRIVATE KEY-----') && trimmed.includes('-----END RSA PRIVATE KEY-----'))
  );
}

/**
 * Extract certificate expiration date
 * @param {string} certContent - Certificate content in PEM format
 * @returns {Date|null} - Expiration date or null if unable to parse
 */
function getCertificateExpiration(certContent) {
  try {
    const forge = require('node-forge');
    const cert = forge.pki.certificateFromPem(certContent);
    return cert.validity.notAfter;
  } catch (error) {
    console.error('Error parsing certificate expiration:', error.message);
    return null;
  }
}

/**
 * Generate a new encryption key (for setup purposes)
 * @returns {string} - 64 character hex string
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  encryptCertificate,
  decryptCertificate,
  isValidCertificate,
  isValidPrivateKey,
  getCertificateExpiration,
  generateEncryptionKey
};
