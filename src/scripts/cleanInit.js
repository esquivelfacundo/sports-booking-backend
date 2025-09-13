const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

async function cleanInit() {
  try {
    console.log('🔄 Iniciando limpieza completa y reinicialización...');
    
    // 1. Probar conexión
    await sequelize.authenticate();
    console.log('✅ Conexión establecida');
    
    // 2. Eliminar TODAS las tablas existentes
    await sequelize.query('DROP SCHEMA public CASCADE;');
    await sequelize.query('CREATE SCHEMA public;');
    await sequelize.query('GRANT ALL ON SCHEMA public TO postgres;');
    await sequelize.query('GRANT ALL ON SCHEMA public TO public;');
    console.log('✅ Esquema limpiado completamente');
    
    // 3. Crear tablas manualmente con SQL directo
    await sequelize.query(`
      CREATE TABLE users (
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
      CREATE TABLE establishments (
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
      CREATE TABLE courts (
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
    
    console.log('✅ Tablas creadas con SQL directo');
    
    // 4. Insertar datos de prueba
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    await sequelize.query(`
      INSERT INTO users ("firstName", "lastName", email, password, "userType", phone, "isEmailVerified", city) VALUES
      ('Juan', 'Pérez', 'juan@example.com', $1, 'player', '+54 11 1234-5678', true, 'Buenos Aires'),
      ('María', 'González', 'maria@example.com', $1, 'player', '+54 11 2345-6789', true, 'Buenos Aires'),
      ('Club', 'Central', 'admin@clubcentral.com', $1, 'establishment', '+54 11 4567-8900', true, 'Buenos Aires')
    `, { bind: [hashedPassword] });
    
    const users = await sequelize.query('SELECT id FROM users ORDER BY "createdAt"', { type: sequelize.QueryTypes.SELECT });
    const ownerId = users[2].id;
    
    await sequelize.query(`
      INSERT INTO establishments ("userId", name, description, address, city, latitude, longitude, phone, email, website, images, sports, amenities, "openingHours", "priceRange", "isVerified") VALUES
      ($1, 'Club Deportivo Central', 'Modernas instalaciones deportivas', 'Av. Libertador 1234, Buenos Aires', 'Buenos Aires', -34.6037, -58.3816, '+54 11 4567-8900', 'info@clubcentral.com', 'https://clubcentral.com', '["https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800"]', '["Fútbol 5", "Paddle"]', '["Estacionamiento", "Vestuarios"]', '{"monday": {"open": "08:00", "close": "23:00"}}', '$$', true),
      ($1, 'Complejo Norte', 'Amplio complejo deportivo', 'Calle Norte 567, Buenos Aires', 'Buenos Aires', -34.5875, -58.3974, '+54 11 4567-8901', 'contacto@norte.com', 'https://norte.com', '["https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800"]', '["Fútbol 5", "Tenis"]', '["Estacionamiento", "WiFi"]', '{"monday": {"open": "07:00", "close": "23:00"}}', '$$$', true)
    `, { bind: [ownerId] });
    
    const establishments = await sequelize.query('SELECT id FROM establishments ORDER BY "createdAt"', { type: sequelize.QueryTypes.SELECT });
    
    await sequelize.query(`
      INSERT INTO courts ("establishmentId", name, sport, surface, capacity, "pricePerHour", description, amenities, images) VALUES
      ($1, 'Cancha 1 - Fútbol 5', 'Fútbol 5', 'Césped sintético', 10, 8000, 'Cancha profesional', '["Iluminación LED"]', '["https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800"]'),
      ($1, 'Cancha 2 - Paddle', 'Paddle', 'Césped sintético', 4, 6000, 'Cancha techada', '["Techada"]', '["https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800"]'),
      ($2, 'Cancha A - Fútbol 5', 'Fútbol 5', 'Césped sintético', 10, 10000, 'Cancha premium', '["Aire Acondicionado"]', '["https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800"]')
    `, { bind: [establishments[0].id, establishments[1].id] });
    
    const finalStats = {
      users: (await sequelize.query('SELECT COUNT(*) FROM users', { type: sequelize.QueryTypes.SELECT }))[0].count,
      establishments: (await sequelize.query('SELECT COUNT(*) FROM establishments', { type: sequelize.QueryTypes.SELECT }))[0].count,
      courts: (await sequelize.query('SELECT COUNT(*) FROM courts', { type: sequelize.QueryTypes.SELECT }))[0].count
    };
    
    console.log('🎉 Base de datos inicializada exitosamente!');
    console.log('📊 Resumen:');
    console.log(`   - ${finalStats.users} usuarios`);
    console.log(`   - ${finalStats.establishments} establecimientos`);
    console.log(`   - ${finalStats.courts} canchas`);
    
    return { 
      success: true, 
      message: 'Database cleaned and initialized successfully',
      stats: finalStats
    };
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw new Error(`Clean initialization failed: ${error.message}`);
  }
}

module.exports = { cleanInit };
