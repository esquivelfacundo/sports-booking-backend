'use strict';

const ALL_SECTIONS = ['reservas','canchas','clientes','resenas','marketing','cupones','ventas','gastos','stock','cuentas','analytics','finanzas','integraciones','caja','configuracion'];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const t = await queryInterface.sequelize.transaction();
    try {
      // Add columns
      await queryInterface.sequelize.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "establishmentId" UUID REFERENCES establishments(id);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "staffRole" VARCHAR(20);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "allowedSections" TEXT[];
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "migratedFromStaffId" UUID;
      `, { transaction: t });

      // Migrate staff to users
      const [staff] = await queryInterface.sequelize.query(`SELECT * FROM establishment_staff`, { transaction: t });
      
      for (const s of staff) {
        const role = (s.role === 'admin') ? 'admin' : 'employee';
        await queryInterface.sequelize.query(`
          INSERT INTO users (id, email, password, "firstName", "lastName", phone, "userType", "isActive", "establishmentId", "staffRole", "allowedSections", "migratedFromStaffId", pin, "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, '', $5, 'establishment', $6, $7, $8, $9, $1, $10, NOW(), NOW())
          ON CONFLICT (email) DO UPDATE SET
            "establishmentId" = EXCLUDED."establishmentId",
            "staffRole" = EXCLUDED."staffRole",
            "allowedSections" = EXCLUDED."allowedSections"
        `, {
          bind: [s.id, s.email, s.password, s.name, s.phone, s.isActive, s.establishmentId, role, ALL_SECTIONS, s.pin],
          transaction: t
        });
      }
      
      await t.commit();
      console.log('✅ Staff unified to users table');
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DELETE FROM users WHERE "migratedFromStaffId" IS NOT NULL;
      ALTER TABLE users DROP COLUMN IF EXISTS "establishmentId";
      ALTER TABLE users DROP COLUMN IF EXISTS "staffRole";
      ALTER TABLE users DROP COLUMN IF EXISTS "allowedSections";
      ALTER TABLE users DROP COLUMN IF EXISTS "migratedFromStaffId";
    `);
  }
};
