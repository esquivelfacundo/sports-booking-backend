const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

async function createSuperAdmin() {
  try {
    console.log('🔐 Creando usuario Super Admin...\n');

    const email = process.env.SUPERADMIN_EMAIL || 'fesquivel@lidius.co';
    const password = process.env.SUPERADMIN_SECRET || 'Lidius@2001';

    // Verificar si ya existe
    const [existing] = await sequelize.query(
      `SELECT id FROM users WHERE email = '${email}'`
    );

    if (existing.length > 0) {
      console.log('⚠️  El usuario superadmin ya existe');
      console.log(`   Email: ${email}`);
      console.log(`   ID: ${existing[0].id}\n`);
      
      // Actualizar a superadmin si no lo es
      await sequelize.query(`
        UPDATE users 
        SET "userType" = 'superadmin', "isActive" = true
        WHERE email = '${email}'
      `);
      console.log('✅ Usuario actualizado a superadmin\n');
      return;
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario superadmin
    await sequelize.query(`
      INSERT INTO users (
        id, email, password, "firstName", "lastName", 
        "userType", "isActive", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        '${email}',
        '${hashedPassword}',
        'Super',
        'Admin',
        'superadmin',
        true,
        NOW(),
        NOW()
      )
    `);

    console.log('✅ Usuario Super Admin creado exitosamente\n');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('\n⚠️  IMPORTANTE: Cambia la contraseña después del primer login\n');

  } catch (error) {
    console.error('❌ Error creando super admin:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  createSuperAdmin()
    .then(() => {
      console.log('✅ Script completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

module.exports = { createSuperAdmin };
