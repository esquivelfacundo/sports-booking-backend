module.exports = (sequelize, DataTypes) => {
  const TimeSlot = sequelize.define('TimeSlot', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    courtId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'courts',
        key: 'id'
      }
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
      allowNull: false,
      defaultValue: 60
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    isAvailable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isBlocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    blockReason: {
      type: DataTypes.STRING,
      allowNull: true
    },
    recurringPattern: {
      type: DataTypes.JSON, // For recurring time slots
      allowNull: true
    }
  }, {
    tableName: 'time_slots',
    timestamps: true,
    indexes: [
      {
        fields: ['courtId']
      },
      {
        fields: ['date']
      },
      {
        fields: ['startTime']
      },
      {
        fields: ['isAvailable']
      },
      {
        unique: true,
        fields: ['courtId', 'date', 'startTime']
      }
    ]
  });

  return TimeSlot;
};
