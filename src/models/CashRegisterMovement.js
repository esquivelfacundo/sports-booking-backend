module.exports = (sequelize, DataTypes) => {
  const CashRegisterMovement = sequelize.define('CashRegisterMovement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    cashRegisterId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'cash_registers',
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
    type: {
      type: DataTypes.ENUM('sale', 'expense', 'initial_cash', 'cash_withdrawal', 'adjustment'),
      allowNull: false,
      comment: 'sale: venta, expense: gasto, initial_cash: efectivo inicial, cash_withdrawal: retiro, adjustment: ajuste'
    },
    // Relaciones opcionales
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
    expenseCategoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'expense_categories',
        key: 'id'
      },
      comment: 'Categoría de gasto (solo para type=expense)'
    },
    // Montos
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Monto (positivo para ingresos, negativo para egresos)'
    },
    paymentMethod: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'cash, card, transfer, credit_card, debit_card, mercadopago, etc.'
    },
    // Detalles
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Metadata
    registeredBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Usuario que registró el movimiento'
    },
    registeredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'cash_register_movements',
    timestamps: true,
    indexes: [
      {
        fields: ['cashRegisterId']
      },
      {
        fields: ['establishmentId']
      },
      {
        fields: ['type']
      },
      {
        fields: ['paymentMethod']
      },
      {
        fields: ['registeredAt']
      },
      {
        fields: ['orderId']
      },
      {
        fields: ['bookingId']
      }
    ]
  });

  return CashRegisterMovement;
};
