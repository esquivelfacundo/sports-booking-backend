'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Allow createdBy to be null for staff users (their IDs are in establishment_staff, not users)
    await queryInterface.changeColumn('orders', 'createdBy', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('orders', 'createdBy', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    });
  }
};
