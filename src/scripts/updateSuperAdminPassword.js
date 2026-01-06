const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

async function updateSuperAdminPassword() {
  try {
    console.log('🔐 Actualizando contraseña del Super Admin...\n');

    const email = process.env.SUPERADMIN_EMAIL;
    const newPassword = process.env.SUPERADMIN_SECRET;

    if (!email || !newPassword) {
      throw new Error('Las variables de entorno SUPERADMIN_EMAIL y SUPERADMIN_SECRET son requeridas');
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    const [result] = await sequelize.query(`
      UPDATE users 
      SET password = '${hashedPassword}', "updatedAt" = NOW()
      WHERE email = '${email}'
      RETURNING id, email
    `);

    if (result.length > 0) {
      console.log('✅ Contraseña actualizada exitosamente\n');
      console.log('📧 Email:', email);
      console.log('🔑 Nueva Password:', newPassword);
    } else {
      console.log('⚠️  Usuario no encontrado con email:', email);
    }

  } catch (error) {
    console.error('❌ Error actualizando contraseña:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  updateSuperAdminPassword()
    .then(async () => {
      console.log('\n✅ Script completado');
      await sequelize.close();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('❌ Error:', error);
      await sequelize.close();
      process.exit(1);
    });
}

module.exports = { updateSuperAdminPassword };
