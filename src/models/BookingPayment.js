'use strict';

module.exports = (sequelize, DataTypes) => {
  const BookingPayment = sequelize.define('BookingPayment', {
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
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    method: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'cash',
      comment: 'Payment method: cash, transfer, card, mercadopago'
    },
    playerName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Name of the player who made this payment'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    mpPaymentId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'MercadoPago payment ID if applicable'
    },
    registeredBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'User who registered this payment (establishment owner/staff)'
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'booking_payments',
    timestamps: true,
    indexes: [
      { fields: ['bookingId'] },
      { fields: ['paidAt'] }
    ]
  });

  return BookingPayment;
};
