module.exports = (sequelize, DataTypes) => {
  const CurrentAccountMovement = sequelize.define('CurrentAccountMovement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    currentAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'current_accounts',
        key: 'id'
      }
    },
    establishmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'establishments',
        key: 'id'
      }
    },
    // Movement type
    movementType: {
      type: DataTypes.ENUM('purchase', 'payment', 'adjustment', 'refund'),
      allowNull: false
    },
    // Amount (positive for purchases/debits, negative for payments/credits)
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    // Balance after this movement
    balanceAfter: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    // Reference to related entities
    orderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'orders',
        key: 'id'
      }
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'bookings',
        key: 'id'
      }
    },
    // Payment details (for payment movements)
    paymentMethod: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Description
    description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Who registered this movement
    registeredBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'current_account_movements',
    timestamps: true,
    indexes: [
      {
        fields: ['currentAccountId']
      },
      {
        fields: ['establishmentId']
      },
      {
        fields: ['orderId']
      },
      {
        fields: ['bookingId']
      },
      {
        fields: ['movementType']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  return CurrentAccountMovement;
};
