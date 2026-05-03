const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

if (process.env.NODE_ENV !== 'test') {
    redisClient = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => logger.error('Redis Client Error', err));
    redisClient.on('connect', () => logger.info('Redis Client Connected'));

    (async () => {
        try {
            await redisClient.connect();
        } catch (err) {
            logger.error('Redis connection failed', err);
        }
    })();
} else {
    logger.info('Redis client disabled in test environment');
}

module.exports = redisClient;