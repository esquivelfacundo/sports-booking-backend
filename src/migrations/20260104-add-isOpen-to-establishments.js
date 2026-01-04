'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Check and add isOpen column
      const tableInfo = await queryInterface.describeTable('establishments');
      
      if (!tableInfo.isOpen) {
        await queryInterface.addColumn('establishments', 'isOpen', {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          allowNull: false,
          comment: 'Whether the establishment is currently accepting bookings'
        }, { transaction });
        console.log('✅ Added isOpen column');
      } else {
        console.log('ℹ️ isOpen column already exists');
      }
      
      // Ensure booking restriction columns exist (in case they weren't migrated)
      const columnsToCheck = [
        { name: 'maxAdvanceBookingDays', type: Sequelize.INTEGER, defaultValue: 30 },
        { name: 'minAdvanceBookingHours', type: Sequelize.INTEGER, defaultValue: 2 },
        { name: 'allowSameDayBooking', type: Sequelize.BOOLEAN, defaultValue: true },
        { name: 'cancellationDeadlineHours', type: Sequelize.INTEGER, defaultValue: 24 }
      ];
      
      for (const col of columnsToCheck) {
        if (!tableInfo[col.name]) {
          await queryInterface.addColumn('establishments', col.name, {
            type: col.type,
            defaultValue: col.defaultValue,
            allowNull: true
          }, { transaction });
          console.log(`✅ Added ${col.name} column`);
        }
      }
      
      await transaction.commit();
      console.log('✅ Migration completed successfully');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.removeColumn('establishments', 'isOpen', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
