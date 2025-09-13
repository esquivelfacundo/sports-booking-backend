module.exports = (sequelize, DataTypes) => {
  const SplitPaymentParticipant = sequelize.define('SplitPaymentParticipant', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    splitPaymentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'split_payments',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true, // Can be null for anonymous participants
      references: {
        model: 'users',
        key: 'id'
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true, // For anonymous participants
      validate: {
        isEmail: true
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true // For anonymous participants
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'cancelled'),
      defaultValue: 'pending'
    },
    paymentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'payments',
        key: 'id'
      }
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    invitedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    remindersSent: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lastReminderAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'split_payment_participants',
    timestamps: true,
    indexes: [
      {
        fields: ['splitPaymentId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['email']
      },
      {
        fields: ['status']
      },
      {
        unique: true,
        fields: ['splitPaymentId', 'userId']
      },
      {
        unique: true,
        fields: ['splitPaymentId', 'email']
      }
    ]
  });

  return SplitPaymentParticipant;
};
