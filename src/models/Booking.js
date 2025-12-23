module.exports = (sequelize, DataTypes) => {
  const Booking = sequelize.define('Booking', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true, // Allow null for guest bookings created by staff
      references: {
        model: 'users',
        key: 'id'
      }
    },
    createdByStaffId: {
      type: DataTypes.UUID,
      allowNull: true, // Set when booking is created by staff
      references: {
        model: 'establishment_staff',
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
      allowNull: true, // Allow null for amenity bookings
      references: {
        model: 'courts',
        key: 'id'
      }
    },
    amenityId: {
      type: DataTypes.UUID,
      allowNull: true, // Set when booking an amenity instead of a court
      references: {
        model: 'amenities',
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
      allowNull: false
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled'),
      defaultValue: 'pending'
    },
    paymentStatus: {
      type: DataTypes.ENUM('pending', 'partial', 'completed', 'refunded', 'failed'),
      defaultValue: 'pending'
    },
    paymentType: {
      type: DataTypes.ENUM('full', 'split'),
      defaultValue: 'full'
    },
    playerCount: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Client reference (for establishment clients)
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'clients',
        key: 'id'
      }
    },
    // Guest booking fields (for admin-created bookings without client record)
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
    bookingType: {
      type: DataTypes.STRING,
      defaultValue: 'normal'
    },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    depositAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    initialDeposit: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Original deposit amount paid at booking time (does not change with partial payments)'
    },
    depositPercent: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Deposit percentage applied at booking time (e.g., 30, 50, 100)'
    },
    depositMethod: {
      type: DataTypes.STRING,
      allowNull: true
    },
    serviceFee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Platform service fee charged on this booking'
    },
    mpPaymentId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'MercadoPago payment ID'
    },
    mpPreferenceId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'MercadoPago preference ID'
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the payment was completed'
    },
    cancellationReason: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the booking was started (in_progress)'
    },
    reminderSent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    checkInCode: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'bookings',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['createdByStaffId']
      },
      {
        fields: ['establishmentId']
      },
      {
        fields: ['courtId']
      },
      {
        fields: ['clientId']
      },
      {
        fields: ['date']
      },
      {
        fields: ['status']
      },
      {
        fields: ['paymentStatus']
      },
      {
        unique: true,
        fields: ['courtId', 'date', 'startTime']
      }
    ]
  });

  return Booking;
};
