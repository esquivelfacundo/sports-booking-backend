const { sequelize } = require('../config/database');
const { User, Establishment, Court } = require('../models');
const bcrypt = require('bcryptjs');

async function robustInit() {
  try {
    console.log('🔄 Iniciando inicialización robusta de base de datos...');
    
    // 1. Probar conexión a la base de datos
    await sequelize.authenticate();
    console.log('✅ Conexión a base de datos establecida');
    
    // 2. Sincronizar modelos (esto creará las tablas con el esquema correcto)
    // force: true eliminará y recreará todas las tablas
    await sequelize.sync({ force: true });
    console.log('✅ Modelos sincronizados - tablas creadas/actualizadas');
    
    // 3. Verificar si ya hay datos
    const userCount = await User.count();
    if (userCount > 0) {
      console.log('ℹ️  Base de datos ya tiene datos');
      return { 
        success: true, 
        message: 'Database already has data',
        stats: {
          users: userCount,
          establishments: await Establishment.count(),
          courts: await Court.count()
        }
      };
    }

    console.log('📝 Creando datos de prueba...');

    // 4. Crear usuarios de prueba usando los modelos de Sequelize
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    const users = await User.bulkCreate([
      {
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        password: hashedPassword,
        userType: 'player',
        phone: '+54 11 1234-5678',
        isEmailVerified: true,
        city: 'Buenos Aires'
      },
      {
        firstName: 'María',
        lastName: 'González',
        email: 'maria@example.com',
        password: hashedPassword,
        userType: 'player',
        phone: '+54 11 2345-6789',
        isEmailVerified: true,
        city: 'Buenos Aires'
      },
      {
        firstName: 'Club',
        lastName: 'Central',
        email: 'admin@clubcentral.com',
        password: hashedPassword,
        userType: 'establishment',
        phone: '+54 11 4567-8900',
        isEmailVerified: true,
        city: 'Buenos Aires'
      }
    ]);

    console.log(`✅ ${users.length} usuarios creados`);

    // 5. Crear establecimientos usando el modelo correcto
    const establishments = await Establishment.bulkCreate([
      {
        userId: users[2].id, // Club Central
        name: 'Club Deportivo Central',
        description: 'Modernas instalaciones deportivas con canchas de fútbol 5 y paddle',
        address: 'Av. Libertador 1234, Buenos Aires',
        city: 'Buenos Aires',
        latitude: -34.6037,
        longitude: -58.3816,
        phone: '+54 11 4567-8900',
        email: 'info@clubcentral.com',
        website: 'https://clubcentral.com',
        images: [
          'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800',
          'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800'
        ],
        sports: ['Fútbol 5', 'Paddle'],
        amenities: ['Estacionamiento', 'Vestuarios', 'Buffet', 'WiFi'],
        openingHours: {
          monday: { open: '08:00', close: '23:00', closed: false },
          tuesday: { open: '08:00', close: '23:00', closed: false },
          wednesday: { open: '08:00', close: '23:00', closed: false },
          thursday: { open: '08:00', close: '23:00', closed: false },
          friday: { open: '08:00', close: '24:00', closed: false },
          saturday: { open: '09:00', close: '24:00', closed: false },
          sunday: { open: '09:00', close: '22:00', closed: false }
        },
        priceRange: '$$',
        isActive: true,
        isVerified: true
      },
      {
        userId: users[2].id, // Club Central
        name: 'Complejo Deportivo Norte',
        description: 'Amplio complejo con múltiples canchas y servicios premium',
        address: 'Calle Falsa 567, Buenos Aires',
        city: 'Buenos Aires',
        latitude: -34.5875,
        longitude: -58.3974,
        phone: '+54 11 4567-8901',
        email: 'contacto@deportivonorte.com',
        website: 'https://deportivonorte.com',
        images: [
          'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
          'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800'
        ],
        sports: ['Fútbol 5', 'Tenis', 'Paddle'],
        amenities: ['Estacionamiento', 'Vestuarios', 'Buffet', 'WiFi', 'Aire Acondicionado'],
        openingHours: {
          monday: { open: '07:00', close: '23:00', closed: false },
          tuesday: { open: '07:00', close: '23:00', closed: false },
          wednesday: { open: '07:00', close: '23:00', closed: false },
          thursday: { open: '07:00', close: '23:00', closed: false },
          friday: { open: '07:00', close: '24:00', closed: false },
          saturday: { open: '08:00', close: '24:00', closed: false },
          sunday: { open: '08:00', close: '22:00', closed: false }
        },
        priceRange: '$$$',
        isActive: true,
        isVerified: true
      }
    ]);

    console.log(`✅ ${establishments.length} establecimientos creados`);

    // 6. Crear canchas
    const courts = await Court.bulkCreate([
      {
        establishmentId: establishments[0].id,
        name: 'Cancha 1 - Fútbol 5',
        sport: 'Fútbol 5',
        surface: 'Césped sintético',
        capacity: 10,
        pricePerHour: 8000,
        description: 'Cancha de fútbol 5 con césped sintético de última generación',
        amenities: ['Iluminación LED', 'Vestuarios'],
        images: ['https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800'],
        active: true
      },
      {
        establishmentId: establishments[0].id,
        name: 'Cancha 2 - Paddle',
        sport: 'Paddle',
        surface: 'Césped sintético',
        capacity: 4,
        pricePerHour: 6000,
        description: 'Cancha de paddle techada con iluminación profesional',
        amenities: ['Techada', 'Iluminación LED'],
        images: ['https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800'],
        active: true
      },
      {
        establishmentId: establishments[1].id,
        name: 'Cancha A - Fútbol 5',
        sport: 'Fútbol 5',
        surface: 'Césped sintético',
        capacity: 10,
        pricePerHour: 10000,
        description: 'Cancha premium de fútbol 5 con todas las comodidades',
        amenities: ['Iluminación LED', 'Vestuarios', 'Aire Acondicionado'],
        images: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800'],
        active: true
      }
    ]);

    console.log(`✅ ${courts.length} canchas creadas`);

    // 7. Obtener estadísticas finales
    const finalStats = {
      users: await User.count(),
      establishments: await Establishment.count(),
      courts: await Court.count()
    };

    console.log('🎉 Base de datos inicializada exitosamente!');
    console.log('📊 Resumen:');
    console.log(`   - ${finalStats.users} usuarios`);
    console.log(`   - ${finalStats.establishments} establecimientos`);
    console.log(`   - ${finalStats.courts} canchas`);

    return { 
      success: true, 
      message: 'Database initialized successfully',
      stats: finalStats
    };

  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    
    // Información detallada del error para debugging
    const errorInfo = {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
    
    throw new Error(`Database initialization failed: ${error.message}`);
  }
}

module.exports = { robustInit };

// Si se ejecuta directamente
if (require.main === module) {
  robustInit()
    .then((result) => {
      console.log('✅ Inicialización completada:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}
