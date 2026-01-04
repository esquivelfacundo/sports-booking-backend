module.exports = (sequelize, DataTypes) => {
  const RecurringBookingGroup = sequelize.define('RecurringBookingGroup', {
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
    clientName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    clientPhone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    clientEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    courtId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'courts',
        key: 'id'
      },
      comment: 'Primary/preferred court for this recurring booking'
    },
    dayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '0=Sunday, 1=Monday, ..., 6=Saturday'
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
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Duration in minutes'
    },
    sport: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bookingType: {
      type: DataTypes.STRING,
      defaultValue: 'normal'
    },
    totalOccurrences: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Total number of bookings in this group'
    },
    completedOccurrences: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of completed bookings'
    },
    cancelledOccurrences: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of cancelled bookings'
    },
    pricePerBooking: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    totalPaid: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Total amount paid across all bookings'
    },
    paidBookingsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of bookings that have been paid for'
    },
    status: {
      type: DataTypes.ENUM('active', 'paused', 'completed', 'cancelled'),
      defaultValue: 'active'
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'Date of first booking'
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Date of last booking'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'recurring_booking_groups',
    timestamps: true,
    indexes: [
      { fields: ['establishmentId'] },
      { fields: ['clientId'] },
      { fields: ['courtId'] },
      { fields: ['status'] },
      { fields: ['dayOfWeek', 'startTime'] }
    ]
  });

  return RecurringBookingGroup;
};
