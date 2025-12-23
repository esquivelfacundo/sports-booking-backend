module.exports = (sequelize, DataTypes) => {
  const BookingConsumption = sequelize.define('BookingConsumption', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  bookingId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'bookings',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    },
    onDelete: 'RESTRICT'
  },
  establishmentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'establishments',
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 1
    }
  },
  unitPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Precio unitario al momento de la venta'
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Precio total (quantity * unitPrice)'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  addedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'Usuario que agregó el consumo'
  }
}, {
  tableName: 'booking_consumptions',
  timestamps: true,
  underscored: false,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['bookingId']
    },
    {
      fields: ['productId']
    },
    {
      fields: ['establishmentId']
    },
    {
      fields: ['createdAt']
    }
  ]
  });

  return BookingConsumption;
};
