const { sequelize } = require('../config/database');
const { 
  Coupon, 
  CouponUsage, 
  Booking, 
  Review 
} = require('../models');

async function ensureAllTables() {
  try {
    console.log('🔄 Verificando y creando tablas necesarias...\n');

    // 1. Verificar y agregar columnas a bookings
    console.log('📋 Verificando tabla bookings...');
    const [bookingColumns] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bookings'
    `);
    const bookingColumnNames = bookingColumns.map(c => c.column_name);
    
    if (!bookingColumnNames.includes('reviewToken')) {
      console.log('  ➕ Agregando columna reviewToken a bookings...');
      await sequelize.query(`
        ALTER TABLE bookings 
        ADD COLUMN "reviewToken" VARCHAR(255) UNIQUE
      `);
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "bookings_review_token" ON bookings("reviewToken")
      `);
      console.log('  ✅ Columna reviewToken agregada');
    } else {
      console.log('  ✓ Columna reviewToken ya existe');
    }

    if (!bookingColumnNames.includes('reviewedAt')) {
      console.log('  ➕ Agregando columna reviewedAt a bookings...');
      await sequelize.query(`
        ALTER TABLE bookings 
        ADD COLUMN "reviewedAt" TIMESTAMP WITH TIME ZONE
      `);
      console.log('  ✅ Columna reviewedAt agregada');
    } else {
      console.log('  ✓ Columna reviewedAt ya existe');
    }

    // 2. Verificar y agregar columnas a reviews
    console.log('\n📋 Verificando tabla reviews...');
    const [reviewColumns] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'reviews'
    `);
    const reviewColumnNames = reviewColumns.map(c => c.column_name);
    
    if (!reviewColumnNames.includes('npsScore')) {
      console.log('  ➕ Agregando columna npsScore a reviews...');
      await sequelize.query(`
        ALTER TABLE reviews 
        ADD COLUMN "npsScore" INTEGER CHECK ("npsScore" >= 0 AND "npsScore" <= 10)
      `);
      console.log('  ✅ Columna npsScore agregada');
    } else {
      console.log('  ✓ Columna npsScore ya existe');
    }

    if (!reviewColumnNames.includes('source')) {
      console.log('  ➕ Agregando columna source a reviews...');
      await sequelize.query(`
        ALTER TABLE reviews 
        ADD COLUMN "source" VARCHAR(50) DEFAULT 'manual'
      `);
      console.log('  ✅ Columna source agregada');
    } else {
      console.log('  ✓ Columna source ya existe');
    }

    // 3. Crear tabla coupons si no existe
    console.log('\n📋 Verificando tabla coupons...');
    const [couponsTable] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'coupons'
      )
    `);
    
    if (!couponsTable[0].exists) {
      console.log('  ➕ Creando tabla coupons...');
      await sequelize.query(`
        CREATE TABLE coupons (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "establishmentId" UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
          code VARCHAR(50) NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          "discountType" VARCHAR(50) NOT NULL CHECK ("discountType" IN ('percentage', 'fixed_amount', 'free_booking')),
          "discountValue" DECIMAL(10,2) NOT NULL,
          "maxDiscount" DECIMAL(10,2),
          "minPurchaseAmount" DECIMAL(10,2) DEFAULT 0,
          "usageLimit" INTEGER,
          "usageLimitPerUser" INTEGER DEFAULT 1,
          "usageCount" INTEGER DEFAULT 0,
          "startDate" TIMESTAMP WITH TIME ZONE,
          "endDate" TIMESTAMP WITH TIME ZONE,
          "applicableCourts" JSONB DEFAULT '[]',
          "applicableSports" JSONB DEFAULT '[]',
          "applicableDays" JSONB DEFAULT '[]',
          "newCustomersOnly" BOOLEAN DEFAULT false,
          "individualUseOnly" BOOLEAN DEFAULT true,
          "specificUsers" JSONB DEFAULT '[]',
          "specificClients" JSONB DEFAULT '[]',
          "isActive" BOOLEAN DEFAULT true,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE("establishmentId", code)
        )
      `);
      await sequelize.query(`
        CREATE INDEX coupons_establishment_id ON coupons("establishmentId")
      `);
      await sequelize.query(`
        CREATE INDEX coupons_code ON coupons(code)
      `);
      await sequelize.query(`
        CREATE INDEX coupons_is_active ON coupons("isActive")
      `);
      console.log('  ✅ Tabla coupons creada');
    } else {
      console.log('  ✓ Tabla coupons ya existe');
    }

    // 4. Crear tabla coupon_usages si no existe
    console.log('\n📋 Verificando tabla coupon_usages...');
    const [couponUsagesTable] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'coupon_usages'
      )
    `);
    
    if (!couponUsagesTable[0].exists) {
      console.log('  ➕ Creando tabla coupon_usages...');
      await sequelize.query(`
        CREATE TABLE coupon_usages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "couponId" UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
          "bookingId" UUID REFERENCES bookings(id) ON DELETE SET NULL,
          "userId" UUID REFERENCES users(id) ON DELETE SET NULL,
          "clientId" UUID REFERENCES clients(id) ON DELETE SET NULL,
          "discountAmount" DECIMAL(10,2) NOT NULL,
          "usedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await sequelize.query(`
        CREATE INDEX coupon_usages_coupon_id ON coupon_usages("couponId")
      `);
      await sequelize.query(`
        CREATE INDEX coupon_usages_booking_id ON coupon_usages("bookingId")
      `);
      await sequelize.query(`
        CREATE INDEX coupon_usages_user_id ON coupon_usages("userId")
      `);
      await sequelize.query(`
        CREATE INDEX coupon_usages_client_id ON coupon_usages("clientId")
      `);
      console.log('  ✅ Tabla coupon_usages creada');
    } else {
      console.log('  ✓ Tabla coupon_usages ya existe');
    }

    console.log('\n✅ Todas las tablas verificadas y creadas correctamente\n');
    
    // Mostrar resumen
    console.log('📊 Resumen de tablas:');
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('bookings', 'reviews', 'coupons', 'coupon_usages')
      ORDER BY table_name
    `);
    tables.forEach(t => console.log(`  ✓ ${t.table_name}`));

  } catch (error) {
    console.error('❌ Error al verificar/crear tablas:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  ensureAllTables()
    .then(() => {
      console.log('\n🎉 Proceso completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Error en el proceso:', error);
      process.exit(1);
    });
}

module.exports = ensureAllTables;
