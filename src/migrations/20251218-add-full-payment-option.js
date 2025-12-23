'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add allowFullPayment field to establishments
    await queryInterface.addColumn('establishments', 'allowFullPayment', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Whether to allow clients to pay full amount online (not just deposit)'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('establishments', 'allowFullPayment');
  }
};
