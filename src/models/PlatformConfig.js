const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * PlatformConfig Model
 * Stores global platform configuration including:
 * - Mercado Pago admin account (for receiving commissions)
 * - Default fee percentage
 * - Other platform-wide settings
 */
const PlatformConfig = sequelize.define('PlatformConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // Key-value style config, but we'll use a single row for simplicity
  configKey: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    defaultValue: 'main'
  },

  // Mercado Pago Admin Account (receives platform commissions)
  mpUserId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'MP User ID of the platform admin account'
  },
  mpAccessToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'OAuth access token for the admin account'
  },
  mpRefreshToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'OAuth refresh token for the admin account'
  },
  mpPublicKey: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mpTokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  mpEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Email of the connected MP account'
  },
  mpConnectedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },

  // Platform Fee Configuration
  defaultFeePercent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 10.00,
    comment: 'Default platform fee percentage (e.g., 10.00 = 10%)'
  },

  // Additional settings
  settings: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: 'Additional platform settings as JSON'
  }
}, {
  tableName: 'platform_config',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['configKey'] }
  ]
});

/**
 * Get or create the main platform config
 */
PlatformConfig.getConfig = async function() {
  let config = await this.findOne({ where: { configKey: 'main' } });
  
  if (!config) {
    config = await this.create({
      configKey: 'main',
      defaultFeePercent: parseFloat(process.env.MP_DEFAULT_FEE_PERCENT) || 10
    });
  }
  
  return config;
};

/**
 * Update platform MP credentials
 */
PlatformConfig.updateMPCredentials = async function(credentials) {
  const config = await this.getConfig();
  
  await config.update({
    mpUserId: credentials.userId,
    mpAccessToken: credentials.accessToken,
    mpRefreshToken: credentials.refreshToken,
    mpPublicKey: credentials.publicKey,
    mpEmail: credentials.email,
    mpTokenExpiresAt: credentials.expiresAt,
    mpConnectedAt: new Date()
  });
  
  return config;
};

/**
 * Check if platform MP account is connected
 */
PlatformConfig.isMPConnected = async function() {
  const config = await this.getConfig();
  return !!(config.mpUserId && config.mpAccessToken);
};

module.exports = PlatformConfig;
