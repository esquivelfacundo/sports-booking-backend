const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

async function createSuperAdmin() {
  try {
    console.log('🔐 Creando usuario Super Admin...\n');

    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_SECRET;

    if (!email || !password) {
      console.error('❌ Error: Las variables de entorno SUPERADMIN_EMAIL y SUPERADMIN_SECRET son requeridas');
      process.exit(1);
    }

    // Verificar si ya existe
    const [existing] = await sequelize.query(
      `SELECT id FROM users WHERE email = '${email}'`
    );

    if (existing.length > 0) {
      console.log('⚠️  El usuario superadmin ya existe');
      console.log(`   Email: ${email}`);
      console.log(`   ID: ${existing[0].id}\n`);
      
      // Actualizar a admin si no lo es
      await sequelize.query(`
        UPDATE users 
        SET "userType" = 'admin', "isActive" = true
        WHERE email = '${email}'
      `);
      console.log('✅ Usuario actualizado a admin\n');
      return;
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario admin
    const [result] = await sequelize.query(`
      INSERT INTO users (
        id, email, password, "firstName", "lastName", 
        "userType", "isActive", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        '${email}',
        '${hashedPassword}',
        'Super',
        'Admin',
        'admin',
        true,
        NOW(),
        NOW()
      )
      RETURNING id, email, "firstName", "lastName", "userType"
    `);

    console.log(' Usuario Admin creado exitosamente\n');
    console.log(' Email:', email);
    console.log(' Password:', password);
    console.log('\n IMPORTANTE: Cambia la contraseña después del primer login\n');

  } catch (error) {
    console.error(' Error creando admin:', error);
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
