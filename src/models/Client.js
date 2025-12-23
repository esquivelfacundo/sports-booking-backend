module.exports = (sequelize, DataTypes) => {
  const Client = sequelize.define('Client', {
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
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Stats - Booking counts by status
    totalBookings: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    completedBookings: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    pendingBookings: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    cancelledBookings: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    noShowBookings: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lastCompletedBookingDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    totalSpent: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    lastBookingDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    hasDebt: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    debtAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    }
  }, {
    tableName: 'clients',
    timestamps: true,
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        fields: ['phone']
      },
      {
        fields: ['email']
      },
      {
        fields: ['name']
      }
    ]
  });

  return Client;
};
