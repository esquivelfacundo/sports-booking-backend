module.exports = (sequelize, DataTypes) => {
  const Favorite = sequelize.define('Favorite', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    establishmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'establishments',
        key: 'id'
      }
    }
  }, {
    tableName: 'favorites',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['establishmentId']
      },
      {
        unique: true,
        fields: ['userId', 'establishmentId']
      }
    ]
  });

  return Favorite;
};
