const { Sequelize } = require('sequelize');
require('dotenv').config();

// Get DATABASE_URL - Railway may use different variable names
const databaseUrl = process.env.DATABASE_URL || 
                    process.env.DATABASE_PRIVATE_URL || 
                    process.env.POSTGRES_URL ||
                    (process.env.PGHOST ? `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}` : null);

// Debug: Log database connection info (without password)
if (databaseUrl) {
  const sanitizedUrl = databaseUrl.replace(/:[^:@]+@/, ':****@');
  console.log('🔗 Using DATABASE_URL:', sanitizedUrl);
} else {
  console.log('⚠️ No DATABASE_URL found, using individual DB_* variables');
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
