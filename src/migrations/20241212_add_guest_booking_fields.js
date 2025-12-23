'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add guest booking fields to bookings table
    await queryInterface.addColumn('bookings', 'clientName', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('bookings', 'clientPhone', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('bookings', 'clientEmail', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('bookings', 'bookingType', {
      type: Sequelize.STRING,
      defaultValue: 'normal'
    });

    await queryInterface.addColumn('bookings', 'isRecurring', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });

    await queryInterface.addColumn('bookings', 'depositAmount', {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 0
    });

    await queryInterface.addColumn('bookings', 'depositMethod', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('bookings', 'clientName');
    await queryInterface.removeColumn('bookings', 'clientPhone');
    await queryInterface.removeColumn('bookings', 'clientEmail');
    await queryInterface.removeColumn('bookings', 'bookingType');
    await queryInterface.removeColumn('bookings', 'isRecurring');
    await queryInterface.removeColumn('bookings', 'depositAmount');
    await queryInterface.removeColumn('bookings', 'depositMethod');
  }
};
