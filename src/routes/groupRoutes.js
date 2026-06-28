const express = require('express');
const router = express.Router();
const { check } = require('express-validator');

const { verifyToken, optionalToken } = require('../middlewares/authMiddleware');
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

    // Kiểm tra xem là thành viên, admin hoặc mod của nhóm
    const isMember = group.members.some(
      (m) => m.user && m.user.toString() === userId.toString()
    );
    const isAdmin = group.admin && group.admin.toString() === userId.toString();
    const isMod = group.moderators && group.moderators.some(
      (m) => m.toString() === userId.toString()
    );

    if (!isMember && !isAdmin && !isMod) {
      return res.status(403).json({
        success: false,
        message: 'Bạn cần là thành viên của nhóm để thực hiện hành động này',
      });
    }

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
    [check('name', 'Tên nhóm không được để trống').trim().not().isEmpty()],
  ],
  groupController.createGroup
);

// @route   GET /api/groups/:id
// @desc    Lấy chi tiết nhóm theo ID
// @access  Public (nhưng trả thêm isMember nếu đã đăng nhập)
router.get('/:id', optionalToken, groupController.getGroupById);

// @route   PUT /api/groups/:id/join
// @desc    Tham gia nhóm
// @access  Private
router.put('/:id/join', verifyToken, groupController.joinGroup);
router.get('/:id/join-requests', verifyToken, groupController.getJoinRequests);
router.put('/:id/join-requests/:userId/approve', verifyToken, groupController.approveJoinRequest);
router.put('/:id/join-requests/:userId/reject', verifyToken, groupController.rejectJoinRequest);

// @route   PUT /api/groups/:id/leave
// @desc    Rời nhóm
// @access  Private
router.put('/:id/leave', verifyToken, groupController.leaveGroup);
router.put('/:id/transfer-admin', verifyToken, groupController.transferAdmin);

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
    [check('text', 'Nội dung không được để trống').trim().not().isEmpty()],
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

// @route   PUT /api/groups/:id/moderator
// @desc    Thăng chức / hạ chức Moderator (chỉ Admin nhóm)
// @access  Private
router.put('/:id/moderator', verifyToken, groupController.toggleModerator);

// @route   GET /api/groups/:id/pending-posts
// @desc    Lấy bài đăng chờ duyệt (chỉ Admin / Mod nhóm)
// @access  Private
router.get('/:id/pending-posts', verifyToken, groupController.getPendingPosts);

// @route   PUT /api/groups/:id/posts/:postId/status
// @desc    Duyệt / Từ chối bài đăng (chỉ Admin / Mod nhóm)
// @access  Private
router.put('/:id/posts/:postId/status', verifyToken, groupController.updatePostStatus);

// @route   GET /api/groups/:id/filters
// @desc    Lấy danh sách từ cấm của nhóm (chỉ Admin / Mod nhóm)
// @access  Private
router.get('/:id/filters', verifyToken, groupController.getGroupFilters);

// @route   POST /api/groups/:id/filters
// @desc    Thêm từ cấm vào nhóm (chỉ Admin / Mod nhóm)
// @access  Private
router.post('/:id/filters', verifyToken, groupController.addGroupFilter);

// @route   DELETE /api/groups/:id/filters/:word
// @desc    Xóa từ cấm khỏi nhóm (chỉ Admin / Mod nhóm)
// @access  Private
router.delete('/:id/filters/:word', verifyToken, groupController.deleteGroupFilter);

// @route   DELETE /api/groups/:id/members/:userId
// @desc    Xóa thành viên khỏi nhóm (chỉ Admin nhóm)
// @access  Private
router.delete('/:id/members/:userId', verifyToken, groupController.kickMember);

module.exports = router;
