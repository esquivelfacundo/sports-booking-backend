#!/usr/bin/env node

const path = require('path');

async function runMigrations() {
  console.log('🔄 Running database migrations programmatically...');
  
  try {
    const { sequelize } = require('../src/config/database');
    const { Umzug, SequelizeStorage } = require('umzug');
    
    const umzug = new Umzug({
      migrations: {
        glob: path.join(__dirname, '../src/migrations/*.js'),
        resolve: ({ name, path: migrationPath, context }) => {
          const migration = require(migrationPath);
          return {
            name,
            up: async () => migration.up(context, require('sequelize').DataTypes),
            down: async () => migration.down(context, require('sequelize').DataTypes),
          };
        },
      },
      context: sequelize.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize }),
      logger: console,
    });
    
    const pending = await umzug.pending();
    console.log(`📋 Pending migrations: ${pending.length}`);
    
    if (pending.length > 0) {
      console.log('🔧 Running migrations:', pending.map(m => m.name).join(', '));
      await umzug.up();
      console.log('✅ Migrations completed successfully');
    } else {
      console.log('✅ No pending migrations');
    }
  } catch (error) {
    console.error('⚠️  Migration error (continuing anyway):', error.message);
    console.error(error.stack);
  }
}

async function migrateAndStart() {
  await runMigrations();
  
  console.log('🚀 Starting server...');
  
  // Start the server
  require('../server.js');
}

migrateAndStart();
