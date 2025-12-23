const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function cleanAndRecreateJuventus() {
  console.log('🚀 Limpiando y recreando establecimiento Juventus...\n');
  
  try {
    // 1. Obtener usuario Juventus
    console.log('1️⃣ Obteniendo usuario Juventus...');
    const [users] = await sequelize.query(`
      SELECT id FROM users WHERE email = 'juventus@miscanchas.com'
    `);
    
    if (users.length === 0) {
      console.log('❌ Usuario juventus@miscanchas.com no encontrado');
      return;
    }
    
    const userId = users[0].id;
    console.log(`✅ Usuario encontrado: ${userId}\n`);
    
    // 2. Obtener establecimiento actual
    const [establishments] = await sequelize.query(`
      SELECT id FROM establishments WHERE "userId" = '${userId}'
    `);
    
    if (establishments.length > 0) {
      const estId = establishments[0].id;
      console.log('2️⃣ Limpiando datos del establecimiento existente...');
      
      // Eliminar en orden correcto (respetando foreign keys)
      await sequelize.query(`DELETE FROM booking_consumptions WHERE "bookingId" IN (SELECT id FROM bookings WHERE "establishmentId" = '${estId}')`);
      console.log('  ✅ Consumos de reservas eliminados');
      
      await sequelize.query(`DELETE FROM booking_payments WHERE "bookingId" IN (SELECT id FROM bookings WHERE "establishmentId" = '${estId}')`);
      console.log('  ✅ Pagos de reservas eliminados');
      
      await sequelize.query(`DELETE FROM bookings WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Reservas eliminadas');
      
      await sequelize.query(`DELETE FROM current_account_movements WHERE "orderId" IN (SELECT id FROM orders WHERE "establishmentId" = '${estId}')`);
      console.log('  ✅ Movimientos de cuenta corriente (órdenes) eliminados');
      
      await sequelize.query(`DELETE FROM order_items WHERE "orderId" IN (SELECT id FROM orders WHERE "establishmentId" = '${estId}')`);
      console.log('  ✅ Items de órdenes eliminados');
      
      await sequelize.query(`DELETE FROM order_payments WHERE "orderId" IN (SELECT id FROM orders WHERE "establishmentId" = '${estId}')`);
      console.log('  ✅ Pagos de órdenes eliminados');
      
      await sequelize.query(`DELETE FROM orders WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Órdenes eliminadas');
      
      await sequelize.query(`DELETE FROM stock_movements WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Movimientos de stock eliminados');
      
      await sequelize.query(`DELETE FROM products WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Productos eliminados');
      
      await sequelize.query(`DELETE FROM product_categories WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Categorías de productos eliminadas');
      
      await sequelize.query(`DELETE FROM suppliers WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Proveedores eliminados');
      
      await sequelize.query(`DELETE FROM cash_register_movements WHERE "cashRegisterId" IN (SELECT id FROM cash_registers WHERE "establishmentId" = '${estId}')`);
      console.log('  ✅ Movimientos de caja eliminados');
      
      await sequelize.query(`DELETE FROM cash_registers WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Cajas registradoras eliminadas');
      
      await sequelize.query(`DELETE FROM current_account_movements WHERE "currentAccountId" IN (SELECT id FROM current_accounts WHERE "establishmentId" = '${estId}')`);
      console.log('  ✅ Movimientos de cuenta corriente eliminados');
      
      await sequelize.query(`DELETE FROM current_accounts WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Cuentas corrientes eliminadas');
      
      await sequelize.query(`DELETE FROM client_debts WHERE "clientId" IN (SELECT id FROM clients WHERE "establishmentId" = '${estId}')`);
      console.log('  ✅ Deudas de clientes eliminadas');
      
      await sequelize.query(`DELETE FROM clients WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Clientes eliminados');
      
      await sequelize.query(`DELETE FROM establishment_staff WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Staff eliminado');
      
      await sequelize.query(`DELETE FROM amenities WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Amenities eliminados');
      
      await sequelize.query(`DELETE FROM courts WHERE "establishmentId" = '${estId}'`);
      console.log('  ✅ Canchas eliminadas');
      
      await sequelize.query(`DELETE FROM establishment_integrations WHERE "establishment_id" = '${estId}'`);
      console.log('  ✅ Integraciones eliminadas');
      
      await sequelize.query(`DELETE FROM establishments WHERE id = '${estId}'`);
      console.log('  ✅ Establecimiento eliminado\n');
    }
    
    // 3. Generar API Key
    const apiKey = 'mc_' + crypto.randomBytes(32).toString('hex');
    console.log('3️⃣ Generando API Key...');
    console.log(`   API Key: ${apiKey}\n`);
    
    // 4. Crear nuevo establecimiento
    console.log('4️⃣ Creando nuevo establecimiento...');
    const [estResult] = await sequelize.query(`
      INSERT INTO establishments (
        id, "userId", name, slug, description, address, city, phone, email,
        latitude, longitude, "isActive", "isVerified", rating, "totalReviews",
        "cancellationPolicy", "cancellationDeadlineHours", "refundPercentage",
        "noShowPenalty", "noShowPenaltyType", "noShowPenaltyPercentage",
        "depositPaymentDeadlineHours", "depositType", "depositPercentage", "depositFixedAmount",
        "requireDeposit", "allowFullPayment", "allowSameDayBooking",
        "minAdvanceBookingHours", "maxAdvanceBookingDays",
        "apiKey",
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
        true,
        true,
        0,
        0,
        'full_refund',
        24,
        100,
        true,
        'deposit_only',
        100,
        2,
        'percentage',
        30,
        5000.00,
        true,
        true,
        true,
        2,
        30,
        '${apiKey}',
        NOW(),
        NOW()
      )
      RETURNING id
    `);
    
    const establishmentId = estResult[0].id;
    console.log(`✅ Establecimiento creado: ${establishmentId}\n`);
    
    // 5. Crear canchas
    console.log('5️⃣ Creando canchas...');
    
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
    
    // 6. Crear amenity (Quincho)
    console.log('6️⃣ Creando amenities...');
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
    
    // 7. Crear staff
    console.log('7️⃣ Creando personal del establecimiento...');
    
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
    
    // 8. Limpiar datos de testing de otros establecimientos
    console.log('8️⃣ Limpiando datos de testing de otros establecimientos...');
    
    await sequelize.query(`
      DELETE FROM bookings 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Reservas de testing eliminadas');
    
    await sequelize.query(`
      DELETE FROM clients 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Clientes de testing eliminados');
    
    await sequelize.query(`
      DELETE FROM stock_movements 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Movimientos de stock de testing eliminados');
    
    await sequelize.query(`
      DELETE FROM products 
      WHERE "establishmentId" IN (
        SELECT id FROM establishments WHERE email LIKE '%prueba%' OR email LIKE '%test%'
      )
    `);
    console.log('  ✅ Productos de testing eliminados');
    
    console.log('\n✅ ¡Migración completada exitosamente!\n');
    console.log('📋 Resumen:');
    console.log(`   Usuario: juventus@miscanchas.com`);
    console.log(`   Password: (sin cambios)`);
    console.log(`   Establecimiento: Club Juventus`);
    console.log(`   ID: ${establishmentId}`);
    console.log(`   Canchas: 6 canchas de fútbol`);
    console.log(`   Amenities: 1 quincho`);
    console.log(`   Staff: 3 miembros (admin, gerente, recepcionista)`);
    console.log('\n🔑 API Key para WhatsApp Bot:');
    console.log(`   ${apiKey}`);
    console.log('\n📝 Credenciales del staff:');
    console.log('   Admin: admin@clubjuventus.com / Admin2024! (PIN: 1234)');
    console.log('   Gerente: gerente@clubjuventus.com / Gerente2024!');
    console.log('   Recepción: recepcion@clubjuventus.com / Recepcion2024!');
    console.log('\n⚠️  IMPORTANTE: Las imágenes deben subirse manualmente desde la interfaz');
    console.log('\n🔗 Cloudinary configurado para almacenamiento de imágenes en producción');
    
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  cleanAndRecreateJuventus()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = cleanAndRecreateJuventus;
