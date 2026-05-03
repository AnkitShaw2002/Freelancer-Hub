const express = require('express');
const router = express.Router();
const authApiController = require('../../webservices/authApiController');
const { authLimiter } = require('../../middleware/rateLimiter');
const { checkAuth } = require('../../middleware/checkAuth');
const { registerValidation, loginValidation, resetPasswordValidation, validate } = require('../../middleware/validator');

router.get('/register-create', (req, res) => res.redirect('/register'));

router.post(
  '/register-create',
  registerValidation,
  validate,
  authApiController.postRegister
);

router.post('/verify-account/:token', authApiController.verifyAccount);

router.post(
  '/login-create', 
  authLimiter, 
  loginValidation, 
  validate, 
  authApiController.postLogin
);

router.get('/logout', checkAuth, authApiController.logout);
router.post('/forgot-password', authApiController.forgotPassword);
router.post('/reset-password/:token', resetPasswordValidation, validate, authApiController.resetPassword);

module.exports = router;
