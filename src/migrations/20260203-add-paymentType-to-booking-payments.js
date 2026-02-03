'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Fix orderNumber column length (from previous migration that may not have applied)
    try {
      await queryInterface.sequelize.query('ALTER TABLE orders ALTER COLUMN "orderNumber" TYPE VARCHAR(30);');
      console.log('✅ orderNumber column updated to VARCHAR(30)');
    } catch (e) {
      console.log('⚠️ orderNumber column already VARCHAR(30) or does not exist');
    }

    // Add paymentType column to booking_payments
    await queryInterface.addColumn('booking_payments', 'paymentType', {
      type: Sequelize.ENUM('deposit', 'declared'),
      allowNull: false,
      defaultValue: 'declared'
    });

    // Update existing records: mark deposits based on notes
    await queryInterface.sequelize.query(`
      UPDATE booking_payments 
      SET "paymentType" = 'deposit' 
      WHERE notes LIKE '%Seña%' OR notes LIKE '%seña%' OR notes LIKE '%inicial%'
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('booking_payments', 'paymentType');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_booking_payments_paymentType";');
  }
};
