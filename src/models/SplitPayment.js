module.exports = (sequelize, DataTypes) => {
  const SplitPayment = sequelize.define('SplitPayment', {
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
      }
    },
    organizerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    amountPerPerson: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    totalParticipants: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    paidParticipants: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('pending', 'partial', 'completed', 'cancelled', 'expired'),
      defaultValue: 'pending'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    inviteCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    inviteLink: {
      type: DataTypes.STRING,
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'split_payments',
    timestamps: true,
    indexes: [
      {
        fields: ['bookingId']
      },
      {
        fields: ['organizerId']
      },
      {
        fields: ['status']
      },
      {
        unique: true,
        fields: ['inviteCode']
      },
      {
        fields: ['expiresAt']
      }
    ]
  });

  return SplitPayment;
};
