const { Sequelize } = require('sequelize');
require('dotenv').config();

// Helper to check if a URL is a real connection string (not a placeholder)
const isValidDbUrl = (url) => {
  if (!url) return false;
  // Check it's not the placeholder from .env.example
  if (url.includes('username:password@host:port')) return false;
  if (url.includes('username:password@host/')) return false;
  // Must have postgresql:// or postgres:// prefix
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
};

// Get DATABASE_URL - Railway may use different variable names
let databaseUrl = null;

if (isValidDbUrl(process.env.DATABASE_URL)) {
  databaseUrl = process.env.DATABASE_URL;
} else if (isValidDbUrl(process.env.DATABASE_PRIVATE_URL)) {
  databaseUrl = process.env.DATABASE_PRIVATE_URL;
} else if (isValidDbUrl(process.env.DATABASE_PUBLIC_URL)) {
  databaseUrl = process.env.DATABASE_PUBLIC_URL;
} else if (process.env.PGHOST && process.env.PGHOST !== 'host') {
  // Build URL from individual Railway PG* variables
  databaseUrl = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
}

// Debug: Log database connection info (without password)
if (databaseUrl) {
  const sanitizedUrl = databaseUrl.replace(/:[^:@]+@/, ':****@');
  console.log('🔗 Using DATABASE_URL:', sanitizedUrl);
} else {
  console.log('⚠️ No valid DATABASE_URL found, using individual DB_* variables for local dev');
}

// Determine if SSL should be used (Railway, Render, Supabase, etc.)
const useSSL = databaseUrl?.includes('railway') || 
               databaseUrl?.includes('render') ||
               databaseUrl?.includes('supabase') ||
               databaseUrl?.includes('neon') ||
               process.env.NODE_ENV === 'production';

const sslConfig = useSSL ? {
  require: true,
  rejectUnauthorized: false
} : false;

const sequelize = databaseUrl 
  ? new Sequelize(databaseUrl, {
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      dialectOptions: {
        ssl: sslConfig
      }
    })
  : new Sequelize(
      process.env.DB_NAME || 'sports_booking_db',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASSWORD || 'password',
      {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000,
        },
        dialectOptions: {
          ssl: false
        }
      }
    );

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
  }
};

module.exports = { sequelize, testConnection };
