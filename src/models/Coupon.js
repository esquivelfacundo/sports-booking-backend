module.exports = (sequelize, DataTypes) => {
  const Coupon = sequelize.define('Coupon', {
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
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Unique coupon code (per establishment)'
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Internal name for the coupon'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Description shown to customers'
    },
    // Discount type and value
    discountType: {
      type: DataTypes.ENUM('percentage', 'fixed_amount', 'free_booking'),
      allowNull: false,
      defaultValue: 'percentage'
    },
    discountValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Percentage (0-100) or fixed amount'
    },
    // Limits
    maxDiscount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Maximum discount amount (for percentage discounts)'
    },
    minPurchaseAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Minimum purchase amount to apply coupon'
    },
    // Usage limits
    usageLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Total number of times this coupon can be used (null = unlimited)'
    },
    usageLimitPerUser: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
      comment: 'Number of times a single user can use this coupon'
    },
    usageCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Current usage count'
    },
    // Validity period
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the coupon becomes valid'
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the coupon expires'
    },
    // Restrictions
    applicableCourts: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of court IDs this coupon applies to (empty = all courts)'
    },
    applicableSports: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of sport types this coupon applies to (empty = all sports)'
    },
    applicableDays: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of weekdays (0-6) this coupon applies to (empty = all days)'
    },
    applicableTimeSlots: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of time ranges {start: "08:00", end: "12:00"} (empty = all times)'
    },
    // Customer restrictions
    newCustomersOnly: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Only valid for first-time customers'
    },
    specificUsers: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of user IDs that can use this coupon (empty = all users)'
    },
    specificClients: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of client IDs that can use this coupon (empty = all clients)'
    },
    // Combinability
    excludeSaleItems: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Cannot be used with already discounted items'
    },
    individualUseOnly: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Cannot be combined with other coupons'
    },
    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    // Metadata
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Staff or owner who created the coupon'
    }
  }, {
    tableName: 'coupons',
    timestamps: true,
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        unique: true,
        fields: ['establishmentId', 'code'],
        name: 'coupons_establishment_code_unique'
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['startDate', 'endDate']
      }
    ]
  });

  return Coupon;
};
