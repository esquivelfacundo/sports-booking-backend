const redis = require('redis');
require('dotenv').config();

let client;

const connectRedis = async () => {
  // Skip Redis connection if no REDIS_URL is configured
  if (!process.env.REDIS_URL) {
    console.log('ℹ️  Redis not configured (optional) - skipping connection');
    return null;
  }

  try {
    client = redis.createClient({
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD || undefined,
    });

    client.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('🔄 Redis Client connecting...');
    });

    client.on('ready', () => {
      console.log('✅ Redis Client connected and ready');
    });

    await client.connect();
    return client;
  } catch (error) {
    console.error('❌ Redis connection failed (optional):', error.message);
    // Return null if Redis is not available (optional dependency)
    return null;
  }
};

const getRedisClient = () => {
  return client;
};

const disconnectRedis = async () => {
  if (client) {
    await client.disconnect();
    console.log('🔌 Redis Client disconnected');
  }
};

module.exports = {
  connectRedis,
  getRedisClient,
  disconnectRedis
};
