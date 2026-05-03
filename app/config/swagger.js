const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Freelancer Hub API',
            version: '1.0.0',
            description: 'API documentation for Freelancer Hub platform',
        },
        servers: [
            {
                url: process.env.BASE_URL || 'http://localhost:3000',
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
    apis: ['./app/webroutes/*.js'], // Path to the API routes
};

const specs = swaggerJsdoc(options);

module.exports = specs;
