const { validationResult } = require('express-validator');

const validateRequest = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        const firstError = errors.array()[0].msg;
        return res.status(400).json({
            status: false,
            message: firstError,
            errors: errors.array()
        });
    };
};

module.exports = validateRequest;
