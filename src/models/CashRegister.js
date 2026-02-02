module.exports = (sequelize, DataTypes) => {
  const CashRegister = sequelize.define('CashRegister', {
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
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Usuario (owner) que abrió la caja'
    },
    staffId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Staff que abrió la caja (now references users table)'
    },
    openedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('open', 'closed'),
      allowNull: false,
      defaultValue: 'open'
    },
    // Montos de efectivo
    initialCash: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Efectivo inicial declarado'
    },
    expectedCash: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Efectivo esperado (calculado)'
    },
    actualCash: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Efectivo real al cerrar'
    },
    cashDifference: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Diferencia al cerrar'
    },
    // Totales por método de pago
    totalCash: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    totalCard: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    totalTransfer: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    totalCreditCard: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    totalDebitCard: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    totalMercadoPago: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    totalOther: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    // Totales generales
    totalSales: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Total de ventas (ingresos)'
    },
    totalExpenses: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Total de gastos (egresos)'
    },
    totalOrders: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Cantidad de pedidos'
    },
    totalMovements: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Cantidad total de movimientos'
    },
    // Notas
    openingNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    closingNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'cash_registers',
    timestamps: true,
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['staffId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['openedAt']
      }
    ]
  });

  return CashRegister;
};
