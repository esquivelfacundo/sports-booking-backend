'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('cash_register_movements', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      cashRegisterId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'cash_registers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'cashRegisterId'
      },
      establishmentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'establishments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'establishmentId'
      },
      type: {
        type: Sequelize.ENUM('sale', 'expense', 'initial_cash', 'cash_withdrawal', 'adjustment'),
        allowNull: false
      },
      orderId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        field: 'orderId'
      },
      bookingId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'bookings',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        field: 'bookingId'
      },
      expenseCategoryId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'expense_categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        field: 'expenseCategoryId'
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      paymentMethod: {
        type: Sequelize.STRING(50),
        allowNull: false,
        field: 'paymentMethod'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      registeredBy: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'registeredBy'
      },
      registeredAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field: 'registeredAt'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: 'createdAt'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: 'updatedAt'
      }
    });

    await queryInterface.addIndex('cash_register_movements', ['cashRegisterId']);
    await queryInterface.addIndex('cash_register_movements', ['establishmentId']);
    await queryInterface.addIndex('cash_register_movements', ['type']);
    await queryInterface.addIndex('cash_register_movements', ['paymentMethod']);
    await queryInterface.addIndex('cash_register_movements', ['registeredAt']);
    await queryInterface.addIndex('cash_register_movements', ['orderId']);
    await queryInterface.addIndex('cash_register_movements', ['bookingId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('cash_register_movements');
  }
};
