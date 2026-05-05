const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const sanitizeRedisUrl = (url) => {
    if (!url) return 'redis://localhost:6379';
    let cleanUrl = url.trim();
    
    // Handle common mistake of pasting the entire Upstash command line:
    // e.g. "redis-cli --tls -u redis://..."
    if (cleanUrl.includes('redis-cli')) {
        const urlMatch = cleanUrl.match(/redis(s)?:\/\/[^\s]+/);
        if (urlMatch) {
            cleanUrl = urlMatch[0];
            // If the command had --tls but the URL didn't have 'rediss', upgrade it
            if (url.includes('--tls') && cleanUrl.startsWith('redis:')) {
                cleanUrl = cleanUrl.replace('redis:', 'rediss:');
            }
        }
    }
    
    // Ensure we use rediss:// if needed for cloud providers like Upstash
    if (!cleanUrl.startsWith('rediss:') && cleanUrl.includes('upstash.io')) {
        cleanUrl = cleanUrl.replace('redis:', 'rediss:');
    }

    return cleanUrl;
};

const allowRedisInTest = process.env.REDIS_TEST_ENABLED === 'true';
if (process.env.NODE_ENV !== 'test' || allowRedisInTest) {
    if (process.env.NODE_ENV === 'test') {
        logger.info('Redis test mode enabled via REDIS_TEST_ENABLED');
    }
    
    const redisUrl = sanitizeRedisUrl(process.env.REDIS_URL);
    const isTls = redisUrl.startsWith('rediss:');
    
    redisClient = redis.createClient({
        url: redisUrl,
        socket: {
            tls: isTls ? {} : undefined,
            rejectUnauthorized: false 
        }
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