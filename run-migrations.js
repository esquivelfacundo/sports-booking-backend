const { sequelize } = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  try {
    console.log('Starting migrations...');

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'src', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    // Run migrations in specific order
    const migrationOrder = [
      '20251220-create-expense-categories.js',
      '20251220-create-cash-registers.js',
      '20251220-create-cash-register-movements.js'
    ];

    console.log('Found migrations:', migrationOrder);

    for (const file of migrationOrder) {
      const filePath = path.join(migrationsDir, file);
      if (fs.existsSync(filePath)) {
        console.log(`Running migration: ${file}`);
        const migration = require(filePath);
        await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);
        console.log(`✓ Completed: ${file}`);
      } else {
        console.log(`⚠ Skipping: ${file} (not found)`);
      }
    }

    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
