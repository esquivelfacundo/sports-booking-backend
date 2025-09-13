module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define('Review', {
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
    },
    courtId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'courts',
        key: 'id'
      }
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'bookings',
        key: 'id'
      }
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5
      }
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    images: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    aspects: {
      type: DataTypes.JSON, // {facilities: 5, staff: 4, cleanliness: 5, value: 4}
      defaultValue: {}
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false // True if user actually had a booking
    },
    isAnonymous: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    establishmentResponse: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    establishmentResponseAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    helpfulVotes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    reportCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    isHidden: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'reviews',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['establishmentId']
      },
      {
        fields: ['courtId']
      },
      {
        fields: ['bookingId']
      },
      {
        fields: ['rating']
      },
      {
        fields: ['isVerified']
      },
      {
        fields: ['isHidden']
      }
    ]
  });

  return Review;
};
