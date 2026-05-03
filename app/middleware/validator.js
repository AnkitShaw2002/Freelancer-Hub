const { body, validationResult } = require('express-validator');

/**
 * Validation rules for user registration
 */
const registerValidation = [
    body('firstName')
        .trim()
        .notEmpty().withMessage('First name is required'),
    
    body('lastName')
        .trim()
        .notEmpty().withMessage('Last name is required'),
    
    body('email')
        .trim()
        .isEmail().withMessage('Please enter a valid email')
        .normalizeEmail(),
    
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
        .withMessage('Password must contain uppercase, lowercase, a number and a special character'),
    
    body('role')
        .notEmpty().withMessage('User role is required')
        .isIn(['freelancer', 'client']).withMessage('Invalid role selected'),
        
    body('category')
        .optional({ checkFalsy: true })
];

/**
 * Validation rules for user login
 */
const loginValidation = [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').notEmpty().withMessage('Password is required')
];

/**
 * Validation rules for password reset
 */
const resetPasswordValidation = [
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
        .withMessage('Password must contain uppercase, lowercase, and a number')
];

/**
 * Validation rules for project creation
 */
const projectValidation = [
    body('title').trim().notEmpty().withMessage('Project title is required'),
    body('description').trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters'),
    body('budget_min').isNumeric().withMessage('Minimum budget must be a number'),
    body('budget_max').isNumeric().withMessage('Maximum budget must be a number'),
    body('deadline').notEmpty().withMessage('Deadline is required')
];

/**
 * Middleware to handle the validation result
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const firstError = errors.array()[0].msg;
        
        if (req.originalUrl.startsWith('/api/') || req.xhr) {
            return res.status(400).json({ 
                status: false, 
                message: firstError,
                errors: errors.array() 
            });
        }
        
        req.flash('error', firstError);
        
        // Robust redirect back with a fallback
        const backURL = req.header('Referer') || '/dashboard';
        return res.redirect(backURL);
    }
    next();
};

module.exports = {
    registerValidation,
    loginValidation,
    projectValidation,
    resetPasswordValidation,
    validate
};
