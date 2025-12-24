'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add reviewToken and reviewedAt to bookings table
    await queryInterface.addColumn('bookings', 'reviewToken', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
      comment: 'Unique token for review link - generated when booking is completed'
    });

    await queryInterface.addColumn('bookings', 'reviewedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When the review was submitted for this booking'
    });

    // Add npsScore and source to reviews table
    await queryInterface.addColumn('reviews', 'npsScore', {
      type: Sequelize.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 10
      }
    });

    // Check if source column exists before adding
    const tableInfo = await queryInterface.describeTable('reviews');
    if (!tableInfo.source) {
      await queryInterface.addColumn('reviews', 'source', {
        type: Sequelize.ENUM('app', 'qr_ticket', 'email_link', 'whatsapp_link', 'manual'),
        defaultValue: 'app'
      });
    }

    // Add index for reviewToken
    await queryInterface.addIndex('bookings', ['reviewToken'], {
      unique: true,
      name: 'bookings_review_token_unique'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('bookings', 'bookings_review_token_unique');
    await queryInterface.removeColumn('bookings', 'reviewToken');
    await queryInterface.removeColumn('bookings', 'reviewedAt');
    await queryInterface.removeColumn('reviews', 'npsScore');
    await queryInterface.removeColumn('reviews', 'source');
  }
};
