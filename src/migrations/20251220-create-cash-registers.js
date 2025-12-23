'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('cash_registers', {
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
        onDelete: 'CASCADE',
        field: 'establishmentId'
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'userId'
      },
      openedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field: 'openedAt'
      },
      closedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'closedAt'
      },
      status: {
        type: Sequelize.ENUM('open', 'closed'),
        allowNull: false,
        defaultValue: 'open'
      },
      initialCash: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'initialCash'
      },
      expectedCash: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'expectedCash'
      },
      actualCash: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        field: 'actualCash'
      },
      cashDifference: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        field: 'cashDifference'
      },
      totalCash: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'totalCash'
      },
      totalCard: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'totalCard'
      },
      totalTransfer: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'totalTransfer'
      },
      totalCreditCard: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'totalCreditCard'
      },
      totalDebitCard: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'totalDebitCard'
      },
      totalMercadoPago: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'totalMercadoPago'
      },
      totalOther: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'totalOther'
      },
      totalSales: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'totalSales'
      },
      totalExpenses: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'totalExpenses'
      },
      totalOrders: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'totalOrders'
      },
      totalMovements: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'totalMovements'
      },
      openingNotes: {
        type: Sequelize.TEXT,
        allowNull: true,
        field: 'openingNotes'
      },
      closingNotes: {
        type: Sequelize.TEXT,
        allowNull: true,
        field: 'closingNotes'
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

    await queryInterface.addIndex('cash_registers', ['establishmentId']);
    await queryInterface.addIndex('cash_registers', ['userId']);
    await queryInterface.addIndex('cash_registers', ['status']);
    await queryInterface.addIndex('cash_registers', ['openedAt']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('cash_registers');
  }
};
