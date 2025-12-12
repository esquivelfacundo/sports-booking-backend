const { Sequelize } = require('sequelize');
require('dotenv').config();

// Determine if SSL should be used (Railway, Render, Supabase, etc.)
const useSSL = process.env.DATABASE_URL?.includes('railway') || 
               process.env.DATABASE_URL?.includes('render') ||
               process.env.DATABASE_URL?.includes('supabase') ||
               process.env.DATABASE_URL?.includes('neon') ||
               process.env.NODE_ENV === 'production';

const sslConfig = useSSL ? {
  require: true,
  rejectUnauthorized: false
} : false;

const sequelize = process.env.DATABASE_URL 
  ? new Sequelize(process.env.DATABASE_URL, {
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
