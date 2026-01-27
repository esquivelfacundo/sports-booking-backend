/**
 * EstablishmentAfipConfig Model
 * Stores AFIP/ARCA configuration per establishment for electronic invoicing
 * Certificates are encrypted using AES-256-GCM
 */
module.exports = (sequelize, DataTypes) => {
  const EstablishmentAfipConfig = sequelize.define('EstablishmentAfipConfig', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    establishmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'establishment_id',
      references: {
        model: 'establishments',
        key: 'id'
      },
      comment: 'One config per establishment'
    },
    // Fiscal data
    cuit: {
      type: DataTypes.STRING(11),
      allowNull: false,
      unique: true,
      validate: {
        len: [11, 11],
        isNumeric: true
      },
      comment: 'CUIT without dashes (11 digits)'
    },
    razonSocial: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'razon_social',
      comment: 'Legal business name'
    },
    domicilioFiscal: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'domicilio_fiscal',
      comment: 'Fiscal address'
    },
    condicionFiscal: {
      type: DataTypes.ENUM('monotributista', 'responsable_inscripto'),
      allowNull: false,
      field: 'condicion_fiscal',
      comment: 'Tax condition determines invoice types (A/B vs C)'
    },
    inicioActividades: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'inicio_actividades',
      comment: 'Business start date for AFIP'
    },
    // Encrypted certificates (AES-256-GCM)
    encryptedCert: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'encrypted_cert',
      comment: 'Certificate (.crt) encrypted with AES-256-GCM as JSON {iv, authTag, content}'
    },
    encryptedKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'encrypted_key',
      comment: 'Private key (.key) encrypted with AES-256-GCM as JSON {iv, authTag, content}'
    },
    certExpiration: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'cert_expiration',
      comment: 'Certificate expiration date for alerting'
    },
    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_active',
      comment: 'Only active if verified with AFIP'
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_verified',
      comment: 'True after successful WSAA test'
    },
    lastTestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_tested_at'
    },
    lastTestResult: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'last_test_result',
      comment: 'Full response from last WSAA test'
    },
    // Audit
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
    tableName: 'establishment_afip_configs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['establishment_id'],
        name: 'establishment_afip_configs_establishment_unique'
      },
      {
        unique: true,
        fields: ['cuit'],
        name: 'establishment_afip_configs_cuit_unique'
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['is_verified']
      }
    ]
  });

  return EstablishmentAfipConfig;
};
