const { sequelize } = require('../config/database');
const { User, Establishment, Court } = require('../models');
const bcrypt = require('bcryptjs');

async function initializeDatabase() {
  try {
    console.log('🔄 Inicializando base de datos...');
    
    // Sincronizar modelos (crear tablas)
    await sequelize.sync({ force: false });
    console.log('✅ Tablas sincronizadas');

    // Verificar si ya hay datos
    const userCount = await User.count();
    if (userCount > 0) {
      console.log('ℹ️  Base de datos ya tiene datos');
      return;
    }

    console.log('📝 Creando datos de prueba...');

    // Crear usuarios de prueba
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    const users = await User.bulkCreate([
      {
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        password: hashedPassword,
        role: 'player',
        phone: '+54 11 1234-5678',
        verified: true
      },
      {
        firstName: 'María',
        lastName: 'González',
        email: 'maria@example.com',
        password: hashedPassword,
        role: 'player',
        phone: '+54 11 2345-6789',
        verified: true
      },
      {
        firstName: 'Club',
        lastName: 'Central',
        email: 'admin@clubcentral.com',
        password: hashedPassword,
        role: 'establishment',
        phone: '+54 11 4567-8900',
        verified: true
      }
    ]);

    console.log(`✅ ${users.length} usuarios creados`);

    // Crear establecimientos de prueba
    const establishments = await Establishment.bulkCreate([
      {
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
          monday: { open: '08:00', close: '23:00' },
          tuesday: { open: '08:00', close: '23:00' },
          wednesday: { open: '08:00', close: '23:00' },
          thursday: { open: '08:00', close: '23:00' },
          friday: { open: '08:00', close: '24:00' },
          saturday: { open: '09:00', close: '24:00' },
          sunday: { open: '09:00', close: '22:00' }
        },
        priceRange: '$$',
        featured: true,
        verified: true,
        ownerId: users[2].id
      },
      {
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
          monday: { open: '07:00', close: '23:00' },
          tuesday: { open: '07:00', close: '23:00' },
          wednesday: { open: '07:00', close: '23:00' },
          thursday: { open: '07:00', close: '23:00' },
          friday: { open: '07:00', close: '24:00' },
          saturday: { open: '08:00', close: '24:00' },
          sunday: { open: '08:00', close: '22:00' }
        },
        priceRange: '$$$',
        featured: true,
        verified: true,
        ownerId: users[2].id
      }
    ]);

    console.log(`✅ ${establishments.length} establecimientos creados`);

    // Crear canchas de prueba
    const courts = await Court.bulkCreate([
      {
        name: 'Cancha 1 - Fútbol 5',
        sport: 'Fútbol 5',
        surface: 'Césped sintético',
        capacity: 10,
        pricePerHour: 8000,
        description: 'Cancha de fútbol 5 con césped sintético de última generación',
        amenities: ['Iluminación LED', 'Vestuarios'],
        images: ['https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800'],
        active: true,
        establishmentId: establishments[0].id
      },
      {
        name: 'Cancha 2 - Paddle',
        sport: 'Paddle',
        surface: 'Césped sintético',
        capacity: 4,
        pricePerHour: 6000,
        description: 'Cancha de paddle techada con iluminación profesional',
        amenities: ['Techada', 'Iluminación LED'],
        images: ['https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800'],
        active: true,
        establishmentId: establishments[0].id
      },
      {
        name: 'Cancha A - Fútbol 5',
        sport: 'Fútbol 5',
        surface: 'Césped sintético',
        capacity: 10,
        pricePerHour: 10000,
        description: 'Cancha premium de fútbol 5 con todas las comodidades',
        amenities: ['Iluminación LED', 'Vestuarios', 'Aire Acondicionado'],
        images: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800'],
        active: true,
        establishmentId: establishments[1].id
      }
    ]);

    console.log(`✅ ${courts.length} canchas creadas`);

    console.log('🎉 Base de datos inicializada exitosamente!');
    console.log('📊 Resumen:');
    console.log(`   - ${users.length} usuarios`);
    console.log(`   - ${establishments.length} establecimientos`);
    console.log(`   - ${courts.length} canchas`);

  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    throw error;
  }
}

module.exports = { initializeDatabase };

// Si se ejecuta directamente
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('✅ Inicialización completada');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}
