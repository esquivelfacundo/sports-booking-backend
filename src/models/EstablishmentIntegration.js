/**
 * EstablishmentIntegration Model
 * Stores integration configurations (OpenAI, WhatsApp, etc.) per establishment
 * API keys are encrypted using AES-256-GCM
 */
module.exports = (sequelize, DataTypes) => {
  const EstablishmentIntegration = sequelize.define('EstablishmentIntegration', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    establishmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'establishment_id',
      references: {
        model: 'establishments',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM('OPENAI', 'WHATSAPP'),
      allowNull: false,
      comment: 'Type of integration'
    },
    encryptedApiKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'encrypted_api_key',
      comment: 'API Key encrypted with AES-256-GCM'
    },
    // WhatsApp specific fields
    phoneNumberId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'phone_number_id',
      comment: 'WhatsApp Phone Number ID'
    },
    businessAccountId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'business_account_id',
      comment: 'WhatsApp Business Account ID'
    },
    verifyToken: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'verify_token',
      comment: 'WhatsApp webhook verify token'
    },
    // Additional configuration
    config: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Additional configuration in JSON format'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    lastTestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_tested_at'
    },
    lastTestSuccess: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'last_test_success'
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    updatedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'updated_by_id',
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'establishment_integrations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['establishment_id', 'type'],
        name: 'establishment_integrations_establishment_type_unique'
      },
      {
        fields: ['establishment_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['is_active']
      }
    ]
  });

  return EstablishmentIntegration;
};
