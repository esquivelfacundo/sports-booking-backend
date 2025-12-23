// Script to run the cancellation policy migration
require('dotenv').config();
const { sequelize } = require('./src/config/database');

async function runMigration() {
  try {
    console.log('🔄 Running migration: add-cancellation-policy-fields');
    
    // Check if columns already exist
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'establishments' 
      AND column_name IN ('cancellationPolicy', 'refundPercentage', 'noShowPenalty', 'noShowPenaltyType', 'noShowPenaltyPercentage', 'depositPaymentDeadlineHours')
    `);
    
    if (results.length > 0) {
      console.log('⚠️ Some columns already exist:', results.map(r => r.column_name));
      console.log('Skipping existing columns...');
    }
    
    // Create ENUM types if they don't exist
    try {
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE "enum_establishments_cancellationPolicy" AS ENUM ('full_refund', 'partial_refund', 'no_refund', 'credit');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log('✅ Created enum: enum_establishments_cancellationPolicy');
    } catch (e) {
      console.log('ℹ️ Enum enum_establishments_cancellationPolicy already exists');
    }
    
    try {
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE "enum_establishments_noShowPenaltyType" AS ENUM ('full_charge', 'deposit_only', 'percentage');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log('✅ Created enum: enum_establishments_noShowPenaltyType');
    } catch (e) {
      console.log('ℹ️ Enum enum_establishments_noShowPenaltyType already exists');
    }
    
    // Add columns if they don't exist
    const columnsToAdd = [
      {
        name: 'cancellationPolicy',
        sql: `ALTER TABLE establishments ADD COLUMN IF NOT EXISTS "cancellationPolicy" "enum_establishments_cancellationPolicy" DEFAULT 'partial_refund' NOT NULL`
      },
      {
        name: 'refundPercentage',
        sql: `ALTER TABLE establishments ADD COLUMN IF NOT EXISTS "refundPercentage" INTEGER DEFAULT 50 NOT NULL`
      },
      {
        name: 'noShowPenalty',
        sql: `ALTER TABLE establishments ADD COLUMN IF NOT EXISTS "noShowPenalty" BOOLEAN DEFAULT true NOT NULL`
      },
      {
        name: 'noShowPenaltyType',
        sql: `ALTER TABLE establishments ADD COLUMN IF NOT EXISTS "noShowPenaltyType" "enum_establishments_noShowPenaltyType" DEFAULT 'deposit_only' NOT NULL`
      },
      {
        name: 'noShowPenaltyPercentage',
        sql: `ALTER TABLE establishments ADD COLUMN IF NOT EXISTS "noShowPenaltyPercentage" INTEGER DEFAULT 100 NOT NULL`
      },
      {
        name: 'depositPaymentDeadlineHours',
        sql: `ALTER TABLE establishments ADD COLUMN IF NOT EXISTS "depositPaymentDeadlineHours" INTEGER DEFAULT 2 NOT NULL`
      }
    ];
    
    for (const col of columnsToAdd) {
      try {
        await sequelize.query(col.sql);
        console.log(`✅ Added column: ${col.name}`);
      } catch (e) {
        console.log(`ℹ️ Column ${col.name} already exists or error:`, e.message);
      }
    }
    
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
