/**
 * WSAA Service - Multi-Tenant
 * Web Service de Autenticación y Autorización de AFIP
 * 
 * Handles authentication with AFIP to obtain Token and Sign
 * for making requests to WSFEv1 (electronic invoicing)
 * 
 * MULTI-TENANT: Each establishment has its own credentials and cache
 */

const soap = require('soap');
const forge = require('node-forge');
const { decryptCertificate } = require('./encryptionService');

// AFIP Production URL (fixed)
const WSAA_URL = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';
const WSFE_SERVICE = 'wsfe';

// Token cache per establishment AND service (in-memory)
// Structure: { `${establishmentId}_${service}`: { token, sign, expiresAt, cuit } }
const tokenCache = new Map();

// Token validity: 11 hours (AFIP gives 12h, we use 11h for safety margin)
const TOKEN_VALIDITY_MS = 11 * 60 * 60 * 1000;

class WSAAService {
  /**
   * @param {Object} config - AFIP configuration from database
   * @param {string} config.establishmentId
   * @param {string} config.cuit
   * @param {string} config.encryptedCert - Encrypted certificate from DB
   * @param {string} config.encryptedKey - Encrypted private key from DB
   */
  constructor(config) {
    this.establishmentId = config.establishmentId;
    this.cuit = config.cuit;
    this.encryptedCert = config.encryptedCert;
    this.encryptedKey = config.encryptedKey;
    this.wsaaUrl = WSAA_URL;
  }

  /**
   * Get cached credentials or authenticate with AFIP
   * @returns {Promise<{token: string, sign: string}>}
   */
  async getCredentials(serviceName = WSFE_SERVICE) {
    const cacheKey = `${this.establishmentId}_${serviceName}`;
    const cached = tokenCache.get(cacheKey);
    
    if (cached && this.isTokenValid(cached)) {
      console.log(`[WSAA] Using cached token for establishment ${this.establishmentId}, service ${serviceName}`);
      return { token: cached.token, sign: cached.sign };
    }

    console.log(`[WSAA] Authenticating with AFIP for establishment ${this.establishmentId}, service ${serviceName}`);
    return await this.authenticate(serviceName);
  }

  /**
   * Check if cached token is still valid
   */
  isTokenValid(cached) {
    if (!cached || !cached.expiresAt) return false;
    return new Date() < new Date(cached.expiresAt);
  }

  /**
   * Authenticate with AFIP WSAA
   * @returns {Promise<{token: string, sign: string}>}
   */
  async authenticate(serviceName = WSFE_SERVICE) {
    try {
      // Decrypt certificates
      const certPem = decryptCertificate(this.encryptedCert);
      const keyPem = decryptCertificate(this.encryptedKey);

      // Generate TRA (Ticket de Requerimiento de Acceso)
      const tra = this.generateTRA(serviceName);
      console.log(`[WSAA] TRA generated for CUIT ${this.cuit}, service ${serviceName}`);

      // Sign TRA with certificate
      const cms = this.signTRA(tra, certPem, keyPem);
      console.log(`[WSAA] TRA signed successfully`);

      // Call WSAA
      const credentials = await this.callWSAA(cms);
      console.log(`[WSAA] Authentication successful, token expires at ${credentials.expiresAt}`);

      // Cache credentials per service
      const cacheKey = `${this.establishmentId}_${serviceName}`;
      tokenCache.set(cacheKey, {
        token: credentials.token,
        sign: credentials.sign,
        expiresAt: credentials.expiresAt,
        cuit: this.cuit
      });

      return { token: credentials.token, sign: credentials.sign };

    } catch (error) {
      console.error(`[WSAA] Authentication failed for establishment ${this.establishmentId}:`, error.message);
      throw new Error(`Error de autenticación AFIP: ${error.message}`);
    }
  }

