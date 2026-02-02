'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Drop old foreign keys that reference establishment_staff
    const constraints = [
      { table: 'bookings', constraint: 'bookings_createdByStaffId_fkey' },
      { table: 'cash_registers', constraint: 'cash_registers_staffId_fkey' },
      { table: 'current_accounts', constraint: 'current_accounts_staffId_fkey' },
    ];

    for (const { table, constraint } of constraints) {
      try {
        await queryInterface.sequelize.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "${constraint}"`);
        console.log(`Dropped constraint ${constraint} from ${table}`);
      } catch (e) {
        console.log(`Constraint ${constraint} might not exist: ${e.message}`);
      }
    }

    // Add new foreign keys pointing to users table
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE bookings 
        ADD CONSTRAINT "bookings_createdByStaffId_fkey" 
        FOREIGN KEY ("createdByStaffId") REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('Added bookings FK to users');
    } catch (e) {
      console.log('bookings FK error:', e.message);
    }

    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE cash_registers 
        ADD CONSTRAINT "cash_registers_staffId_fkey" 
        FOREIGN KEY ("staffId") REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('Added cash_registers FK to users');
    } catch (e) {
      console.log('cash_registers FK error:', e.message);
    }

    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE current_accounts 
        ADD CONSTRAINT "current_accounts_staffId_fkey" 
        FOREIGN KEY ("staffId") REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('Added current_accounts FK to users');
    } catch (e) {
      console.log('current_accounts FK error:', e.message);
    }

    console.log('✅ Staff foreign keys updated to reference users table');
  },
  down: async () => {}
};
