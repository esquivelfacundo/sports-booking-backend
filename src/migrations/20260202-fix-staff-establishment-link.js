'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE users u
      SET "establishmentId" = es."establishmentId",
          "staffRole" = CASE WHEN es.role = 'admin' THEN 'admin' ELSE 'employee' END,
          "allowedSections" = ARRAY['reservas','canchas','clientes','resenas','marketing','cupones','ventas','gastos','stock','cuentas','analytics','finanzas','integraciones','caja','configuracion'],
          "userType" = 'establishment'
      FROM establishment_staff es
      WHERE u.email = es.email AND u."establishmentId" IS NULL
    `);
    console.log('✅ Fixed staff-establishment links');
  },
  down: async () => {}
};
