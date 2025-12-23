module.exports = (sequelize, DataTypes) => {
  const StockMovement = sequelize.define('StockMovement', {
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
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Usuario que realizó el movimiento'
    },
    type: {
      type: DataTypes.ENUM('entrada', 'salida', 'ajuste', 'venta', 'merma'),
      allowNull: false,
      comment: 'Tipo de movimiento'
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Cantidad (positiva para entradas, negativa para salidas)'
    },
    previousStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Stock antes del movimiento'
    },
    newStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Stock después del movimiento'
    },
    unitCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Costo unitario (para entradas)'
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Costo total del movimiento'
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Motivo del movimiento'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    referenceType: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Tipo de referencia (sale, purchase_order, etc.)'
    },
    referenceId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'ID de la venta, orden de compra, etc.'
    },
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Número de factura o remito'
    }
  }, {
    tableName: 'stock_movements',
    timestamps: true,
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        fields: ['productId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['type']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  return StockMovement;
};
