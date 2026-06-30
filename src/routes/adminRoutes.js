const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');
const adminController = require('../controllers/adminController');

// Route lấy thống kê hệ thống (Chỉ dành cho Admin tổng)
router.get('/stats', [verifyToken, verifyAdmin], adminController.getSystemStats);

// Route lấy nhật ký hoạt động hệ thống (Chỉ dành cho Admin tổng)
router.get('/logs', [verifyToken, verifyAdmin], adminController.getSystemLogs);

module.exports = router;
