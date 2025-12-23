module.exports = (sequelize, DataTypes) => {
  const CurrentAccount = sequelize.define('CurrentAccount', {
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
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'clients',
        key: 'id'
      }
    },
    staffId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'establishment_staff',
        key: 'id'
      }
    },
    // Account holder info (denormalized for quick access)
    holderName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    holderPhone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    holderEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Account type
    accountType: {
      type: DataTypes.ENUM('employee', 'client', 'supplier', 'other'),
      defaultValue: 'client'
    },
    // Benefits - can override global settings
    useCostPrice: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'If true, products are sold at cost price'
    },
    discountPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: 'Discount percentage on sale price (0-100)'
    },
    creditLimit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Maximum credit allowed (null = unlimited)'
    },
    // Balance tracking
    currentBalance: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Current balance (positive = owes money, negative = credit)'
    },
    totalPurchases: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    totalPayments: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'current_accounts',
    timestamps: true,
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        fields: ['clientId']
      },
      {
        fields: ['staffId']
      },
      {
        fields: ['accountType']
      },
      {
        fields: ['isActive']
      }
    ]
  });

  return CurrentAccount;
};