  /**
   * Generate TRA XML document
   */
  generateTRA(serviceName = WSFE_SERVICE) {
    const now = new Date();
    const generationTime = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
    const expirationTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes ahead

    const formatDate = (date) => {
      return date.toISOString();
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
    <generationTime>${formatDate(generationTime)}</generationTime>
    <expirationTime>${formatDate(expirationTime)}</expirationTime>
  </header>
  <service>${serviceName}</service>
</loginTicketRequest>`;
  }

  /**
   * Sign TRA with certificate using PKCS#7 (CMS)
   */
  signTRA(tra, certPem, keyPem) {
    // Parse certificate and key
    const cert = forge.pki.certificateFromPem(certPem);
    const privateKey = forge.pki.privateKeyFromPem(keyPem);

    // Create PKCS#7 signed data
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(cert);
    p7.addSigner({
      key: privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data
        },
        {
          type: forge.pki.oids.messageDigest
        },
        {
          type: forge.pki.oids.signingTime,
          value: new Date()
        }
      ]
    });

    p7.sign();

    // Convert to DER then Base64
    const asn1 = p7.toAsn1();
    const der = forge.asn1.toDer(asn1);
    const base64 = forge.util.encode64(der.getBytes());

    return base64;
  }

  /**
   * Call WSAA SOAP service
   */
  async callWSAA(cms) {
    return new Promise((resolve, reject) => {
      soap.createClient(this.wsaaUrl + '?WSDL', (err, client) => {
        if (err) {
          return reject(new Error(`Error creando cliente WSAA: ${err.message}`));
        }

        const args = { in0: cms };

        client.loginCms(args, (err, result) => {
          if (err) {
            return reject(new Error(`Error en loginCms: ${err.message}`));
          }

          try {
            const loginResult = result.loginCmsReturn;
            const credentials = this.parseLoginTicketResponse(loginResult);
            resolve(credentials);
          } catch (parseError) {
            reject(new Error(`Error parseando respuesta WSAA: ${parseError.message}`));
          }
        });
      });
    });
  }

  /**
   * Parse LoginTicketResponse XML
   */
  parseLoginTicketResponse(xml) {
    // Extract token
    const tokenMatch = xml.match(/<token>([^<]+)<\/token>/);
    if (!tokenMatch) {
      throw new Error('Token not found in WSAA response');
    }

    // Extract sign
    const signMatch = xml.match(/<sign>([^<]+)<\/sign>/);
    if (!signMatch) {
      throw new Error('Sign not found in WSAA response');
    }

    // Extract expiration time
    const expirationMatch = xml.match(/<expirationTime>([^<]+)<\/expirationTime>/);
    let expiresAt;
    if (expirationMatch) {
      expiresAt = new Date(expirationMatch[1]);
    } else {
      // Default to 11 hours from now if not found
      expiresAt = new Date(Date.now() + TOKEN_VALIDITY_MS);
    }

    return {
      token: tokenMatch[1],
      sign: signMatch[1],
      expiresAt
    };
  }

  /**
   * Invalidate cached credentials for this establishment
   */
  invalidateCache() {
    tokenCache.delete(this.establishmentId);
    console.log(`[WSAA] Cache invalidated for establishment ${this.establishmentId}`);
  }

  /**
   * Test authentication (for configuration testing)
   * @returns {Promise<{success: boolean, message: string, expiresAt?: Date}>}
   */
  async testConnection() {
    try {
      const credentials = await this.authenticate();
      const cached = tokenCache.get(this.establishmentId);
      
      return {
        success: true,
        message: 'Conexión con AFIP exitosa',
        expiresAt: cached?.expiresAt,
        cuit: this.cuit
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Static method to clear all cache (for testing/maintenance)
   */
  static clearAllCache() {
    tokenCache.clear();
    console.log('[WSAA] All token cache cleared');
  }

  /**
   * Static method to invalidate cache for specific establishment
   */
  static invalidateCacheFor(establishmentId) {
    tokenCache.delete(establishmentId);
    console.log(`[WSAA] Cache invalidated for establishment ${establishmentId}`);
  }
}

module.exports = WSAAService;
