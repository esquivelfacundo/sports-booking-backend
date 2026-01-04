module.exports = (sequelize, DataTypes) => {
  const Establishment = sequelize.define('Establishment', {
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
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/i // Only alphanumeric and hyphens
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    address: {
      type: DataTypes.STRING,
      allowNull: false
    },
    city: {
      type: DataTypes.STRING,
      allowNull: false
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true
    },
    logo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    images: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    amenities: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    rules: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    openingHours: {
      type: DataTypes.JSON,
      defaultValue: {
        monday: { open: '08:00', close: '22:00', closed: false },
        tuesday: { open: '08:00', close: '22:00', closed: false },
        wednesday: { open: '08:00', close: '22:00', closed: false },
        thursday: { open: '08:00', close: '22:00', closed: false },
        friday: { open: '08:00', close: '22:00', closed: false },
        saturday: { open: '08:00', close: '22:00', closed: false },
        sunday: { open: '08:00', close: '22:00', closed: false }
      }
    },
    closedDates: {
      type: DataTypes.JSON,
      defaultValue: []  // Array of date strings like ['2025-12-25', '2025-01-01']
    },
    useNationalHolidays: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isOpen: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether the establishment is currently accepting bookings (can be toggled by owner)'
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.0,
      validate: {
        min: 0.0,
        max: 5.0
      }
    },
    totalReviews: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    priceRange: {
      type: DataTypes.ENUM('$', '$$', '$$$'),
      defaultValue: '$$'
    },
    sports: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    
    // Mercado Pago Integration
    mpUserId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Mercado Pago User ID of the establishment'
    },
    mpAccessToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'OAuth access token for receiving payments'
    },
    mpRefreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'OAuth refresh token'
    },
    mpPublicKey: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mpTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    mpEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Email of the connected MP account'
    },
    mpConnectedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    mpActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether MP account is connected and active'
    },
    
    // Custom fee override (null = use platform default)
    customFeePercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Custom platform fee for this establishment (overrides global default)'
    },
    
    // Deposit/Seña configuration
    requireDeposit: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether to require deposit for online bookings'
    },
    depositType: {
      type: DataTypes.ENUM('percentage', 'fixed'),
      defaultValue: 'percentage',
      comment: 'Type of deposit: percentage of total or fixed amount'
    },
    depositPercentage: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
      comment: 'Percentage of total to charge as deposit (if depositType is percentage)'
    },
    depositFixedAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 5000,
      comment: 'Fixed deposit amount (if depositType is fixed)'
    },
    
    // Full payment option
    allowFullPayment: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether to allow clients to pay full amount online (not just deposit)'
    },
    
    // Booking restrictions
    maxAdvanceBookingDays: {
      type: DataTypes.INTEGER,
      defaultValue: 30,
      comment: 'Maximum days in advance that bookings can be made'
    },
    minAdvanceBookingHours: {
      type: DataTypes.INTEGER,
      defaultValue: 2,
      comment: 'Minimum hours in advance required for booking'
    },
    allowSameDayBooking: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether same-day bookings are allowed'
    },
    cancellationDeadlineHours: {
      type: DataTypes.INTEGER,
      defaultValue: 24,
      comment: 'Hours before booking when cancellation is no longer allowed'
    },
    
    // Cancellation policy
    cancellationPolicy: {
      type: DataTypes.ENUM('full_refund', 'partial_refund', 'no_refund', 'credit'),
      defaultValue: 'partial_refund',
      comment: 'Policy for refunds when booking is cancelled'
    },
    refundPercentage: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
      comment: 'Percentage of payment to refund (if cancellationPolicy is partial_refund)'
    },
    
    // No-show penalty
    noShowPenalty: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether to apply penalty when client does not show up'
    },
    noShowPenaltyType: {
      type: DataTypes.ENUM('full_charge', 'deposit_only', 'percentage'),
      defaultValue: 'deposit_only',
      comment: 'Type of penalty for no-show'
    },
    noShowPenaltyPercentage: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
      comment: 'Percentage to charge for no-show (if noShowPenaltyType is percentage)'
    },
    
    // Deposit payment deadline
    depositPaymentDeadlineHours: {
      type: DataTypes.INTEGER,
      defaultValue: 2,
      comment: 'Hours allowed to complete deposit payment before booking is cancelled'
    },
    
    // API Key for external integrations (WhatsApp bot, etc.)
    apiKey: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      comment: 'API Key for external integrations like WhatsApp bot'
    },
    
    // Security PIN for owner operations
    pin: {
      type: DataTypes.STRING(4),
      allowNull: true,
      validate: {
        is: /^[0-9]{4}$/
      },
      comment: 'Security PIN for owner operations (4 digits)'
    },
    
    // Recurring booking configuration
    recurringPaymentPolicy: {
      type: DataTypes.ENUM('advance_one', 'advance_all', 'pay_on_attendance'),
      defaultValue: 'advance_one',
      comment: 'Payment policy for recurring bookings: advance_one = pay 1 booking ahead'
    },
    recurringMinWeeks: {
      type: DataTypes.INTEGER,
      defaultValue: 4,
      comment: 'Minimum weeks for a recurring booking'
    },
    recurringMaxWeeks: {
      type: DataTypes.INTEGER,
      defaultValue: 24,
      comment: 'Maximum weeks for a recurring booking'
    },
    recurringCancellationPolicy: {
      type: DataTypes.ENUM('refund_unused', 'credit', 'no_refund'),
      defaultValue: 'credit',
      comment: 'Policy for cancelling recurring bookings'
    }
  }, {
    tableName: 'establishments',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['city']
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['isVerified']
      },
      {
        fields: ['rating']
      },
      {
        fields: ['latitude', 'longitude']
      }
    ]
  });

  return Establishment;
};
