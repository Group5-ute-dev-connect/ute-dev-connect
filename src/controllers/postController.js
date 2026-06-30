const { validationResult } = require('express-validator');
const postService = require('../services/postService');
const notificationService = require('../services/notificationService');
const { uploadToCloudinary } = require('../utils/cloudinary');
const fs = require('fs');

const getUserId = (req) => {
  return req.user?.id || req.user?._id || req.user?.userId;
};

// Helper to extract hashtags from text
const extractHashtags = (text) => {
  if (!text) return [];
  const regex = /#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g; // Support Vietnamese unicode
  const matches = text.match(regex) || [];
  // Remove # and lowercase, then remove duplicates
  const tags = [...new Set(matches.map(tag => tag.slice(1).toLowerCase()))];
  return tags;
};

const addPost = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Xóa file nếu validation thất bại
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Lỗi dữ liệu đầu vào',
      errors: errors.array(),
    });
  }

  try {
    const userId = getUserId(req);

    if (!userId) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Không xác định được người dùng từ token',
      });
    }

    // Xử lý upload media
    const media = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileType = file.mimetype.startsWith('video') ? 'video' : 'image';
          const cloudinaryUrl = await uploadToCloudinary(file.path, 'posts');
          if (cloudinaryUrl) {
            media.push({ url: cloudinaryUrl, type: fileType });
          } else {
            // Fallback
            media.push({ 
              url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`, 
              type: fileType 
            });
          }
        } catch (uploadErr) {
          console.error('Lỗi khi tải file media:', uploadErr);
        }
      }
    }

    // Extract tags
    const tags = extractHashtags(req.body.text);
    // Có thể user gửi kèm tags thủ công trong req.body.tags
    let manualTags = [];
    if (req.body.tags) {
      try {
        manualTags = typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags;
      } catch (e) {
        manualTags = typeof req.body.tags === 'string' ? req.body.tags.split(',').map(t => t.trim()) : [];
      }
    }
    const finalTags = [...new Set([...tags, ...manualTags])];

    const post = await postService.createPost(
      userId, 
      req.body.text, 
      req.body.isQuestion === 'true' || req.body.isQuestion === true, 
      req.body.groupId || null, 
      req.body.codeSnippet || '', 
      req.body.codeLanguage || 'javascript',
      req.body.visibility || 'public',
      media,
      finalTags
    );

    res.status(201).json({
      success: true,
      data: post,
    });
  } catch (err) {
    console.error(err.message);
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
    }

    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};

const getPost = async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const post = await postService.getPostById(req.params.id, getUserId(req), clientIp);

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (err) {
    console.error(err.message);

    if (err.statusCode === 404 || err.statusCode === 400) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};

// @desc    Lấy tất cả bài viết
const getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const filter = req.query.filter || 'latest';
    const timeframe = req.query.timeframe || '7d';

    const result = await postService.getAllPosts(page, limit, getUserId(req), filter, timeframe);

    res.status(200).json({
      success: true,
      data: result.posts,
      hasMore: result.hasMore,
      total: result.total,
      page,
      limit,
      filter,
      timeframe,
    });
  } catch (err) {
    console.error(err.message);

    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};

// @desc    Lấy bài viết của người dùng
const getUserPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const targetUserId = req.params.userId;

    const result = await postService.getUserPosts(targetUserId, page, limit, getUserId(req));

    res.status(200).json({
      success: true,
      data: result.posts,
      hasMore: result.hasMore,
      total: result.total,
      page,
      limit,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};


// @desc    Lấy top 10 bài viết nổi bật
const getTopTrendingPosts = async (req, res) => {
  try {
    const posts = await postService.getTopTrendingPosts(getUserId(req));

    res.status(200).json({
      success: true,
      data: posts,
    });
  } catch (err) {
    console.error(err.message);

    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};

// @desc    Lưu / Bỏ lưu bài viết
const savePost = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không xác định được người dùng từ token',
      });
    }

    const result = await postService.toggleSavePost(userId, req.params.id);

    res.status(200).json({
      success: true,
      message: result.isSaved ? 'Đã lưu bài viết' : 'Đã bỏ lưu bài viết',
      data: result,
    });
  } catch (err) {
    console.error(err.message);

    if (err.statusCode === 404 || err.statusCode === 400) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};

// @desc    Lấy danh sách bài viết đã lưu
const getSavedPosts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không xác định được người dùng từ token',
      });
    }

    const result = await postService.getSavedPosts(userId, page, limit);

    res.status(200).json({
      success: true,
      data: result.posts,
      hasMore: result.hasMore,
      total: result.total,
      page,
      limit,
    });
  } catch (err) {
    console.error(err.message);

    if (err.statusCode === 404 || err.statusCode === 400) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};

// @desc    Like / Unlike bài viết
const likePost = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không xác định được người dùng từ token',
      });
    }

    const result = await postService.toggleLikePost(req.params.id, userId);

    // Chỉ tạo thông báo khi Like, không tạo khi Unlike
    if (
      result.liked &&
      result.postOwnerId &&
      result.postOwnerId.toString() !== userId.toString()
    ) {
      await notificationService.createNotification(
        result.postOwnerId,
        userId,
        'like',
        req.params.id
      );
    }

    res.status(200).json({
      success: true,
      message: result.liked ? 'Đã thích bài viết' : 'Đã hủy thích bài viết',
      liked: result.liked,
      likesCount: result.likesCount,
      likes: result.likes,
      data: result.likes,
    });
  } catch (err) {
    console.error(err.message);

    if (err.statusCode === 404 || err.statusCode === 400) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};

// @desc    Thêm bình luận
const addComment = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Lỗi dữ liệu đầu vào',
      errors: errors.array(),
    });
  }

  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không xác định được người dùng từ token',
      });
    }

    const result = await postService.addComment(
      req.params.id,
      userId,
      req.body.text,
      req.body.codeSnippet,
      req.body.codeLanguage
    );

    // Tạo thông báo khi comment mới
    if (
      result.postOwnerId &&
      result.postOwnerId.toString() !== userId.toString()
    ) {
      await notificationService.createNotification(
        result.postOwnerId,
        userId,
        'comment',
        req.params.id
      );
    }

    res.status(201).json({
      success: true,
      message: 'Thêm bình luận thành công',
      comments: result.comments,
      data: result.comments,
    });
  } catch (err) {
    console.error(err.message);

    if (err.statusCode === 404 || err.statusCode === 400) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};

// @desc    Thêm phản hồi (reply) cho một bình luận
const addReply = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Lỗi dữ liệu đầu vào',
      errors: errors.array(),
    });
  }

  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không xác định được người dùng từ token',
      });
    }

    const result = await postService.addReply(
      req.params.id,
      req.params.comment_id,
      userId,
      req.body.text
    );

    // Có thể thêm tính năng thông báo cho người được phản hồi ở đây

    res.status(201).json({
      success: true,
      message: 'Thêm phản hồi thành công',
      data: result.comments,
    });
  } catch (err) {
    console.error(err.message);

    if (err.statusCode === 404 || err.statusCode === 400) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi Server',
    });
  }
};

// @desc    Cập nhật bài viết
const updatePost = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Lỗi dữ liệu đầu vào',
      errors: errors.array(),
    });
  }

  try {
    const userId = getUserId(req);
    if (!userId) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      }
      return res.status(401).json({ success: false, message: 'Không xác định được người dùng từ token' });
    }

    // Xử lý upload media mới
    let media = [];
    // Nếu có mảng media cũ truyền lên (những media người dùng giữ lại)
    if (req.body.existingMedia) {
      try {
        const existingMedia = typeof req.body.existingMedia === 'string' ? JSON.parse(req.body.existingMedia) : req.body.existingMedia;
        media = [...existingMedia];
      } catch (e) {
        console.error('Lỗi parse existingMedia', e);
      }
    }

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileType = file.mimetype.startsWith('video') ? 'video' : 'image';
          const cloudinaryUrl = await uploadToCloudinary(file.path, 'posts');
          if (cloudinaryUrl) {
            media.push({ url: cloudinaryUrl, type: fileType });
          } else {
            media.push({ 
              url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`, 
              type: fileType 
            });
          }
        } catch (uploadErr) {
          console.error('Lỗi khi tải file media:', uploadErr);
        }
      }
    }

    // Extract tags
    let tags = [];
    if (req.body.text !== undefined) {
      tags = extractHashtags(req.body.text);
    }
    let manualTags = [];
    if (req.body.tags) {
      try {
        manualTags = typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags;
      } catch (e) {
        manualTags = typeof req.body.tags === 'string' ? req.body.tags.split(',').map(t => t.trim()) : [];
      }
    }
    const finalTags = [...new Set([...tags, ...manualTags])];

    const post = await postService.updatePost(
      req.params.id, 
      userId, 
      req.body.text, 
      req.body.isQuestion === 'true' || req.body.isQuestion === true,
      req.body.codeSnippet,
      req.body.codeLanguage,
      req.body.visibility,
      media,
      finalTags
    );

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (err) {
    console.error(err.message);
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
    }
    if (err.statusCode === 404 || err.statusCode === 400 || err.statusCode === 401) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Xóa bài viết
