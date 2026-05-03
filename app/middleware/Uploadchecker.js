const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

const FILE_TYPE_MAP = {
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg',
    'image/webp': 'webp'
};

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (FILE_TYPE_MAP[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (png, jpg, jpeg, webp) are allowed'), false);
    }
};

const uploadChecker = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter
});

const uploadToCloudinary = (buffer, folder = 'freelancer_hub') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        const readable = new Readable();
        readable.push(buffer);
        readable.push(null);
        readable.pipe(uploadStream);
    });
};

module.exports = uploadChecker;
module.exports.uploadToCloudinary = uploadToCloudinary;