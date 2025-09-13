module.exports = (sequelize, DataTypes) => {
  const AvailableMatch = sequelize.define('AvailableMatch', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizerId: {
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
      allowNull: false,
      references: {
        model: 'courts',
        key: 'id'
      }
    },
    sport: {
      type: DataTypes.STRING,
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false
    },
    duration: {
      type: DataTypes.INTEGER, // in minutes
      allowNull: false
    },
    maxParticipants: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    currentParticipants: {
      type: DataTypes.INTEGER,
      defaultValue: 1 // Organizer counts as 1
    },
    pricePerPerson: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    skillLevel: {
      type: DataTypes.ENUM('beginner', 'intermediate', 'advanced', 'mixed'),
      defaultValue: 'mixed'
    },
    isPrivate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    inviteCode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    rules: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    status: {
      type: DataTypes.ENUM('open', 'full', 'cancelled', 'completed'),
      defaultValue: 'open'
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancellationReason: {
      type: DataTypes.STRING,
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'available_matches',
    timestamps: true,
    indexes: [
      {
        fields: ['organizerId']
      },
      {
        fields: ['establishmentId']
      },
      {
        fields: ['courtId']
      },
      {
        fields: ['sport']
      },
      {
        fields: ['date']
      },
      {
        fields: ['status']
      },
      {
        fields: ['skillLevel']
      },
      {
        unique: true,
        fields: ['inviteCode']
      }
    ]
  });

  return AvailableMatch;
};
