const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, authorizeRole } = require('../middlewares/authMiddleware');

// Thống kê chung
router.get('/stats', verifyToken, authorizeRole('admin'), adminController.getStats);

// Quản lý người dùng
router.get('/users', verifyToken, authorizeRole('admin'), adminController.getUsers);
router.delete('/users/:id', verifyToken, authorizeRole('admin'), adminController.deleteUser);

// Quản lý bài viết
router.get('/posts', verifyToken, authorizeRole('admin'), adminController.getPosts);
router.delete('/posts/:id', verifyToken, authorizeRole('admin'), adminController.deletePost);

module.exports = router;
