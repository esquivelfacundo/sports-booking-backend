require('dotenv').config();
const { sequelize } = require('./src/models');

async function addGoogleColumns() {
  try {
    console.log('Adding Google OAuth columns to users table...');
    
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "googleId" VARCHAR(255) UNIQUE');
    console.log('✅ Added googleId column');
    
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255)');
    console.log('✅ Added avatar column');
    
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding columns:', error.message);
    process.exit(1);
  }
}

addGoogleColumns();
