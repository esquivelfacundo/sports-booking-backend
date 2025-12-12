module.exports = (sequelize, DataTypes) => {
  const TournamentParticipant = sequelize.define('TournamentParticipant', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tournaments',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    teamName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    players: {
      type: DataTypes.JSON, // Array of player info for team tournaments
      defaultValue: []
    },
    status: {
      type: DataTypes.ENUM('registered', 'confirmed', 'checked_in', 'eliminated', 'winner', 'cancelled'),
      defaultValue: 'registered'
    },
    paymentStatus: {
      type: DataTypes.ENUM('pending', 'paid', 'refunded'),
      defaultValue: 'pending'
    },
    paymentId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    seed: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    bracketPosition: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    wins: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    losses: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    points: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    registeredAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'tournament_participants',
    timestamps: true,
    indexes: [
      {
        fields: ['tournamentId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['paymentStatus']
      },
      {
        unique: true,
        fields: ['tournamentId', 'userId']
      }
    ]
  });

  return TournamentParticipant;
};
