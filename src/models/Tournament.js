module.exports = (sequelize, DataTypes) => {
  const Tournament = sequelize.define('Tournament', {
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
    organizerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
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
    sport: {
      type: DataTypes.STRING,
      allowNull: false
    },
    format: {
      type: DataTypes.ENUM('single_elimination', 'double_elimination', 'round_robin', 'group_stage'),
      defaultValue: 'single_elimination'
    },
    category: {
      type: DataTypes.ENUM('open', 'men', 'women', 'mixed', 'junior', 'senior'),
      defaultValue: 'open'
    },
    skillLevel: {
      type: DataTypes.ENUM('beginner', 'intermediate', 'advanced', 'professional'),
      defaultValue: 'intermediate'
    },
    maxParticipants: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    currentParticipants: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    registrationFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    prizePool: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    prizeDistribution: {
      type: DataTypes.JSON, // {first: 50, second: 30, third: 20}
      allowNull: true
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    registrationStartDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    registrationEndDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled'),
      defaultValue: 'draft'
    },
    rules: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    images: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    requiresApproval: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    contactInfo: {
      type: DataTypes.JSON, // {email, phone, whatsapp}
      allowNull: true
    },
    brackets: {
      type: DataTypes.JSON, // Tournament bracket structure
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancellationReason: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'tournaments',
    timestamps: true,
    indexes: [
      {
        fields: ['establishmentId']
      },
      {
        fields: ['organizerId']
      },
      {
        fields: ['sport']
      },
      {
        fields: ['status']
      },
      {
        fields: ['startDate']
      },
      {
        fields: ['registrationStartDate']
      },
      {
        fields: ['registrationEndDate']
      },
      {
        fields: ['isPublic']
      }
    ]
  });

  return Tournament;
};
