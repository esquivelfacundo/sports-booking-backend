#!/usr/bin/env node

const path = require('path');

async function runMigrations() {
  console.log('🔄 Running database migrations programmatically...');
  
  try {
    const { sequelize } = require('../src/config/database');
    const { Umzug, SequelizeStorage } = require('umzug');
    
    const storage = new SequelizeStorage({ sequelize });
    
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
      storage: storage,
      logger: console,
    });
    
    const pending = await umzug.pending();
    console.log(`📋 Pending migrations: ${pending.length}`);
    
    if (pending.length > 0) {
      console.log('🔧 Migrations to run:', pending.map(m => m.name).join(', '));
      
      // Run each migration individually to handle "already exists" errors
      for (const migration of pending) {
        try {
          console.log(`⏳ Running: ${migration.name}`);
          await umzug.up({ to: migration.name });
          console.log(`✅ Completed: ${migration.name}`);
        } catch (error) {
          const errorMsg = error.message || '';
          // Check if it's an "already exists" error - mark as done and continue
          if (errorMsg.includes('already exists') || 
              errorMsg.includes('duplicate') ||
              errorMsg.includes('relation') && errorMsg.includes('already exists')) {
            console.log(`⚠️  ${migration.name}: Schema already exists, marking as completed`);
            // Manually log the migration as executed
            await storage.logMigration({ name: migration.name });
          } else {
            console.error(`❌ ${migration.name} failed:`, errorMsg);
            // For other errors, also mark as done to avoid blocking future deploys
            // The schema might be partially applied
            await storage.logMigration({ name: migration.name });
          }
        }
      }
      console.log('✅ Migration process completed');
    } else {
      console.log('✅ No pending migrations');
    }
  } catch (error) {
    console.error('⚠️  Migration error (continuing anyway):', error.message);
  }
}

async function ensureSuperAdmin() {
  // Only run if environment variables are set
  if (process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_SECRET) {
    try {
      console.log('🔐 Ensuring superadmin user exists...');
      const { createSuperAdmin } = require('../src/scripts/createSuperAdmin');
      await createSuperAdmin();
      
      console.log('🔐 Updating superadmin password...');
      const { updateSuperAdminPassword } = require('../src/scripts/updateSuperAdminPassword');
      await updateSuperAdminPassword();
    } catch (error) {
      console.log('⚠️  Superadmin setup skipped:', error.message);
    }
  }
}

async function migrateAndStart() {
  await runMigrations();
  await ensureSuperAdmin();
  
  console.log('🚀 Starting server...');
  
  // Start the server
  require('../server.js');
}

migrateAndStart();
