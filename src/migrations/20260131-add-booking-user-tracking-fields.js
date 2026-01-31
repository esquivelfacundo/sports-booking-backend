'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add createdBy field
    await queryInterface.addColumn('bookings', 'created_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    });

    // Add startedBy field
    await queryInterface.addColumn('bookings', 'started_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    });

    // Add completedBy field
    await queryInterface.addColumn('bookings', 'completed_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('bookings', 'created_by');
    await queryInterface.removeColumn('bookings', 'started_by');
    await queryInterface.removeColumn('bookings', 'completed_by');
  }
};
