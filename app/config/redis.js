const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const allowRedisInTest = process.env.REDIS_TEST_ENABLED === 'true';
if (process.env.NODE_ENV !== 'test' || allowRedisInTest) {
    if (process.env.NODE_ENV === 'test') {
        logger.info('Redis test mode enabled via REDIS_TEST_ENABLED');
    }
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