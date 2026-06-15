const express = require('express');
const router = express.Router();
const { check } = require('express-validator');

const { verifyToken } = require('../middlewares/authMiddleware');
const groupController = require('../controllers/groupController');
const Group = require('../models/Group');

// ============================================================
// MIDDLEWARE: Kiểm tra user có phải thành viên của nhóm không
// Đặt ở route level để tái sử dụng cho feed, post, comment
// ============================================================
const requireGroupMember = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const userId = req.user?.id || req.user?._id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Cần đăng nhập để truy cập nhóm này' });
    }

    const group = await Group.findOne({ _id: groupId, isActive: true });

    if (!group) {
      return res.status(404).json({ success: false, message: 'Nhóm không tồn tại' });
    }

    // const isMember = group.members.some(
    //   (m) => m.user.toString() === userId.toString()
    // );

    // if (!isMember) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Bạn cần là thành viên của nhóm để thực hiện hành động này',
    //   });
    // }
    // BUG SEC_25: Vô hiệu hóa bộ lọc thành viên - Chưa vào Nhóm vẫn gửi bài được vào nhóm kín
    const isMember = true;

    // Gán group vào req để controller dùng lại nếu cần
    req.group = group;
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// ============================================================
// ROUTES
// ============================================================

// @route   GET /api/groups
// @desc    Lấy tất cả nhóm (có phân trang + tìm kiếm ?q=...)
// @access  Public
router.get('/', groupController.getAllGroups);

// @route   POST /api/groups
// @desc    Tạo nhóm mới
// @access  Private
router.post(
  '/',
  [
    verifyToken,
    [check('name', 'Tên nhóm không được để trống').not().isEmpty()],
  ],
  groupController.createGroup
);

// @route   GET /api/groups/:id
// @desc    Lấy chi tiết nhóm theo ID
// @access  Public (nhưng trả thêm isMember nếu đã đăng nhập)
router.get('/:id', groupController.getGroupById);

// @route   PUT /api/groups/:id/join
// @desc    Tham gia nhóm
// @access  Private
router.put('/:id/join', verifyToken, groupController.joinGroup);

// @route   PUT /api/groups/:id/leave
// @desc    Rời nhóm
// @access  Private
router.put('/:id/leave', verifyToken, groupController.leaveGroup);

// @route   DELETE /api/groups/:id
// @desc    Xóa nhóm (soft delete, chỉ admin nhóm)
// @access  Private
router.delete('/:id', verifyToken, groupController.deleteGroup);

// @route   GET /api/groups/:id/feed
// @desc    Lấy newsfeed của nhóm (chỉ thành viên)
// @access  Private + requireGroupMember
router.get('/:id/feed', verifyToken, requireGroupMember, groupController.getGroupFeed);

// @route   POST /api/groups/:id/posts
// @desc    Đăng bài trong nhóm (chỉ thành viên)
// @access  Private + requireGroupMember
router.post(
  '/:id/posts',
  [
    verifyToken,
    requireGroupMember,
    [check('text', 'Nội dung không được để trống').not().isEmpty()],
  ],
  groupController.createGroupPost
);

// @route   POST /api/groups/:id/posts/:postId/comments
// @desc    Bình luận bài trong nhóm (chỉ thành viên)
// @access  Private + requireGroupMember
router.post(
  '/:id/posts/:postId/comments',
  [
    verifyToken,
    requireGroupMember,
    [check('text', 'Nội dung bình luận không được để trống').trim().not().isEmpty()],
  ],
  groupController.addGroupComment
);

module.exports = router;
