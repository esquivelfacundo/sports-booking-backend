const redis = require('redis');
require('dotenv').config();

let client;

const connectRedis = async () => {
  try {
    client = redis.createClient({
      url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
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
    console.error('❌ Redis connection failed:', error);
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
