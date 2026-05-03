require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./app/config/db');
const { initSocket } = require('./app/utils/socket');
const logger = require('./app/utils/logger');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

connectDB().then(() => {
    initSocket(server);
    server.listen(PORT, () => {
        logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
        console.log(`🚀 Freelancer Hub active at http://localhost:${PORT}`);
    });
}).catch((error) => {
    logger.error('Startup error', error);
    process.exit(1);
});

module.exports = server;
