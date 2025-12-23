module.exports = (sequelize, DataTypes) => {
  const EstablishmentStaff = sequelize.define('EstablishmentStaff', {
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
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    role: {
      type: DataTypes.ENUM('admin', 'manager', 'receptionist', 'staff'),
      defaultValue: 'staff'
    },
    permissions: {
      type: DataTypes.JSON,
      defaultValue: {}
      // Example: { bookings: { view: true, create: true, edit: true, delete: false }, finance: { view: false }, settings: { view: false } }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    pin: {
      type: DataTypes.STRING(4),
      allowNull: true,
      validate: {
        is: /^[0-9]{4}$/
      }
    }
  }, {
    tableName: 'establishment_staff',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['establishmentId', 'email']
      },
      {
        fields: ['establishmentId']
      },
      {
        fields: ['role']
      },
      {
        fields: ['isActive']
      }
    ]
  });

  EstablishmentStaff.associate = (models) => {
    EstablishmentStaff.belongsTo(models.Establishment, {
      foreignKey: 'establishmentId',
      as: 'establishment'
    });
  };

  return EstablishmentStaff;
};
