const express = require('express');
const router = express.Router();
const { check } = require('express-validator');

const { verifyToken, optionalToken } = require('../middlewares/authMiddleware');
const postController = require('../controllers/postController');

// @route   GET /api/posts
// @desc    Lấy tất cả bài viết
// @access  Public
router.get('/', optionalToken, postController.getAllPosts);

// @route   POST /api/posts
// @desc    Tạo bài viết mới
// @access  Private
router.post(
  '/',
  [
    verifyToken,
    [
      check('text', 'Nội dung không được để trống').trim().not().isEmpty(),
    ],
  ],
  postController.addPost
);

// @route   GET /api/posts/top-trending
// @desc    Lấy top 10 bài viết nổi bật
// @access  Public
router.get('/top-trending', optionalToken, postController.getTopTrendingPosts);

// Đặt các route cụ thể trước /:id để tránh bị hiểu nhầm là id bài viết

// @route   PUT /api/posts/save/:id
// @desc    Lưu hoặc bỏ lưu bài viết
// @access  Private
router.put('/save/:id', verifyToken, postController.savePost);

// @route   GET /api/posts/saved
// @desc    Lấy danh sách bài viết đã lưu
// @access  Private
router.get('/saved', verifyToken, postController.getSavedPosts);

// @route   GET /api/posts/hidden
// @desc    Lấy danh sách bài viết đã ẩn
// @access  Private
router.get('/hidden', verifyToken, postController.getHiddenPosts);

// @route   PUT /api/posts/hide/:id
// @desc    Ẩn / Hiện bài viết
// @access  Private
router.put('/hide/:id', verifyToken, postController.hidePost);

// @route   PUT /api/posts/like/:id
// @desc    Like / Unlike bài viết
// @access  Private
router.put('/like/:id', verifyToken, postController.likePost);

// @route   POST /api/posts/comment/:id
// @desc    Thêm bình luận vào bài viết
// @access  Private
router.post(
  '/comment/:id',
  [
    verifyToken,
    [
      check('text', 'Nội dung bình luận không được để trống')
        .trim()
        .not()
        .isEmpty(),
    ],
  ],
  postController.addComment
);

// @route   PUT /api/posts/accept/:id/:comment_id
// @desc    Chấp nhận câu trả lời
// @access  Private
router.put('/accept/:id/:comment_id', verifyToken, postController.acceptAnswer);

// @route   PUT /api/posts/comment/:id/:comment_id/approve
// @desc    Phê duyệt bình luận (Upvote)
// @access  Private
router.put('/comment/:id/:comment_id/approve', verifyToken, postController.approveComment);

// @route   PUT /api/posts/comment/:id/:comment_id/disapprove
// @desc    Phản đối bình luận (Downvote)
// @access  Private
router.put('/comment/:id/:comment_id/disapprove', verifyToken, postController.disapproveComment);

// @route   PUT /api/posts/comment/:id/:comment_id
// @desc    Sửa bình luận
// @access  Private
router.put(
  '/comment/:id/:comment_id',
  [
    verifyToken,
    [
      check('text', 'Nội dung bình luận không được để trống')
        .trim()
        .not()
        .isEmpty(),
    ],
  ],
  postController.updateComment
);

// @route   DELETE /api/posts/comment/:id/:comment_id
// @desc    Xóa bình luận
// @access  Private
router.delete('/comment/:id/:comment_id', verifyToken, postController.deleteComment);

// @route   PUT /api/posts/:id
// @desc    Sửa bài viết
// @access  Private
router.put(
  '/:id',
  [
    verifyToken,
    [
      check('text', 'Nội dung không được để trống').trim().not().isEmpty(),
    ],
  ],
  postController.updatePost
);

// @route   DELETE /api/posts/:id
// @desc    Xóa bài viết
// @access  Private
router.delete('/:id', verifyToken, postController.deletePost);

// @route   GET /api/posts/:id
// @desc    Lấy bài viết theo ID
// @access  Public
router.get('/:id', optionalToken, postController.getPost);

// @route   GET /api/posts/user/:userId
// @desc    Lấy bài viết của người dùng
// @access  Public
router.get('/user/:userId', optionalToken, postController.getUserPosts);

module.exports = router;