const deletePost = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Không xác định được người dùng từ token' });
    }

    const result = await postService.deletePost(req.params.id, userId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode === 404 || err.statusCode === 400 || err.statusCode === 401) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Sửa bình luận
const updateComment = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Lỗi dữ liệu đầu vào', errors: errors.array() });
  }

  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const comments = await postService.updateComment(req.params.id, req.params.comment_id, userId, req.body.text);

    res.status(200).json({
      success: true,
      message: 'Sửa bình luận thành công',
      data: comments,
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Xóa bình luận
const deleteComment = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const comments = await postService.deleteComment(req.params.id, req.params.comment_id, userId);

    res.status(200).json({
      success: true,
      message: 'Xóa bình luận thành công',
      data: comments,
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Chấp nhận câu trả lời
const acceptAnswer = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const data = await postService.acceptAnswer(req.params.id, req.params.comment_id, userId);

    res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái câu trả lời thành công',
      data: data.comments,
      post: data.post
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Phê duyệt bình luận (Upvote / Approve Comment)
const approveComment = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const comments = await postService.approveComment(req.params.id, req.params.comment_id, userId);

    res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái phê duyệt bình luận thành công',
      data: comments,
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Phản đối bình luận (Downvote / Disapprove Comment)
const disapproveComment = async (req, res) => {
  console.log(`[disapproveComment] Yêu cầu nhận được. Post ID: ${req.params.id}, Comment ID: ${req.params.comment_id}`);
  try {
    const userId = getUserId(req);
    console.log(`[disapproveComment] User ID phân tích từ token: ${userId}`);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const comments = await postService.disapproveComment(req.params.id, req.params.comment_id, userId);
    console.log(`[disapproveComment] Xử lý thành công, trả về số lượng bình luận: ${comments?.length}`);

    res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái phản đối bình luận thành công',
      data: comments,
    });
  } catch (err) {
    console.error(`[disapproveComment] Lỗi xảy ra:`, err);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Ẩn / Hiện bài viết
const hidePost = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Không xác định được người dùng từ token' });
    }
    const post = await postService.toggleHidePost(req.params.id, userId);
    res.status(200).json({
      success: true,
      message: post.isHidden ? 'Đã ẩn bài viết' : 'Đã hiện bài viết',
      data: post,
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode === 404 || err.statusCode === 400 || err.statusCode === 401) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Lấy danh sách bài viết đã ẩn
const getHiddenPosts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không xác định được người dùng từ token',
      });
    }

    const result = await postService.getHiddenPosts(userId, page, limit);

    res.status(200).json({
      success: true,
      data: result.posts,
      hasMore: result.hasMore,
      total: result.total,
      page,
      limit,
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

module.exports = {
  addPost,
  getPost,
  getAllPosts,
  getTopTrendingPosts,
  savePost,
  getSavedPosts,
  likePost,
  addComment,
  updatePost,
  deletePost,
  hidePost,
  getHiddenPosts,
  getUserPosts,
  updateComment,
  deleteComment,
  acceptAnswer,
  approveComment,
  disapproveComment,
  addReply,
};