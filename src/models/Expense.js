module.exports = (sequelize, DataTypes) => {
  const Expense = sequelize.define('Expense', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    establishmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'establishmentId',
      references: {
        model: 'establishments',
        key: 'id'
      }
    },
    cashRegisterId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'cashRegisterId',
      references: {
        model: 'cash_registers',
        key: 'id'
      },
      comment: 'Turno/Caja asociado (opcional)'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'userId',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Usuario que registró el gasto'
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Categoría del gasto (ej: servicios, mantenimiento, suministros, etc.)'
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'Descripción del gasto'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Monto del gasto'
    },
    paymentMethod: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Método de pago utilizado'
    },
    invoiceNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'invoiceNumber',
      comment: 'Número de factura o comprobante'
    },
    supplier: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Proveedor o destinatario del pago'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Notas adicionales'
    },
    expenseDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'expenseDate',
      defaultValue: DataTypes.NOW,
      comment: 'Fecha del gasto'
    }
  }, {
    tableName: 'expenses',
    timestamps: true,
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        fields: ['cashRegisterId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['expenseDate']
      },
      {
        fields: ['category']
      }
    ]
  });

  return Expense;
};
