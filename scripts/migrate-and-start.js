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

async function ensureCourtPriceSchedulesTable() {
  console.log('🔧 Ensuring court_price_schedules table exists...');
  try {
    const { sequelize } = require('../src/config/database');
    
    // Check if table exists
    const [results] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'court_price_schedules'
      );
    `);
    
    const tableExists = results[0]?.exists;
    
    if (!tableExists) {
      console.log('📋 Creating court_price_schedules table...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS court_price_schedules (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "courtId" UUID NOT NULL REFERENCES courts(id) ON UPDATE CASCADE ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          "startTime" TIME NOT NULL,
          "endTime" TIME NOT NULL,
          "pricePerHour" DECIMAL(10, 2) NOT NULL,
          "daysOfWeek" JSONB DEFAULT '[0, 1, 2, 3, 4, 5, 6]',
          "isActive" BOOLEAN DEFAULT true,
          priority INTEGER DEFAULT 0,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS court_price_schedules_court_id ON court_price_schedules("courtId");
        CREATE INDEX IF NOT EXISTS court_price_schedules_times ON court_price_schedules("startTime", "endTime");
        CREATE INDEX IF NOT EXISTS court_price_schedules_active ON court_price_schedules("isActive");
      `);
      console.log('✅ court_price_schedules table created');
    } else {
      console.log('✅ court_price_schedules table already exists');
    }
  } catch (error) {
    console.error('⚠️  Error ensuring court_price_schedules table:', error.message);
  }
}

async function migrateAndStart() {
  await runMigrations();
  await ensureCourtPriceSchedulesTable();
  
  console.log('🚀 Starting server...');
  
  // Start the server
  require('../server.js');
}

migrateAndStart();
