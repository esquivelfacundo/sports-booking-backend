'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('establishments', 'maxAdvanceBookingDays', {
      type: Sequelize.INTEGER,
      defaultValue: 30,
      allowNull: true
    });

    await queryInterface.addColumn('establishments', 'minAdvanceBookingHours', {
      type: Sequelize.INTEGER,
      defaultValue: 2,
      allowNull: true
    });

    await queryInterface.addColumn('establishments', 'allowSameDayBooking', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: true
    });

    await queryInterface.addColumn('establishments', 'cancellationDeadlineHours', {
      type: Sequelize.INTEGER,
      defaultValue: 24,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('establishments', 'maxAdvanceBookingDays');
    await queryInterface.removeColumn('establishments', 'minAdvanceBookingHours');
    await queryInterface.removeColumn('establishments', 'allowSameDayBooking');
    await queryInterface.removeColumn('establishments', 'cancellationDeadlineHours');
  }
};
