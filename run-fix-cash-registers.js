// Script to fix cash registers with missing movements
require('dotenv').config();
const { sequelize } = require('./src/config/database');
const path = require('path');

async function run() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected.\n');

    const migration = require('./src/migrations/20260210-fix-cash-register-missing-movements');
    await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);

    console.log('\nDone.');
    process.exit(0);
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

run();
