'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('court_price_schedules', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      courtId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'courts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      startTime: {
        type: Sequelize.TIME,
        allowNull: false
      },
      endTime: {
        type: Sequelize.TIME,
        allowNull: false
      },
      pricePerHour: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      daysOfWeek: {
        type: Sequelize.JSON,
        defaultValue: [0, 1, 2, 3, 4, 5, 6]
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('court_price_schedules', ['courtId']);
    await queryInterface.addIndex('court_price_schedules', ['startTime', 'endTime']);
    await queryInterface.addIndex('court_price_schedules', ['isActive']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('court_price_schedules');
  }
};
