module.exports = (sequelize, DataTypes) => {
  const CouponUsage = sequelize.define('CouponUsage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    couponId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'coupons',
        key: 'id'
      }
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'bookings',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'clients',
        key: 'id'
      }
    },
    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Actual discount amount applied'
    },
    originalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Original booking amount before discount'
    }
  }, {
    tableName: 'coupon_usages',
    timestamps: true,
    indexes: [
      {
        fields: ['couponId']
      },
      {
        fields: ['bookingId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['clientId']
      }
    ]
  });

  return CouponUsage;
};
