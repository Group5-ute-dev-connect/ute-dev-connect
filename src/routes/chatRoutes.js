const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const chatController = require('../controllers/chatController');
const upload = require('../middlewares/uploadMiddleware');

// @route   GET /api/chat/conversations
// @desc    Lấy danh sách các phòng chat của user hiện tại
// @access  Private
router.get('/conversations', verifyToken, chatController.getConversations);

// @route   GET /api/chat/:conversationId/messages
// @desc    Lấy lịch sử tin nhắn của một phòng chat
// @access  Private
router.get('/:conversationId/messages', verifyToken, chatController.getMessages);

// @route   POST /api/chat/upload
// @desc    Upload file đính kèm trong chat
// @access  Private
router.post('/upload', verifyToken, upload.single('file'), chatController.uploadFile);

// @route   POST /api/chat/group
// @desc    Tạo phòng chat nhóm
// @access  Private
router.post('/group', verifyToken, chatController.createGroup);

// @route   POST /api/chat/:userId
// @desc    Tạo hoặc lấy phòng chat với một user khác
// @access  Private
router.post('/:userId', verifyToken, chatController.createOrGetConversation);

module.exports = router;
