const { validationResult } = require('express-validator');
const groupService = require('../services/groupService');
const postService = require('../services/postService');

// Helper lấy userId từ token (nhất quán với codebase hiện tại)
const getUserId = (req) => {
  return req.user?.id || req.user?._id || req.user?.userId;
};

// @desc    Tạo nhóm mới
// @access  Private
const createGroup = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Lỗi dữ liệu đầu vào', errors: errors.array() });
  }

  try {
    const userId = getUserId(req);
    const { name, description, tags } = req.body;

    const group = await groupService.createGroup(userId, { name, description, tags });

    res.status(201).json({ success: true, message: 'Tạo nhóm thành công', data: group });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Lấy tất cả nhóm (có phân trang + tìm kiếm)
// @access  Public
const getAllGroups = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const keyword = req.query.q || '';

    const result = await groupService.getAllGroups(page, limit, keyword);

    res.status(200).json({
      success: true,
      data: result.groups,
      total: result.total,
      hasMore: result.hasMore,
      page,
      limit,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Lấy chi tiết nhóm theo ID
// @access  Public
const getGroupById = async (req, res) => {
  try {
    // userId có thể không có nếu chưa đăng nhập (public route)
    const userId = req.user ? getUserId(req) : null;
    const group = await groupService.getGroupById(req.params.id, userId);

    res.status(200).json({ success: true, data: group });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Tham gia nhóm
// @access  Private
const joinGroup = async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await groupService.joinGroup(req.params.id, userId);

    res.status(200).json({
      success: true,
      message: result.message,
      status: result.status,
      membersCount: result.membersCount
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Rời nhóm
// @access  Private
const leaveGroup = async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await groupService.leaveGroup(req.params.id, userId);

    res.status(200).json({ success: true, message: result.message, membersCount: result.membersCount });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Xóa nhóm (soft delete, chỉ admin nhóm)
// @access  Private
const deleteGroup = async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await groupService.deleteGroup(req.params.id, userId);

    res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Lấy newsfeed của nhóm (chỉ thành viên)
// @access  Private (middleware requireGroupMember sẽ xử lý trước)
const getGroupFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const userId = getUserId(req);

    const result = await groupService.getGroupFeed(req.params.id, userId, page, limit);

    res.status(200).json({
      success: true,
      data: result.posts,
      total: result.total,
      hasMore: result.hasMore,
      page,
      limit,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Đăng bài trong nhóm (chỉ thành viên)
// @access  Private (middleware requireGroupMember sẽ xử lý trước)
const createGroupPost = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Lỗi dữ liệu đầu vào', errors: errors.array() });
  }

  try {
    const userId = getUserId(req);
    const groupId = req.params.id;

    const post = await postService.createPost(
      userId,
      req.body.text,
      req.body.isQuestion || false,
      groupId,
      req.body.codeSnippet || '',
      req.body.codeLanguage || 'javascript'
    );

    res.status(201).json({ success: true, message: 'Đăng bài trong nhóm thành công', data: post });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Bình luận bài trong nhóm (chỉ thành viên)
// @access  Private (middleware requireGroupMember sẽ xử lý trước)
const addGroupComment = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Lỗi dữ liệu đầu vào', errors: errors.array() });
  }

  try {
    const userId = getUserId(req);
    const result = await postService.addComment(
      req.params.postId,
      userId,
      req.body.text,
      req.body.codeSnippet || '',
      req.body.codeLanguage || 'javascript'
    );

    res.status(201).json({ success: true, message: 'Bình luận thành công', data: result.comments });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Lấy danh sách yêu cầu tham gia nhóm
// @access  Private
const getJoinRequests = async (req, res) => {
  try {
    const userId = getUserId(req);
    const requests = await groupService.getJoinRequests(req.params.id, userId);

    res.status(200).json({
      success: true,
      data: requests
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

const approveJoinRequest = async (req, res) => {
  try {
    const managerId = getUserId(req);
    const result = await groupService.approveJoinRequest(req.params.id, managerId, req.params.userId);

    res.status(200).json({
      success: true,
      message: result.message,
      membersCount: result.membersCount
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

const rejectJoinRequest = async (req, res) => {
  try {
    const managerId = getUserId(req);
    const result = await groupService.rejectJoinRequest(req.params.id, managerId, req.params.userId);

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

const transferAdmin = async (req, res) => {
  try {
    const currentAdminId = getUserId(req);
    const { newAdminId } = req.body;
    const group = await groupService.transferAdmin(req.params.id, currentAdminId, newAdminId);

    res.status(200).json({
      success: true,
      message: 'Chuyển quyền admin nhóm thành công',
      data: group
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Thăng chức / hạ chức Moderator (kiểm duyệt viên)
// @access  Private
const toggleModerator = async (req, res) => {
  try {
    const adminId = getUserId(req);
    const groupId = req.params.id;
    const { userId } = req.body;

    const result = await groupService.toggleModerator(groupId, adminId, userId);

    res.status(200).json({
      success: true,
      message: result.action === 'promote' ? 'Đã thăng chức kiểm duyệt viên thành công' : 'Đã hạ chức kiểm duyệt viên thành công',
      data: result.group
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Lấy danh sách bài viết chờ duyệt (chỉ admin / mod)
// @access  Private
const getPendingPosts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const groupId = req.params.id;

    const posts = await groupService.getPendingPosts(groupId, userId);

    res.status(200).json({
      success: true,
      data: posts
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Phê duyệt hoặc từ chối bài viết (chỉ admin / mod)
// @access  Private
const updatePostStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id, postId } = req.params;
    const { status } = req.body;

    const result = await groupService.updatePostStatus(id, postId, userId, status);

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Lấy bộ lọc từ cấm của nhóm
// @access  Private
const getGroupFilters = async (req, res) => {
  try {
    const userId = getUserId(req);
    const groupId = req.params.id;
    const filters = await groupService.getGroupFilters(groupId, userId);
    res.status(200).json({ success: true, data: filters });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Thêm từ cấm vào bộ lọc của nhóm
// @access  Private
const addGroupFilter = async (req, res) => {
  try {
    const userId = getUserId(req);
    const groupId = req.params.id;
    const { word } = req.body;
    const filters = await groupService.addGroupFilter(groupId, userId, word);
    res.status(200).json({ success: true, message: 'Thêm từ cấm thành công', data: filters });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// @desc    Xóa từ cấm khỏi bộ lọc của nhóm
// @access  Private
const deleteGroupFilter = async (req, res) => {
  try {
    const userId = getUserId(req);
    const groupId = req.params.id;
    const { word } = req.params;
    const filters = await groupService.deleteGroupFilter(groupId, userId, word);
    res.status(200).json({ success: true, message: 'Xóa từ cấm thành công', data: filters });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

module.exports = {
  createGroup,
  getAllGroups,
  getGroupById,
  joinGroup,
  leaveGroup,
  deleteGroup,
  getGroupFeed,
  createGroupPost,
  addGroupComment,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  transferAdmin,
  toggleModerator,
  getPendingPosts,
  updatePostStatus,
  getGroupFilters,
  addGroupFilter,
  deleteGroupFilter,
};
