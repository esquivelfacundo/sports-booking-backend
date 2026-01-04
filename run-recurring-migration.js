// Script to run the recurring booking system migration
require('dotenv').config();
const { sequelize } = require('./src/config/database');

async function runMigration() {
  try {
    console.log('🔄 Running migration: create-recurring-booking-system');
    
    // 1. Create ENUM types
    console.log('Creating ENUM types...');
    
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_recurring_booking_groups_status" AS ENUM ('active', 'paused', 'completed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Created enum: enum_recurring_booking_groups_status');
    
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_bookings_recurringPaymentStatus" AS ENUM ('not_applicable', 'pending', 'paid', 'paid_in_advance');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Created enum: enum_bookings_recurringPaymentStatus');
    
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_establishments_recurringPaymentPolicy" AS ENUM ('advance_one', 'advance_all', 'pay_on_attendance');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Created enum: enum_establishments_recurringPaymentPolicy');
    
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_establishments_recurringCancellationPolicy" AS ENUM ('refund_unused', 'credit', 'no_refund');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Created enum: enum_establishments_recurringCancellationPolicy');
    
    // 2. Create recurring_booking_groups table
    console.log('Creating recurring_booking_groups table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "recurring_booking_groups" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "establishmentId" UUID NOT NULL REFERENCES "establishments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "clientId" UUID REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "clientName" VARCHAR(255),
        "clientPhone" VARCHAR(255),
        "clientEmail" VARCHAR(255),
        "courtId" UUID NOT NULL REFERENCES "courts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "dayOfWeek" INTEGER NOT NULL,
        "startTime" TIME NOT NULL,
        "endTime" TIME NOT NULL,
        "duration" INTEGER NOT NULL,
        "sport" VARCHAR(255),
        "bookingType" VARCHAR(255) DEFAULT 'normal',
        "totalOccurrences" INTEGER NOT NULL,
        "completedOccurrences" INTEGER DEFAULT 0,
        "cancelledOccurrences" INTEGER DEFAULT 0,
        "pricePerBooking" DECIMAL(10, 2) NOT NULL,
        "totalPaid" DECIMAL(10, 2) DEFAULT 0,
        "paidBookingsCount" INTEGER DEFAULT 0,
        "status" "enum_recurring_booking_groups_status" DEFAULT 'active',
        "startDate" DATE NOT NULL,
        "endDate" DATE,
        "notes" TEXT,
        "createdBy" UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ Created table: recurring_booking_groups');
    
    // 3. Add indexes to recurring_booking_groups
    console.log('Adding indexes...');
    const indexes = [
      { name: 'recurring_booking_groups_establishment_id', sql: 'CREATE INDEX IF NOT EXISTS "recurring_booking_groups_establishment_id" ON "recurring_booking_groups" ("establishmentId")' },
      { name: 'recurring_booking_groups_client_id', sql: 'CREATE INDEX IF NOT EXISTS "recurring_booking_groups_client_id" ON "recurring_booking_groups" ("clientId")' },
      { name: 'recurring_booking_groups_court_id', sql: 'CREATE INDEX IF NOT EXISTS "recurring_booking_groups_court_id" ON "recurring_booking_groups" ("courtId")' },
      { name: 'recurring_booking_groups_status', sql: 'CREATE INDEX IF NOT EXISTS "recurring_booking_groups_status" ON "recurring_booking_groups" ("status")' },
      { name: 'recurring_booking_groups_day_time', sql: 'CREATE INDEX IF NOT EXISTS "recurring_booking_groups_day_time" ON "recurring_booking_groups" ("dayOfWeek", "startTime")' }
    ];
    
    for (const idx of indexes) {
      try {
        await sequelize.query(idx.sql);
        console.log(`✅ Created index: ${idx.name}`);
      } catch (e) {
        console.log(`ℹ️ Index ${idx.name} already exists`);
      }
    }
    
    // 4. Add columns to bookings table
    console.log('Adding columns to bookings table...');
    const bookingColumns = [
      { name: 'recurringGroupId', sql: 'ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "recurringGroupId" UUID REFERENCES "recurring_booking_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE' },
      { name: 'recurringSequence', sql: 'ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "recurringSequence" INTEGER' },
      { name: 'recurringPaymentStatus', sql: 'ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "recurringPaymentStatus" "enum_bookings_recurringPaymentStatus" DEFAULT \'not_applicable\'' },
      { name: 'paidForNextId', sql: 'ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "paidForNextId" UUID' }
    ];
    
    for (const col of bookingColumns) {
      try {
        await sequelize.query(col.sql);
        console.log(`✅ Added column to bookings: ${col.name}`);
      } catch (e) {
        console.log(`ℹ️ Column ${col.name} error:`, e.message);
      }
    }
    
    // Add index for recurringGroupId
    try {
      await sequelize.query('CREATE INDEX IF NOT EXISTS "bookings_recurring_group_id" ON "bookings" ("recurringGroupId")');
      console.log('✅ Created index: bookings_recurring_group_id');
    } catch (e) {
      console.log('ℹ️ Index bookings_recurring_group_id already exists');
    }
    
    // 5. Add columns to establishments table
    console.log('Adding columns to establishments table...');
    const establishmentColumns = [
      { name: 'recurringPaymentPolicy', sql: 'ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "recurringPaymentPolicy" "enum_establishments_recurringPaymentPolicy" DEFAULT \'advance_one\'' },
      { name: 'recurringMinWeeks', sql: 'ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "recurringMinWeeks" INTEGER DEFAULT 4' },
      { name: 'recurringMaxWeeks', sql: 'ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "recurringMaxWeeks" INTEGER DEFAULT 24' },
      { name: 'recurringCancellationPolicy', sql: 'ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "recurringCancellationPolicy" "enum_establishments_recurringCancellationPolicy" DEFAULT \'credit\'' }
    ];
    
    for (const col of establishmentColumns) {
      try {
        await sequelize.query(col.sql);
        console.log(`✅ Added column to establishments: ${col.name}`);
      } catch (e) {
        console.log(`ℹ️ Column ${col.name} error:`, e.message);
      }
    }
    
    console.log('');
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
