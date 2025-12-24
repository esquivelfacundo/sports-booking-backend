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
      type: DataTypes.JSON, // {courtCondition: 5, cleanliness: 4, customerService: 5, valueForMoney: 4, punctuality: 5}
      defaultValue: {}
    },
    // NPS Score (0-10): Would you recommend this place?
    npsScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 10
      }
    },
    // Source of the review
    source: {
      type: DataTypes.ENUM('app', 'qr_ticket', 'email_link', 'whatsapp_link', 'manual'),
      defaultValue: 'app'
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
