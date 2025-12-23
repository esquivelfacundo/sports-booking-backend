module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define('Product', {
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
    categoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'product_categories',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    barcode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    sku: {
      type: DataTypes.STRING,
      allowNull: true
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Pricing
    costPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Precio de costo'
    },
    salePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Precio de venta'
    },
    profitMargin: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Margen de ganancia en porcentaje'
    },
    // Stock
    currentStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Stock actual'
    },
    minStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Stock mínimo'
    },
    maxStock: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Stock máximo'
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'unidad',
      comment: 'Unidad de medida (unidad, kg, litro, etc.)'
    },
    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    trackStock: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Si se debe controlar el stock de este producto'
    }
  }, {
    tableName: 'products',
    timestamps: true,
    underscored: false,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        fields: ['categoryId']
      },
      {
        fields: ['barcode']
      },
      {
        fields: ['isActive']
      }
    ]
  });

  return Product;
};
