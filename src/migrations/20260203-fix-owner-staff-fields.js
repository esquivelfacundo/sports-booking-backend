'use strict';

/**
 * Migration to fix owner users that incorrectly have staff fields set.
 * Owners should have establishmentId and staffRole as NULL.
 * The owner is identified by Establishment.userId, not by User.establishmentId.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Find all establishments and their owners
    const [establishments] = await queryInterface.sequelize.query(`
      SELECT e.id as establishment_id, e."userId" as owner_id, u.email, u."establishmentId", u."staffRole"
      FROM establishments e
      JOIN users u ON e."userId" = u.id
      WHERE u."establishmentId" IS NOT NULL OR u."staffRole" IS NOT NULL
    `);

    console.log(`Found ${establishments.length} owners with incorrect staff fields`);

    for (const est of establishments) {
      console.log(`Fixing user ${est.email} (owner of establishment ${est.establishment_id})`);
      
      // Clear staff fields for owners - they should NOT have these set
      await queryInterface.sequelize.query(`
        UPDATE users 
        SET "establishmentId" = NULL, 
            "staffRole" = NULL,
            "allowedSections" = NULL
        WHERE id = :userId
      `, {
        replacements: { userId: est.owner_id }
      });
    }

    // Also fix the specific user mentioned: facundo@miscanchas.com
    await queryInterface.sequelize.query(`
      UPDATE users 
      SET "establishmentId" = NULL, 
          "staffRole" = NULL,
          "allowedSections" = NULL
      WHERE email = 'facundo@miscanchas.com'
    `);

    console.log('Owner staff fields fixed successfully');
  },

  down: async (queryInterface, Sequelize) => {
    // This migration cannot be easily reverted as we don't know the original values
    console.log('This migration cannot be reverted');
  }
};
