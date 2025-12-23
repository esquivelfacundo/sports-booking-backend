'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add staffId column to cash_registers
    await queryInterface.addColumn('cash_registers', 'staffId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'staff',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Make userId nullable
    await queryInterface.changeColumn('cash_registers', 'userId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    });

    // Add index for staffId
    await queryInterface.addIndex('cash_registers', ['staffId']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index
    await queryInterface.removeIndex('cash_registers', ['staffId']);

    // Make userId required again
    await queryInterface.changeColumn('cash_registers', 'userId', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    });

    // Remove staffId column
    await queryInterface.removeColumn('cash_registers', 'staffId');
  }
};
