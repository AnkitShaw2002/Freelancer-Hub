const cloudinary = require('cloudinary').v2;
const logger = require('../utils/logger');

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    logger.info('Cloudinary Configured');
} else {
    logger.warn('Cloudinary configuration missing in .env');
}

module.exports = cloudinary;
