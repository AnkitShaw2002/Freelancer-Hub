const express = require('express');
const router = express.Router();
const profileApiController = require('../../webservices/profileApiController');

const { checkAuth, optionalAuth } = require('../../middleware/checkAuth');
const uploadChecker = require('../../middleware/Uploadchecker');

router.get('/freelancers', optionalAuth, profileApiController.getFreelancers);
router.get('/profile/edit', checkAuth, profileApiController.getEditProfile);
router.post('/profile/edit', checkAuth, uploadChecker.single('avatar'), profileApiController.postEditProfile);
router.get('/profile', checkAuth, profileApiController.getProfile);
router.get('/profile/:id', optionalAuth, profileApiController.getProfile);

module.exports = router;
