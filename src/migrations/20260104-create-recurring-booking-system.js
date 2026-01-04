'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create recurring_booking_groups table
    await queryInterface.createTable('recurring_booking_groups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      establishmentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'establishments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      clientId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'clients',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      clientName: {
        type: Sequelize.STRING,
        allowNull: true
      },
      clientPhone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      clientEmail: {
        type: Sequelize.STRING,
        allowNull: true
      },
      courtId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'courts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Primary/preferred court for this recurring booking'
      },
      dayOfWeek: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '0=Sunday, 1=Monday, ..., 6=Saturday'
      },
      startTime: {
        type: Sequelize.TIME,
        allowNull: false
      },
      endTime: {
        type: Sequelize.TIME,
        allowNull: false
      },
      duration: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Duration in minutes'
      },
      sport: {
        type: Sequelize.STRING,
        allowNull: true
      },
      bookingType: {
        type: Sequelize.STRING,
        defaultValue: 'normal'
      },
      totalOccurrences: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Total number of bookings in this group'
      },
      completedOccurrences: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Number of completed bookings'
      },
      cancelledOccurrences: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Number of cancelled bookings'
      },
      pricePerBooking: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      totalPaid: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        comment: 'Total amount paid across all bookings'
      },
      paidBookingsCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Number of bookings that have been paid for'
      },
      status: {
        type: Sequelize.ENUM('active', 'paused', 'completed', 'cancelled'),
        defaultValue: 'active'
      },
      startDate: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Date of first booking'
      },
      endDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'Date of last booking'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      createdBy: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // 2. Add indexes to recurring_booking_groups
    await queryInterface.addIndex('recurring_booking_groups', ['establishmentId']);
    await queryInterface.addIndex('recurring_booking_groups', ['clientId']);
    await queryInterface.addIndex('recurring_booking_groups', ['courtId']);
    await queryInterface.addIndex('recurring_booking_groups', ['status']);
    await queryInterface.addIndex('recurring_booking_groups', ['dayOfWeek', 'startTime']);

    // 3. Add recurring fields to bookings table
    await queryInterface.addColumn('bookings', 'recurringGroupId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'recurring_booking_groups',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('bookings', 'recurringSequence', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Position in the recurring series (1, 2, 3...)'
    });

    await queryInterface.addColumn('bookings', 'recurringPaymentStatus', {
      type: Sequelize.ENUM('not_applicable', 'pending', 'paid', 'paid_in_advance'),
      defaultValue: 'not_applicable',
      comment: 'Payment status specific to recurring booking logic'
    });

    await queryInterface.addColumn('bookings', 'paidForNextId', {
      type: Sequelize.UUID,
      allowNull: true,
      comment: 'ID of the next booking that was paid when attending this one'
    });

    // 4. Add index for recurringGroupId
    await queryInterface.addIndex('bookings', ['recurringGroupId']);

    // 5. Add recurring configuration fields to establishments
    await queryInterface.addColumn('establishments', 'recurringPaymentPolicy', {
      type: Sequelize.ENUM('advance_one', 'advance_all', 'pay_on_attendance'),
      defaultValue: 'advance_one',
      comment: 'Payment policy for recurring bookings: advance_one = pay 1 booking ahead'
    });

    await queryInterface.addColumn('establishments', 'recurringMinWeeks', {
      type: Sequelize.INTEGER,
      defaultValue: 4,
      comment: 'Minimum weeks for a recurring booking'
    });

    await queryInterface.addColumn('establishments', 'recurringMaxWeeks', {
      type: Sequelize.INTEGER,
      defaultValue: 24,
      comment: 'Maximum weeks for a recurring booking'
    });

    await queryInterface.addColumn('establishments', 'recurringCancellationPolicy', {
      type: Sequelize.ENUM('refund_unused', 'credit', 'no_refund'),
      defaultValue: 'credit',
      comment: 'Policy for cancelling recurring bookings'
    });

    console.log('✅ Migration completed: Recurring booking system created');
  },

  down: async (queryInterface, Sequelize) => {
    // Remove establishment columns
    await queryInterface.removeColumn('establishments', 'recurringPaymentPolicy');
    await queryInterface.removeColumn('establishments', 'recurringMinWeeks');
    await queryInterface.removeColumn('establishments', 'recurringMaxWeeks');
    await queryInterface.removeColumn('establishments', 'recurringCancellationPolicy');

    // Remove booking columns
    await queryInterface.removeColumn('bookings', 'paidForNextId');
    await queryInterface.removeColumn('bookings', 'recurringPaymentStatus');
    await queryInterface.removeColumn('bookings', 'recurringSequence');
    await queryInterface.removeColumn('bookings', 'recurringGroupId');

    // Drop recurring_booking_groups table
    await queryInterface.dropTable('recurring_booking_groups');

    // Drop ENUMs
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_recurring_booking_groups_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_bookings_recurringPaymentStatus";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_establishments_recurringPaymentPolicy";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_establishments_recurringCancellationPolicy";');

    console.log('✅ Migration reverted: Recurring booking system removed');
  }
};
