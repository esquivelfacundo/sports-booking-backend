/**
 * EstablishmentAfipPuntoVenta Model
 * Stores AFIP Points of Sale (Puntos de Venta) per establishment
 * Each establishment can have multiple points of sale
 */
module.exports = (sequelize, DataTypes) => {
  const EstablishmentAfipPuntoVenta = sequelize.define('EstablishmentAfipPuntoVenta', {
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
    afipConfigId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'afip_config_id',
      references: {
        model: 'establishment_afip_configs',
        key: 'id'
      }
    },
    // Point of Sale data
    numero: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 99999
      },
      comment: 'AFIP Point of Sale number (1-99999)'
    },
    descripcion: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Description: "Caja Principal", "Kiosco", etc.'
    },
    // Status
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_default',
      comment: 'Default point of sale for this establishment'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'establishment_afip_puntos_venta',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['afip_config_id', 'numero'],
        name: 'afip_puntos_venta_config_numero_unique'
      },
      {
        fields: ['establishment_id']
      },
      {
        fields: ['afip_config_id']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['is_default']
      }
    ]
  });

  return EstablishmentAfipPuntoVenta;
};
