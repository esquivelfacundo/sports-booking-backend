'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Allow createdBy to be null for staff users (their IDs are in establishment_staff, not users)
    // Use raw SQL to ensure it works
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE orders ALTER COLUMN "createdBy" DROP NOT NULL;
      `);
      console.log('✅ orders.createdBy is now nullable');
    } catch (error) {
      // Column might already be nullable
      console.log('⚠️ Could not alter orders.createdBy:', error.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE orders ALTER COLUMN "createdBy" SET NOT NULL;
    `);
  }
};
