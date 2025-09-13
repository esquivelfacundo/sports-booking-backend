const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

async function simpleInit() {
  try {
    console.log('🔄 Inicializando base de datos simple...');
    
    // Crear tablas básicas manualmente
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        "firstName" VARCHAR(255) NOT NULL,
        "lastName" VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        "dateOfBirth" DATE,
        "profileImage" VARCHAR(255),
        city VARCHAR(255),
        "isEmailVerified" BOOLEAN DEFAULT false,
        "isPhoneVerified" BOOLEAN DEFAULT false,
        "userType" VARCHAR(50) DEFAULT 'player',
        bio TEXT,
        "favoritesSports" JSONB DEFAULT '[]',
        "skillLevel" VARCHAR(50) DEFAULT 'beginner',
        location JSONB,
        "isActive" BOOLEAN DEFAULT true,
        "lastLoginAt" TIMESTAMP,
        "emailVerificationToken" VARCHAR(255),
        "passwordResetToken" VARCHAR(255),
        "passwordResetExpires" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS establishments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        address VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        phone VARCHAR(50),
        email VARCHAR(255),
        website VARCHAR(255),
        logo VARCHAR(255),
        images JSONB DEFAULT '[]',
        amenities JSONB DEFAULT '[]',
        rules JSONB DEFAULT '[]',
        "openingHours" JSONB DEFAULT '{}',
        "isActive" BOOLEAN DEFAULT true,
        "isVerified" BOOLEAN DEFAULT false,
        rating DECIMAL(3,2) DEFAULT 0.0,
        "totalReviews" INTEGER DEFAULT 0,
        "priceRange" VARCHAR(10) DEFAULT '$$',
        sports JSONB DEFAULT '[]',
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS courts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "establishmentId" UUID REFERENCES establishments(id),
        name VARCHAR(255) NOT NULL,
        sport VARCHAR(100) NOT NULL,
        surface VARCHAR(100),
        capacity INTEGER,
        "pricePerHour" INTEGER,
        description TEXT,
        amenities JSONB DEFAULT '[]',
        images JSONB DEFAULT '[]',
        active BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Tablas creadas');

    // Verificar si ya hay datos
    const userResult = await sequelize.query('SELECT COUNT(*) FROM users', { type: sequelize.QueryTypes.SELECT });
    const userCount = parseInt(userResult[0].count);
    
    if (userCount > 0) {
      console.log('ℹ️  Base de datos ya tiene datos');
      return { success: true, message: 'Database already has data' };
    }

    console.log('📝 Creando datos de prueba...');

    // Crear usuarios de prueba
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    await sequelize.query(`
      INSERT INTO users ("firstName", "lastName", email, password, "userType", phone, "isEmailVerified") VALUES
      ('Juan', 'Pérez', 'juan@example.com', '${hashedPassword}', 'player', '+54 11 1234-5678', true),
      ('María', 'González', 'maria@example.com', '${hashedPassword}', 'player', '+54 11 2345-6789', true),
      ('Club', 'Central', 'admin@clubcentral.com', '${hashedPassword}', 'establishment', '+54 11 4567-8900', true)
    `);

    // Obtener IDs de usuarios
    const users = await sequelize.query('SELECT id FROM users ORDER BY "createdAt"', { type: sequelize.QueryTypes.SELECT });
    const ownerId = users[2].id; // Club Central

    // Crear establecimientos
    await sequelize.query(`
      INSERT INTO establishments ("userId", name, description, address, city, latitude, longitude, phone, email, website, images, sports, amenities, "openingHours", "priceRange", "isVerified") VALUES
      ('${ownerId}', 'Club Deportivo Central', 'Modernas instalaciones deportivas con canchas de fútbol 5 y paddle', 'Av. Libertador 1234, Buenos Aires', 'Buenos Aires', -34.6037, -58.3816, '+54 11 4567-8900', 'info@clubcentral.com', 'https://clubcentral.com', '["https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800"]', '["Fútbol 5", "Paddle"]', '["Estacionamiento", "Vestuarios", "Buffet", "WiFi"]', '{"monday": {"open": "08:00", "close": "23:00"}, "tuesday": {"open": "08:00", "close": "23:00"}}', '$$', true),
      ('${ownerId}', 'Complejo Deportivo Norte', 'Amplio complejo con múltiples canchas y servicios premium', 'Calle Falsa 567, Buenos Aires', 'Buenos Aires', -34.5875, -58.3974, '+54 11 4567-8901', 'contacto@deportivonorte.com', 'https://deportivonorte.com', '["https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800"]', '["Fútbol 5", "Tenis", "Paddle"]', '["Estacionamiento", "Vestuarios", "Buffet", "WiFi", "Aire Acondicionado"]', '{"monday": {"open": "07:00", "close": "23:00"}}', '$$$', true)
    `);

    // Obtener IDs de establecimientos
    const establishments = await sequelize.query('SELECT id FROM establishments ORDER BY "createdAt"', { type: sequelize.QueryTypes.SELECT });

    // Crear canchas
    await sequelize.query(`
      INSERT INTO courts ("establishmentId", name, sport, surface, capacity, "pricePerHour", description, amenities, images) VALUES
      ('${establishments[0].id}', 'Cancha 1 - Fútbol 5', 'Fútbol 5', 'Césped sintético', 10, 8000, 'Cancha de fútbol 5 con césped sintético de última generación', '["Iluminación LED", "Vestuarios"]', '["https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800"]'),
      ('${establishments[0].id}', 'Cancha 2 - Paddle', 'Paddle', 'Césped sintético', 4, 6000, 'Cancha de paddle techada con iluminación profesional', '["Techada", "Iluminación LED"]', '["https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800"]'),
      ('${establishments[1].id}', 'Cancha A - Fútbol 5', 'Fútbol 5', 'Césped sintético', 10, 10000, 'Cancha premium de fútbol 5 con todas las comodidades', '["Iluminación LED", "Vestuarios", "Aire Acondicionado"]', '["https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800"]')
    `);

    const finalStats = {
      users: await sequelize.query('SELECT COUNT(*) FROM users', { type: sequelize.QueryTypes.SELECT }),
      establishments: await sequelize.query('SELECT COUNT(*) FROM establishments', { type: sequelize.QueryTypes.SELECT }),
      courts: await sequelize.query('SELECT COUNT(*) FROM courts', { type: sequelize.QueryTypes.SELECT })
    };

    console.log('🎉 Base de datos inicializada exitosamente!');
    console.log('📊 Resumen:');
    console.log(`   - ${finalStats.users[0].count} usuarios`);
    console.log(`   - ${finalStats.establishments[0].count} establecimientos`);
    console.log(`   - ${finalStats.courts[0].count} canchas`);

    return { 
      success: true, 
      message: 'Database initialized successfully',
      stats: finalStats
    };

  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    throw error;
  }
}

module.exports = { simpleInit };

// Si se ejecuta directamente
if (require.main === module) {
  simpleInit()
    .then((result) => {
      console.log('✅ Inicialización completada:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}
