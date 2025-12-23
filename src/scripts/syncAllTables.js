const { sequelize } = require('../config/database');

async function syncAllTables() {
  try {
    console.log('🔄 Sincronizando todas las tablas en producción...\n');

    // Sincronizar con alter: true para agregar columnas faltantes sin borrar datos
    await sequelize.sync({ alter: true });

    console.log('✅ Todas las tablas sincronizadas correctamente\n');

    // Mostrar tablas creadas
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('📋 Tablas en la base de datos:');
    tables.forEach(t => console.log(`   - ${t.table_name}`));
    console.log('');

  } catch (error) {
    console.error('❌ Error sincronizando tablas:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  syncAllTables()
    .then(() => {
      console.log('✅ Sincronización completada');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

module.exports = { syncAllTables };
