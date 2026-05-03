const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const { authLimiter } = require('../../middleware/rateLimiter');
const { checkAuth } = require('../../middleware/checkAuth');
const { registerValidation, loginValidation, resetPasswordValidation, validate } = require('../../middleware/validator');

router.get('/register-create', (req, res) => res.redirect('/register'));

router.post(
  '/register-create',
  registerValidation,
  validate,
  authController.postRegister
);

router.post('/verify-account/:token', authController.verifyAccount);

router.post(
  '/login-create', 
  authLimiter, 
  loginValidation, 
  validate, 
  authController.postLogin
);

router.get('/logout', checkAuth, authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', resetPasswordValidation, validate, authController.resetPassword);

module.exports = router;
