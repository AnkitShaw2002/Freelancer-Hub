require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const flash = require('connect-flash');
const redisClient = require('./app/config/redis');
const passport = require('passport');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./app/config/swagger');

const errorHandler = require('./app/middleware/errorHandler');
const logger = require('./app/utils/logger');
const { optionalAuth } = require('./app/middleware/checkAuth');

const app = express();

// 2. SECURITY & UTILS
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simplicity with external CDNs, but can be configured
}));
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || '*',
    credentials: true
}));

// Global Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', globalLimiter);

// Logging
if (process.env.NODE_ENV !== 'test') {
    const logDirectory = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDirectory)) fs.mkdirSync(logDirectory);
    const accessLogStream = fs.createWriteStream(path.join(__dirname, 'logs', 'access.log'), { flags: 'a' });
    app.use(morgan('combined', { stream: accessLogStream }));
}

// 3. BODY PARSERS & COOKIES
app.use(cookieParser());
const paymentController = require('./app/controllers/paymentController');
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), paymentController.stripeWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 4. SESSION & REDIS
const sessionOptions = {
    secret: process.env.SESSION_SECRET || 'secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
};
if (redisClient) {
    sessionOptions.store = new RedisStore({ client: redisClient });
}
app.use(session(sessionOptions));

// 5. PASSPORT
require('./app/config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());

// 6. VIEW ENGINE & STATIC
app.set('view engine', 'ejs');
app.set('views', 'view');
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));

// 7. FLASH & LOCALS
app.use(flash());
app.use(optionalAuth);
app.use(async (req, res, next) => {
    res.locals.messages = {
        success: req.flash('success'),
        error: req.flash('error')
    };
    res.locals.currentUser = req.user || null;
    res.locals.unreadCount = req.user ? (req.user.notifications || []).filter(n => !n.isRead).length : 0;
    
    // Unread messages count
    res.locals.unreadMessagesCount = 0;
    if (req.user) {
        try {
            const Message = require('./app/models/Message');
            res.locals.unreadMessagesCount = await Message.countDocuments({ 
                receiverId: req.user._id, 
                isRead: false 
            });
        } catch (error) {
            console.error('Error counting unread messages:', error);
        }
    }
    next();
});

// 8. SWAGGER DOCUMENTATION
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// 10. ROUTES
// API Routes (Routers)
app.use('/api', require('./app/routers/apiRoutes/pageRouterApi'));
app.use('/api/auth', require('./app/routers/apiRoutes/authApi'));
app.use('/api/admin', require('./app/routers/apiRoutes/adminApi'));
app.use('/api/client', require('./app/routers/apiRoutes/clientApi'));
app.use('/api/freelancer', require('./app/routers/apiRoutes/freelancerApi'));
app.use('/api/messages', require('./app/routers/apiRoutes/messagesApi'));
app.use('/api/reviews', require('./app/routers/apiRoutes/reviewApi'));
app.use('/api', require('./app/routers/apiRoutes/profileApi'));
app.use('/api/projects', require('./app/routers/apiRoutes/projectsApi'));

// Web Routes (Routers)
app.use('/', require('./app/routers/webRoutes/pageRouter'));
app.use('/auth', require('./app/routers/webRoutes/authRouter'));
app.use('/admin', require('./app/routers/webRoutes/admin'));
app.use('/client', require('./app/routers/webRoutes/client'));
app.use('/freelancer', require('./app/routers/webRoutes/freelancer'));
app.use('/messages', require('./app/routers/webRoutes/messages'));
app.use('/reviews', require('./app/routers/webRoutes/reviews'));
app.use('/', require('./app/routers/webRoutes/profile'));
app.use('/projects', require('./app/routers/webRoutes/projects'));

// 11. ERROR HANDLING
app.get('/health', (req, res) => res.status(200).send('OK'));
app.use(errorHandler);

// 1. Handle 404 (Not Found)
app.use((req, res, next) => {
    res.status(404).render('errors/error404', {
        title: '404 - Page Not Found',
        // Pass user/messages if your layout depends on them
        user: req.user || null 
    });
});

// 2. Handle 500 (Internal Server Error)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('errors/error500', {
        title: '500 - Server Error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

app.use((err, req, res, next) => {
    const statusCode = err.status || 500;
    
    // Map status codes to friendly titles
    const errorTitles = {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Access Denied',
        404: 'Page Not Found',
        500: 'Internal Server Error'
    };

    res.status(statusCode).render('errors/status', {
        title: errorTitles[statusCode] || 'An Error Occurred',
        errorCode: statusCode,
        message: err.message || 'Something went wrong on our end.',
        user: req.user || null
    });
});

module.exports = app;