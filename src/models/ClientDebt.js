module.exports = (sequelize, DataTypes) => {
  const ClientDebt = sequelize.define('ClientDebt', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'clients',
        key: 'id'
      },
      comment: 'Client who owes the debt (if registered)'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'User who owes the debt (alternative to clientId)'
    },
    clientEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Email to identify the debtor (works even without account)'
    },
    establishmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'establishments',
        key: 'id'
      },
      comment: 'Establishment to which the debt is owed'
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'bookings',
        key: 'id'
      },
      comment: 'Booking that originated the debt (if applicable)'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Amount of the debt'
    },
    reason: {
      type: DataTypes.ENUM('late_cancellation', 'no_show', 'other'),
      allowNull: false,
      comment: 'Reason for the debt'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional description of the debt'
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'forgiven', 'disputed'),
      defaultValue: 'pending',
      comment: 'Current status of the debt'
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the debt was paid'
    },
    paidBookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'bookings',
        key: 'id'
      },
      comment: 'Booking in which the debt was paid'
    },
    forgivenBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'User who forgave the debt (if applicable)'
    },
    forgivenAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    forgivenReason: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'client_debts',
    timestamps: true,
    indexes: [
      {
        fields: ['clientId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['clientEmail']
      },
      {
        fields: ['establishmentId']
      },
      {
        fields: ['bookingId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['establishmentId', 'clientEmail', 'status']
      }
    ]
  });

  return ClientDebt;
};
