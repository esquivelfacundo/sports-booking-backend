'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add serviceFee column
    await queryInterface.addColumn('bookings', 'serviceFee', {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: true
    });

    // Add mpPaymentId column
    await queryInterface.addColumn('bookings', 'mpPaymentId', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // Add mpPreferenceId column
    await queryInterface.addColumn('bookings', 'mpPreferenceId', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // Add paidAt column
    await queryInterface.addColumn('bookings', 'paidAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('bookings', 'serviceFee');
    await queryInterface.removeColumn('bookings', 'mpPaymentId');
    await queryInterface.removeColumn('bookings', 'mpPreferenceId');
    await queryInterface.removeColumn('bookings', 'paidAt');
  }
};
