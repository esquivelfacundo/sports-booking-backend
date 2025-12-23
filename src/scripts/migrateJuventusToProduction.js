const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

async function migrateJuventusToProduction() {
  console.log('🚀 Iniciando migración de Juventus a producción...\n');
  
  try {
    // 1. Crear usuario principal
    console.log('1️⃣ Creando usuario principal...');
    const hashedPassword = await bcrypt.hash('Juventus2024!', 10);
    
    const [userResult] = await sequelize.query(`
      INSERT INTO users (
        id, email, password, "firstName", "lastName", phone, 
        "userType", "isActive", "isEmailVerified", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        'juventus@miscanchas.com',
        '${hashedPassword}',
        'Club',
        'Juventus',
        '3794123456',
        'establishment',
        true,
        true,
        NOW(),
        NOW()
      )
      RETURNING id
    `);
    
    const userId = userResult[0].id;
    console.log(`✅ Usuario creado: ${userId}\n`);
    
    // 2. Crear establecimiento
    console.log('2️⃣ Creando establecimiento...');
    const [estResult] = await sequelize.query(`
      INSERT INTO establishments (
        id, "userId", name, slug, description, address, city, phone, email,
        latitude, longitude, "pricePerHour", "pricePerHour90", "pricePerHour120",
        "depositPercent", "minDeposit", "openingTime", "closingTime",
        "isActive", "isVerified", rating, "totalReviews",
        "cancellationPolicy", "cancellationDeadlineHours", "refundPercentage",
        "noShowPenalty", "noShowPenaltyType", "noShowPenaltyPercentage",
        "depositPaymentDeadlineHours",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        '${userId}',
        'Club Juventus',
        'club-juventus',
        'Club deportivo con canchas de fútbol 5 y amenities',
        'Av. Principal 1234',
        'Resistencia',
        '3794123456',
        'info@clubjuventus.com',
        -27.4514,
        -58.9867,
        25000.00,
        NULL,
        NULL,
        30,
        5000.00,
        '08:00',
        '23:00',
        true,
        true,
        0,
        0,
        'flexible',
        24,
        100,
        true,
        'deposit_only',
        100,
        2,
        NOW(),
        NOW()
      )
      RETURNING id
    `);
    
    const establishmentId = estResult[0].id;
    console.log(`✅ Establecimiento creado: ${establishmentId}\n`);
    
    // 3. Crear canchas
    console.log('3️⃣ Creando canchas...');
    
    const courts = [
      { name: 'Cancha #1', sport: 'futbol', surface: 'synthetic', isIndoor: true, capacity: 10, price: 25000, description: 'Cancha de fútbol 5 techada con iluminación LED' },
      { name: 'Cancha #2', sport: 'futbol', surface: 'synthetic', isIndoor: true, capacity: 10, price: 25000, description: 'Cancha de fútbol 5 techada con iluminación LED' },
      { name: 'Cancha #3', sport: 'futbol', surface: 'synthetic', isIndoor: true, capacity: 10, price: 25000, description: 'Cancha de fútbol 5 techada con iluminación LED' },
      { name: 'Cancha #4', sport: 'futbol', surface: 'synthetic', isIndoor: true, capacity: 4, price: 25000, description: 'Cancha de fútbol profesional con iluminación nocturna' },
      { name: 'Cancha #5', sport: 'futbol', surface: 'synthetic', isIndoor: true, capacity: 4, price: 25000, description: 'Cancha de fútbol profesional' },
      { name: 'Cancha #6', sport: 'futbol', surface: 'synthetic', isIndoor: true, capacity: 4, price: 25000, description: 'Cancha de fútbol profesional' }
    ];
    
    for (const court of courts) {
      await sequelize.query(`
        INSERT INTO courts (
          id, "establishmentId", name, sport, surface, "isIndoor", capacity,
          "pricePerHour", amenities, "isActive", description,
          "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          '${establishmentId}',
          '${court.name}',
          '${court.sport}',
          '${court.surface}',
          ${court.isIndoor},
          ${court.capacity},
          ${court.price},
          '["Iluminación LED", "Techada"]'::jsonb,
          true,
          '${court.description}',
          NOW(),
          NOW()
        )
      `);
      console.log(`  ✅ ${court.name} creada`);
    }
    console.log('');
    
    // 4. Crear amenity (Quincho)
    console.log('4️⃣ Creando amenities...');
    await sequelize.query(`
      INSERT INTO amenities (
        id, "establishmentId", name, description, icon, "pricePerHour",
        "isBookable", "isPublic", "isActive", capacity, "sortOrder",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        '${establishmentId}',
        'Quincho',
        'Quincho con parrilla y mesas',
        'Flame',
        30000.00,
        true,
        false,
        true,
        40,
        1,
        NOW(),
        NOW()
      )
    `);
    console.log('  ✅ Quincho creado\n');
    
    // 5. Crear staff
    console.log('5️⃣ Creando personal del establecimiento...');
    
    const staffMembers = [
      {
        email: 'admin@clubjuventus.com',
        password: await bcrypt.hash('Admin2024!', 10),
        name: 'Administrador',
        phone: '3794111111',
        role: 'admin',
        pin: '1234'
      },
      {
        email: 'gerente@clubjuventus.com',
        password: await bcrypt.hash('Gerente2024!', 10),
        name: 'Gerente',
        phone: '3794222222',
        role: 'manager',
        pin: null
      },
      {
        email: 'recepcion@clubjuventus.com',
        password: await bcrypt.hash('Recepcion2024!', 10),
        name: 'Recepcionista',
        phone: '3794333333',
        role: 'receptionist',
        pin: null
      }
    ];
    
    const permissions = {
      admin: {
        staff: { view: true, create: true, edit: true, delete: true },
        courts: { view: true, create: true, edit: true, delete: true },
        clients: { view: true, create: true, edit: true, delete: true },
        finance: { view: true, create: true, edit: true },
        bookings: { view: true, create: true, edit: true, delete: true },
        settings: { view: true, edit: true },
        analytics: { view: true }
      },
      manager: {
        staff: { view: true, create: false, edit: false, delete: false },
        courts: { view: true, create: false, edit: false, delete: false },
        clients: { view: true, create: true, edit: true, delete: false },
        finance: { view: true, create: false, edit: false },
        bookings: { view: true, create: true, edit: true, delete: true },
        settings: { view: true, edit: false },
        analytics: { view: true }
      },
      receptionist: {
        staff: { view: false, create: false, edit: false, delete: false },
        courts: { view: true, create: false, edit: false, delete: false },
        clients: { view: true, create: true, edit: true, delete: false },
        finance: { view: false, create: false, edit: false },
        bookings: { view: true, create: true, edit: true, delete: false },
        settings: { view: false, edit: false },
        analytics: { view: false }
      }
    };
    
    for (const staff of staffMembers) {
      await sequelize.query(`
        INSERT INTO establishment_staff (
          id, "establishmentId", email, password, name, phone, role,
          permissions, "isActive", pin, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          '${establishmentId}',
          '${staff.email}',
          '${staff.password}',
          '${staff.name}',
          '${staff.phone}',
          '${staff.role}',
          '${JSON.stringify(permissions[staff.role])}'::jsonb,
          true,
          ${staff.pin ? `'${staff.pin}'` : 'NULL'},
          NOW(),
          NOW()
        )
      `);
      console.log(`  ✅ ${staff.name} (${staff.role}) creado`);
    }
    console.log('');
    
    // 6. Limpiar datos de testing
    console.log('6️⃣ Limpiando datos de testing...');
    
    // Eliminar reservas de testing
    await sequelize.query(`
      DELETE FROM bookings 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Reservas de testing eliminadas');
    
    // Eliminar clientes de testing
    await sequelize.query(`
      DELETE FROM clients 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Clientes de testing eliminados');
    
    // Eliminar movimientos de stock de testing
    await sequelize.query(`
      DELETE FROM stock_movements 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Movimientos de stock de testing eliminados');
    
    // Eliminar productos de testing
    await sequelize.query(`
      DELETE FROM products 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Productos de testing eliminados');
    
    // Eliminar órdenes de testing
    await sequelize.query(`
      DELETE FROM orders 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Órdenes de testing eliminadas');
    
    // Eliminar movimientos de caja de testing
    await sequelize.query(`
      DELETE FROM cash_register_movements 
      WHERE "cashRegisterId" IN (
        SELECT id FROM cash_registers WHERE "establishmentId" IN (
          SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
        )
      )
    `);
    console.log('  ✅ Movimientos de caja de testing eliminados');
    
    // Eliminar cajas de testing
    await sequelize.query(`
      DELETE FROM cash_registers 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Cajas registradoras de testing eliminadas');
    
    console.log('\n✅ ¡Migración completada exitosamente!\n');
    console.log('📋 Resumen:');
    console.log(`   Usuario: juventus@miscanchas.com`);
    console.log(`   Password: Juventus2024!`);
    console.log(`   Establecimiento: Club Juventus`);
    console.log(`   Canchas: 6 canchas de fútbol`);
    console.log(`   Amenities: 1 quincho`);
    console.log(`   Staff: 3 miembros (admin, gerente, recepcionista)`);
    console.log('\n📝 Credenciales del staff:');
    console.log('   Admin: admin@clubjuventus.com / Admin2024! (PIN: 1234)');
    console.log('   Gerente: gerente@clubjuventus.com / Gerente2024!');
    console.log('   Recepción: recepcion@clubjuventus.com / Recepcion2024!');
    console.log('\n⚠️  IMPORTANTE: Las imágenes deben subirse manualmente desde la interfaz');
    
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  migrateJuventusToProduction()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = migrateJuventusToProduction;
