module.exports = (sequelize, DataTypes) => {
  const OrderPayment = sequelize.define('OrderPayment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'orderId'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    paymentMethod: {
      type: DataTypes.ENUM('cash', 'card', 'transfer'),
      allowNull: false,
      field: 'paymentMethod'
    },
    reference: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    registeredBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'registeredBy'
    }
  }, {
    tableName: 'order_payments',
    timestamps: true,
    updatedAt: false
  });

  return OrderPayment;
};
