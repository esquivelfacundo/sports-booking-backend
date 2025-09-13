module.exports = (sequelize, DataTypes) => {
  const Court = sequelize.define('Court', {
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
      allowNull: false
    },
    sport: {
      type: DataTypes.STRING,
      allowNull: false
    },
    surface: {
      type: DataTypes.ENUM('grass', 'clay', 'hard', 'synthetic', 'indoor', 'outdoor'),
      allowNull: true
    },
    isIndoor: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    capacity: {
      type: DataTypes.INTEGER,
      defaultValue: 4
    },
    pricePerHour: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    pricePerHour90: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    pricePerHour120: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    images: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    amenities: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    dimensions: {
      type: DataTypes.JSON, // {length, width, unit}
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    rules: {
      type: DataTypes.JSON,
      defaultValue: []
    }
  }, {
    tableName: 'courts',
    timestamps: true,
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        fields: ['sport']
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['pricePerHour']
      }
    ]
  });

  return Court;
};
