// Quick fix: Increase orderNumber column length
require('dotenv').config();

async function fix() {
  const { sequelize } = require('./src/config/database');
  
  try {
    console.log('Altering orderNumber column to VARCHAR(30)...');
    await sequelize.query('ALTER TABLE orders ALTER COLUMN "orderNumber" TYPE VARCHAR(30);');
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fix();
