module.exports = (sequelize, DataTypes) => {
  const Establishment = sequelize.define('Establishment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    address: {
      type: DataTypes.STRING,
      allowNull: false
    },
    city: {
      type: DataTypes.STRING,
      allowNull: false
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true
    },
    logo: {
      type: DataTypes.STRING,
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
    rules: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    openingHours: {
      type: DataTypes.JSON,
      defaultValue: {
        monday: { open: '08:00', close: '22:00', closed: false },
        tuesday: { open: '08:00', close: '22:00', closed: false },
        wednesday: { open: '08:00', close: '22:00', closed: false },
        thursday: { open: '08:00', close: '22:00', closed: false },
        friday: { open: '08:00', close: '22:00', closed: false },
        saturday: { open: '08:00', close: '22:00', closed: false },
        sunday: { open: '08:00', close: '22:00', closed: false }
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.0,
      validate: {
        min: 0.0,
        max: 5.0
      }
    },
    totalReviews: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    priceRange: {
      type: DataTypes.ENUM('$', '$$', '$$$'),
      defaultValue: '$$'
    },
    sports: {
      type: DataTypes.JSON,
      defaultValue: []
    }
  }, {
    tableName: 'establishments',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['city']
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['isVerified']
      },
      {
        fields: ['rating']
      },
      {
        fields: ['latitude', 'longitude']
      }
    ]
  });

  return Establishment;
};
