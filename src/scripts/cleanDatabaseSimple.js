const { sequelize } = require('../config/database');

async function cleanDatabaseSimple() {
  try {
    console.log('🧹 Limpiando base de datos (sin transacción)...\n');

    // Usuarios a mantener
    const keepEmails = [
      'facundoesquivel01@gmail.com',
      'jugador@miscanchas.com',
      'juventus@miscanchas.com',
      'establecimiento@miscanchas.com',
      'fesquivel@lidius.co'
    ];

    console.log('📋 Usuarios a mantener:');
    keepEmails.forEach(email => console.log(`   - ${email}`));
    console.log('');

    // Obtener IDs de usuarios a mantener
    const [usersToKeep] = await sequelize.query(`
      SELECT id, email FROM users 
      WHERE email IN (${keepEmails.map(e => `'${e}'`).join(',')})
    `);

    if (usersToKeep.length === 0) {
      console.log('⚠️  No se encontraron usuarios para mantener');
      return;
    }

    const keepUserIds = usersToKeep.map(u => u.id);
    console.log(`✅ Encontrados ${usersToKeep.length} usuarios\n`);

    // Obtener IDs de establecimientos a mantener
    const [establishmentsToKeep] = await sequelize.query(`
      SELECT id, name FROM establishments 
      WHERE "userId" IN (${keepUserIds.map(id => `'${id}'`).join(',')})
    `);

    const keepEstablishmentIds = establishmentsToKeep.map(e => e.id);
    console.log(`✅ ${establishmentsToKeep.length} establecimientos:`);
    establishmentsToKeep.forEach(est => console.log(`   - ${est.name}`));
    console.log('');

    // Obtener IDs de canchas a mantener
    const [courtsToKeep] = await sequelize.query(`
      SELECT id FROM courts 
      WHERE "establishmentId" IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
    `);

    const keepCourtIds = courtsToKeep.map(c => c.id);
    console.log(`✅ ${courtsToKeep.length} canchas\n`);

    console.log('🗑️  Eliminando datos...\n');

    // Eliminar reservas de otras canchas
    if (keepCourtIds.length > 0) {
      await sequelize.query(`
        DELETE FROM bookings 
        WHERE "courtId" NOT IN (${keepCourtIds.map(id => `'${id}'`).join(',')})
      `);
      console.log('  ✅ Reservas eliminadas');
    }

    // Eliminar canchas de otros establecimientos
    if (keepEstablishmentIds.length > 0) {
      await sequelize.query(`
        DELETE FROM courts 
        WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
      `);
      console.log('  ✅ Canchas eliminadas');

      await sequelize.query(`
        DELETE FROM amenities 
        WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
      `);
      console.log('  ✅ Amenities eliminados');

      await sequelize.query(`
        DELETE FROM establishments 
        WHERE id NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
      `);
      console.log('  ✅ Establecimientos eliminados');
    }

    // Eliminar usuarios que no se mantienen
    await sequelize.query(`
      DELETE FROM users 
      WHERE id NOT IN (${keepUserIds.map(id => `'${id}'`).join(',')})
    `);
    console.log('  ✅ Usuarios eliminados\n');

    // Resumen
    const [finalUsers] = await sequelize.query(`SELECT COUNT(*) as count FROM users`);
    const [finalEstablishments] = await sequelize.query(`SELECT COUNT(*) as count FROM establishments`);
    const [finalCourts] = await sequelize.query(`SELECT COUNT(*) as count FROM courts`);
    const [finalBookings] = await sequelize.query(`SELECT COUNT(*) as count FROM bookings`);

    console.log('📊 Resumen:');
    console.log(`   Usuarios: ${finalUsers[0].count}`);
    console.log(`   Establecimientos: ${finalEstablishments[0].count}`);
    console.log(`   Canchas: ${finalCourts[0].count}`);
    console.log(`   Reservas: ${finalBookings[0].count}\n`);

    console.log('✅ Limpieza completada\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  cleanDatabaseSimple()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { cleanDatabaseSimple };
