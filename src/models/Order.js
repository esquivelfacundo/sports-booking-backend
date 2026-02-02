module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    orderNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      field: 'orderNumber'
    },
    establishmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'establishmentId'
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'bookingId'
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clientId'
    },
    customerName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'customerName'
    },
    customerPhone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'customerPhone'
    },
    customerEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'customerEmail'
    },
    orderType: {
      type: DataTypes.ENUM('direct_sale', 'booking_consumption'),
      allowNull: false,
      defaultValue: 'direct_sale',
      field: 'orderType'
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'cancelled', 'refunded'),
      allowNull: false,
      defaultValue: 'pending'
    },
    paymentStatus: {
      type: DataTypes.ENUM('pending', 'partial', 'paid', 'refunded'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'paymentStatus'
    },
    paymentMethod: {
      type: DataTypes.ENUM('cash', 'card', 'transfer', 'mixed', 'pending'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'paymentMethod'
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    paidAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'paidAmount'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true, // Allow null for staff users (their IDs are in establishment_staff, not users)
      field: 'createdBy'
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'invoice_id',
      references: {
        model: 'invoices',
        key: 'id'
      },
      comment: 'Reference to AFIP invoice if invoiced'
    }
  }, {
    tableName: 'orders',
    timestamps: true
  });

  return Order;
};
