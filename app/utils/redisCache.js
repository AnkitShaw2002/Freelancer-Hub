const redisClient = require('../config/redis');
const logger = require('../utils/logger');

const isEnabled = Boolean(redisClient);

async function getCache(key) {
    if (!isEnabled) return null;
    try {
        const value = await redisClient.get(key);
        if (!value) return null;
        return JSON.parse(value);
    } catch (err) {
        logger.error(`Redis getCache failed for key ${key}: ${err.message}`);
        return null;
    }
}

async function setCache(key, value, ttlSeconds = 120) {
    if (!isEnabled) return;
    try {
        await redisClient.set(key, JSON.stringify(value), {
            EX: ttlSeconds
        });
    } catch (err) {
        logger.error(`Redis setCache failed for key ${key}: ${err.message}`);
    }
}

async function delCache(key) {
    if (!isEnabled) return;
    try {
        await redisClient.del(key);
    } catch (err) {
        logger.error(`Redis delCache failed for key ${key}: ${err.message}`);
    }
}

module.exports = {
    getCache,
    setCache,
    delCache,
    isEnabled
};
