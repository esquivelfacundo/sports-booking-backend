module.exports = (sequelize, DataTypes) => {
  const Amenity = sequelize.define('Amenity', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    establishmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'establishments',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Nombre del amenity (ej: Quincho, Pileta, Vestuario)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    icon: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Nombre del icono de Lucide'
    },
    images: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    // Pricing
    pricePerHour: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Precio por hora (0 = gratis)'
    },
    pricePerHour90: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Precio por 1.5 horas'
    },
    pricePerHour120: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Precio por 2 horas'
    },
    // Availability settings
    isBookable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Si se puede reservar como item independiente'
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Si aparece para que los clientes lo reserven (false = solo gestión interna)'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    // Capacity
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Capacidad máxima de personas'
    },
    // Schedule - can have different hours than the establishment
    customSchedule: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Horarios personalizados (null = usa horarios del establecimiento)'
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'amenities',
    timestamps: true,
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['isPublic']
      },
      {
        fields: ['isBookable']
      }
    ]
  });

  return Amenity;
};
