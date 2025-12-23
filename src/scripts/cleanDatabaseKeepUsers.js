const { sequelize } = require('../config/database');

async function cleanDatabaseKeepUsers() {
  try {
    console.log('🧹 Limpiando base de datos...\n');

    // Usuarios a mantener
    const keepEmails = [
      'facundoesquivel01@gmail.com',
      'jugador@miscanchas.com',
      'juventus@miscanchas.com',
      'establecimiento@miscanchas.com',
      'fesquivel@lidius.co' // superadmin
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
    console.log(`✅ Encontrados ${usersToKeep.length} usuarios para mantener\n`);

    // Obtener IDs de establecimientos a mantener (de usuarios a mantener)
    const [establishmentsToKeep] = await sequelize.query(`
      SELECT id, name FROM establishments 
      WHERE "userId" IN (${keepUserIds.map(id => `'${id}'`).join(',')})
    `);

    const keepEstablishmentIds = establishmentsToKeep.map(e => e.id);
    console.log(`✅ Encontrados ${establishmentsToKeep.length} establecimientos para mantener:`);
    establishmentsToKeep.forEach(est => console.log(`   - ${est.name}`));
    console.log('');

    // Obtener IDs de canchas a mantener
    const [courtsToKeep] = await sequelize.query(`
      SELECT id FROM courts 
      WHERE "establishmentId" IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
    `);

    const keepCourtIds = courtsToKeep.map(c => c.id);
    console.log(`✅ Encontradas ${courtsToKeep.length} canchas para mantener\n`);

    // Iniciar transacción
    const transaction = await sequelize.transaction();

    try {
      console.log('🗑️  Eliminando datos...\n');

      // 1. Eliminar reservas de canchas que NO se mantienen
      if (keepCourtIds.length > 0) {
        await sequelize.query(`
          DELETE FROM bookings 
          WHERE "courtId" NOT IN (${keepCourtIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Reservas de canchas eliminadas');
      }

      // 2. Eliminar datos relacionados a establecimientos que NO se mantienen
      if (keepEstablishmentIds.length > 0) {
        // Clientes
        await sequelize.query(`
          DELETE FROM clients 
          WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Clientes eliminados');

        // Staff
        await sequelize.query(`
          DELETE FROM staff 
          WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Personal eliminado');

        // Productos
        await sequelize.query(`
          DELETE FROM products 
          WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Productos eliminados');

        // Movimientos de caja
        await sequelize.query(`
          DELETE FROM cash_register_movements 
          WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Movimientos de caja eliminados');

        // Cajas registradoras
        await sequelize.query(`
          DELETE FROM cash_registers 
          WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Cajas registradoras eliminadas');

        // Órdenes (primero los items y pagos)
        await sequelize.query(`
          DELETE FROM order_items 
          WHERE "orderId" IN (
            SELECT id FROM orders 
            WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
          )
        `, { transaction });
        console.log('  ✅ Items de órdenes eliminados');

        await sequelize.query(`
          DELETE FROM order_payments 
          WHERE "orderId" IN (
            SELECT id FROM orders 
            WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
          )
        `, { transaction });
        console.log('  ✅ Pagos de órdenes eliminados');

        await sequelize.query(`
          DELETE FROM orders 
          WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Órdenes eliminadas');

        // Canchas
        await sequelize.query(`
          DELETE FROM courts 
          WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Canchas eliminadas');

        // Amenities
        await sequelize.query(`
          DELETE FROM amenities 
          WHERE "establishmentId" NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Amenities eliminados');

        // Establecimientos
        await sequelize.query(`
          DELETE FROM establishments 
          WHERE id NOT IN (${keepEstablishmentIds.map(id => `'${id}'`).join(',')})
        `, { transaction });
        console.log('  ✅ Establecimientos eliminados');
      }

      // 3. Eliminar usuarios que NO se mantienen
      await sequelize.query(`
        DELETE FROM users 
        WHERE id NOT IN (${keepUserIds.map(id => `'${id}'`).join(',')})
      `, { transaction });
      console.log('  ✅ Usuarios eliminados\n');

      // Commit
      await transaction.commit();
      console.log('✅ Base de datos limpiada exitosamente\n');

      // Mostrar resumen
      const [finalUsers] = await sequelize.query(`SELECT COUNT(*) as count FROM users`);
      const [finalEstablishments] = await sequelize.query(`SELECT COUNT(*) as count FROM establishments`);
      const [finalCourts] = await sequelize.query(`SELECT COUNT(*) as count FROM courts`);
      const [finalBookings] = await sequelize.query(`SELECT COUNT(*) as count FROM bookings`);

      console.log('📊 Resumen final:');
      console.log(`   Usuarios: ${finalUsers[0].count}`);
      console.log(`   Establecimientos: ${finalEstablishments[0].count}`);
      console.log(`   Canchas: ${finalCourts[0].count}`);
      console.log(`   Reservas: ${finalBookings[0].count}\n`);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Error limpiando base de datos:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  cleanDatabaseKeepUsers()
    .then(() => {
      console.log('✅ Script completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

module.exports = { cleanDatabaseKeepUsers };
