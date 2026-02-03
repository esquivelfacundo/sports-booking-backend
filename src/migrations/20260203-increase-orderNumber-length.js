'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('orders', 'orderNumber', {
      type: Sequelize.STRING(30),
      allowNull: false,
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('orders', 'orderNumber', {
      type: Sequelize.STRING(20),
      allowNull: false,
      unique: true
    });
  }
};
