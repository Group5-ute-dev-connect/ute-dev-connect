const express = require('express');
const router = express.Router();

// 1. Import middlewares
const { verifyToken, authorizeRole } = require('../middlewares/authMiddleware');
const { validateEditProfile } = require('../middlewares/validators/profileValidator');
const { profileLimiter } = require('../middlewares/rateLimiter');

// 2. Import controller
const profileController = require('../controllers/profileController');
const upload = require('../middlewares/uploadMiddleware');

// ==========================================
// CÁC ROUTE CỦA NHÓM (Từ nhánh develop)
// ==========================================

// @route   PUT /api/profile
// @desc    Tạo mới hoặc cập nhật thông tin hồ sơ (Edit Profile)
// @access  Private
// FIX LỖI: Đổi `authMiddleware` thành `verifyToken`
router.put('/profile', verifyToken, profileLimiter, validateEditProfile, profileController.editProfile);

// @route   PUT /api/profile/avatar
// @desc    Cập nhật ảnh đại diện của user (Cloudinary hoặc Local)
// @access  Private
router.put('/profile/avatar', verifyToken, upload.single('avatar'), profileController.updateAvatar);

// @route   DELETE /api/profile/avatar
// @desc    Xóa ảnh đại diện của user (quay về mặc định)
// @access  Private
router.delete('/profile/avatar', verifyToken, profileController.deleteAvatar);

// @route   GET /api/profile/me
// @desc    Lấy hồ sơ của người dùng hiện tại
// @access  Private
router.get('/profile/me', verifyToken, profileController.getCurrentProfile);

// @route   GET /api/profile
// @desc    Lấy tất cả hồ sơ người dùng
// @access  Public
router.get('/profile', profileController.getAllProfiles);

// @route   GET /api/profile/top-developers
// @desc    Lấy top 10 lập trình viên nổi bật
// @access  Public
router.get('/profile/top-developers', profileController.getTopDevelopers);

// @route   GET /api/profile/user/:user_id
// @desc    Lấy hồ sơ người dùng theo user ID
// @access  Public
router.get('/profile/user/:user_id', profileController.getProfileById);

// @route   PUT /api/profile/follow/:user_id
// @desc    Follow một người dùng
// @access  Private
router.put('/profile/follow/:user_id', verifyToken, profileController.followUser);

// @route   PUT /api/profile/unfollow/:user_id
// @desc    Unfollow một người dùng
// @access  Private
router.put('/profile/unfollow/:user_id', verifyToken, profileController.unfollowUser);

// @route   GET /api/profile/followers/:user_id
// @desc    Lấy danh sách người theo dõi
// @access  Public
router.get('/profile/followers/:user_id', profileController.getFollowers);

// @route   GET /api/profile/following/:user_id
// @desc    Lấy danh sách người đang theo dõi
// @access  Public
router.get('/profile/following/:user_id', profileController.getFollowing);


// ==========================================
// CÁC ROUTE PHÂN QUYỀN (Từ nhánh feature/login của bạn)
// ==========================================

// API Profile cho User
router.get('/user/profile', verifyToken, authorizeRole('user'), (req, res) => {
    res.json({ success: true, message: 'Chào mừng User', userId: req.user.id });
});

// API Profile cho Admin
router.get('/admin/profile', verifyToken, authorizeRole('admin'), (req, res) => {
    res.json({ success: true, message: 'Chào mừng Admin, đây là khu vực quản trị', adminId: req.user.id });
});

module.exports = router;
