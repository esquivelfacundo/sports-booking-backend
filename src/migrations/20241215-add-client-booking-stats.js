'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new booking stats columns to clients table
    await queryInterface.addColumn('clients', 'completedBookings', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false
    });

    await queryInterface.addColumn('clients', 'pendingBookings', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false
    });

    await queryInterface.addColumn('clients', 'cancelledBookings', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false
    });

    await queryInterface.addColumn('clients', 'noShowBookings', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false
    });

    await queryInterface.addColumn('clients', 'lastCompletedBookingDate', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });

    // Add clientId to bookings table
    await queryInterface.addColumn('bookings', 'clientId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'clients',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index for clientId
    await queryInterface.addIndex('bookings', ['clientId']);

    // Migrate existing noShows data to noShowBookings (if column exists)
    try {
      await queryInterface.sequelize.query(`
        UPDATE clients SET "noShowBookings" = "noShows" WHERE "noShows" > 0
      `);
    } catch (e) {
      console.log('noShows column may not exist, skipping migration');
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('clients', 'completedBookings');
    await queryInterface.removeColumn('clients', 'pendingBookings');
    await queryInterface.removeColumn('clients', 'cancelledBookings');
    await queryInterface.removeColumn('clients', 'noShowBookings');
    await queryInterface.removeColumn('clients', 'lastCompletedBookingDate');
    await queryInterface.removeColumn('bookings', 'clientId');
  }
};
