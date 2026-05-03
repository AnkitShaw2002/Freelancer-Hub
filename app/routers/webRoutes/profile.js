const express = require('express');
const router = express.Router();

const profileController = require('../../controllers/profileController');

const { checkAuth, optionalAuth } = require('../../middleware/checkAuth');
const uploadChecker = require('../../middleware/Uploadchecker');

router.get('/freelancers', optionalAuth, profileController.getFreelancers);
router.get('/profile/edit', checkAuth, profileController.getEditProfile);
router.post('/profile/edit', checkAuth, uploadChecker.single('avatar'), profileController.postEditProfile);
router.get('/profile', checkAuth, profileController.getProfile);
router.get('/profile/:id', optionalAuth, profileController.getProfile);

module.exports = router;
