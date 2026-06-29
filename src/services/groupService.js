const Group = require('../models/Group');
const Post = require('../models/Post');
const User = require('../models/User');
const logService = require('./logService');

const toIdString = (value) => {
  if (!value) {
    return '';
  }

  if (value._id) {
    return value._id.toString();
  }

  return value.toString();
};

const ensureJoinRequests = (group) => {
  if (!Array.isArray(group.joinRequests)) {
    group.joinRequests = [];
  }

  return group.joinRequests;
};

const isGroupAdmin = (group, userId) => {
  return toIdString(group.admin) === toIdString(userId);
};

const isGroupModerator = (group, userId) => {
  return Array.isArray(group.moderators) && group.moderators.some(
    (moderator) => toIdString(moderator) === toIdString(userId)
  );
};

const canManageGroup = (group, userId) => {
  return isGroupAdmin(group, userId) || isGroupModerator(group, userId);
};

const getActiveGroupOrThrow = async (groupId) => {
  const group = await Group.findOne({ _id: groupId, isActive: true });

  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  return group;
};

const getPopulatedGroupById = async (groupId) => {
  return Group.findById(groupId)
    .select('-joinRequests')
    .populate('admin', 'name avatar email reputation')
    .populate('moderators', 'name avatar email reputation')
    .populate('members.user', 'name avatar email reputation');
};

const findLatestJoinRequest = (group, userId) => {
  const targetUserId = toIdString(userId);
  const requests = ensureJoinRequests(group);

  for (let index = requests.length - 1; index >= 0; index -= 1) {
    const request = requests[index];
    if (request.user && toIdString(request.user) === targetUserId) {
      return request;
    }
  }

  return null;
};

const findPendingJoinRequest = (group, userId) => {
  return ensureJoinRequests(group).find(
    (request) => request.user && toIdString(request.user) === toIdString(userId) && request.status === 'pending'
  );
};

// Helper: kiểm tra userId có phải thành viên của nhóm không
const isMember = (group, userId) => {
  return Array.isArray(group.members) && group.members.some(
    (m) => m.user && toIdString(m.user) === toIdString(userId)
  );
};

/**
 * Tạo nhóm mới
 * - Admin tự động được thêm vào members
 */
const createGroup = async (userId, { name, description, tags }) => {
  const user = await User.findById(userId).select('-password');
  if (!user) {
    const err = new Error('Người dùng không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const group = new Group({
    name,
    description: description || '',
    tags: tags || [],
    admin: userId,
    members: [{ user: userId }],
  });

  await group.save();
  await logService.createLog('group', 'create', userId, null, group._id, null, { name, description });
  return group;
};

/**
 * Lấy tất cả nhóm đang hoạt động (có phân trang + tìm kiếm tên)
 */
const getAllGroups = async (page = 1, limit = 10, keyword = '', userId = null) => {
  const skip = (page - 1) * limit;
  const filter = { isActive: true };

  if (keyword && keyword.trim()) {
    filter.$or = [
      { name: { $regex: keyword.trim(), $options: 'i' } },
      { description: { $regex: keyword.trim(), $options: 'i' } },
    ];
  }

  const groups = await Group.find(filter)
    .populate('admin', 'name avatar')
    .sort({ date: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Group.countDocuments(filter);
  const hasMore = total > skip + groups.length;

  const mappedGroups = groups.map((g) => {
    const groupObj = g.toObject();
    const latestRequest = userId ? findLatestJoinRequest(g, userId) : null;
    const joinRequestStatus = latestRequest ? latestRequest.status : '';
    const hasPendingJoinRequest = joinRequestStatus === 'pending';

    delete groupObj.joinRequests;

    return {
      ...groupObj,
      isMember: userId ? isMember(g, userId) : false,
      isAdmin: userId ? isGroupAdmin(g, userId) : false,
      isMod: userId ? isGroupModerator(g, userId) : false,
      membersCount: g.members?.length || 0,
      joinRequestStatus,
      hasPendingJoinRequest,
    };
  });

  return { groups: mappedGroups, total, hasMore };
};

/**
 * Lấy chi tiết một nhóm theo ID
 */
const getGroupById = async (groupId, userId) => {
  const group = await Group.findOne({ _id: groupId, isActive: true })
    .populate('admin', 'name avatar')
    .populate('members.user', 'name avatar')
    .populate('moderators', 'name avatar');

  if (!group) {
    const err = new Error('Nhóm không tồn tại hoặc đã bị xóa');
    err.statusCode = 404;
    throw err;
  }

  const latestRequest = userId ? findLatestJoinRequest(group, userId) : null;
  const joinRequestStatus = latestRequest ? latestRequest.status : '';
  const hasPendingJoinRequest = joinRequestStatus === 'pending';

  const groupObj = group.toObject();
  delete groupObj.joinRequests;

  return {
    ...groupObj,
    privacyType: group.privacyType || 'private',
    postModerationType: group.postModerationType || 'auto',
    isMember: userId ? isMember(group, userId) : false,
    isAdmin: userId ? isGroupAdmin(group, userId) : false,
    isMod: userId ? isGroupModerator(group, userId) : false,
    membersCount: group.members.length,
    joinRequestStatus,
    hasPendingJoinRequest,
  };
};

/**
 * Tham gia nhóm
 */
const joinGroup = async (groupId, userId) => {
  const group = await getActiveGroupOrThrow(groupId);
  console.log('--- DEBUG joinGroup ---');
  console.log('Group Name:', group.name);
  console.log('Group Privacy:', group.privacyType);
  console.log('User ID:', userId);

  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (isMember(group, userId)) {
    const err = new Error('Bạn đã là thành viên của nhóm này');
    err.statusCode = 400;
    throw err;
  }

  // Nếu là nhóm cộng đồng, cho phép tham gia trực tiếp không cần duyệt
  if (group.privacyType === 'public') {
    group.members.push({ user: userId });
    await group.save();
    await logService.createLog('group', 'join', userId, null, group._id, null, { name: group.name, direct: true });
    return {
      message: 'Tham gia nhóm thành công',
      status: 'approved',
      membersCount: group.members.length
    };
  }

  const pendingRequest = findPendingJoinRequest(group, userId);
  if (pendingRequest) {
    const err = new Error('Yêu cầu tham gia nhóm đang chờ duyệt');
    err.statusCode = 400;
    throw err;
  }

  const existingRequest = findLatestJoinRequest(group, userId);
  if (existingRequest) {
    existingRequest.status = 'pending';
    existingRequest.requestedAt = new Date();
  } else {
    ensureJoinRequests(group).push({
      user: userId,
      requestedAt: new Date(),
      status: 'pending'
    });
  }
  await group.save();
  await logService.createLog('group', 'join', userId, null, group._id, null, { name: group.name, direct: false, status: 'pending' });
  return {
    message: 'Đã gửi yêu cầu tham gia nhóm, vui lòng chờ duyệt',
    status: 'pending',
    membersCount: group.members.length
  };
};

/**
 * Rời nhóm
 * - Admin không được rời nếu vẫn còn thành viên khác (phải xóa nhóm hoặc transfer)
 */
const leaveGroup = async (groupId, userId) => {
  const group = await getActiveGroupOrThrow(groupId);

  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (!isMember(group, userId)) {
    const err = new Error('Bạn không phải thành viên của nhóm này');
    err.statusCode = 400;
    throw err;
  }

  const isAdmin = isGroupAdmin(group, userId);
  if (isAdmin && group.members.length > 1) {
    const err = new Error('Admin không thể rời nhóm khi còn thành viên khác. Hãy xóa nhóm hoặc chuyển quyền admin.');
    err.statusCode = 400;
    throw err;
  }

  group.members = group.members.filter(
    (m) => toIdString(m.user) !== toIdString(userId)
  );

  if (Array.isArray(group.moderators)) {
    group.moderators = group.moderators.filter(
      (moderator) => toIdString(moderator) !== toIdString(userId)
    );
  }
  await group.save();
  await logService.createLog('group', 'leave', userId, null, group._id, null, { name: group.name });

  return { message: 'Rời nhóm thành công', membersCount: group.members.length };
};

/**
 * Soft delete nhóm (chỉ admin nhóm mới được xóa)
 */
const deleteGroup = async (groupId, userId) => {
  const group = await getActiveGroupOrThrow(groupId);

  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (!isGroupAdmin(group, userId)) {
    const err = new Error('Chỉ admin nhóm mới có quyền xóa nhóm');
    err.statusCode = 403;
    throw err;
  }

  group.isActive = false;
  await group.save();
  await logService.createLog('group', 'delete', userId, null, group._id, null, { name: group.name });

  return { message: 'Xóa nhóm thành công' };
};

/**
 * Lấy newsfeed của nhóm (chỉ thành viên mới xem được)
 * Việc kiểm tra tư cách thành viên được thực hiện bởi middleware requireGroupMember
 */
const getGroupFeed = async (groupId, userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const filter = {
    group: groupId,
    isDeleted: { $ne: true },
    $or: [
      { status: 'approved' },
      { user: userId, status: 'pending' }
    ]
  };

  const posts = await Post.find(filter)
    .populate('user', 'name avatar reputation')
    .populate('comments.user', 'name avatar reputation')
    .sort({ date: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Post.countDocuments(filter);
  const hasMore = total > skip + posts.length;

  return { posts, total, hasMore };
};

const getJoinRequests = async (groupId, userId) => {
  const group = await Group.findOne({ _id: groupId, isActive: true })
    .populate('joinRequests.user', 'name avatar email reputation');

  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (!canManageGroup(group, userId)) {
    const err = new Error('Chỉ admin hoặc kiểm duyệt viên mới có quyền xem yêu cầu tham gia nhóm');
    err.statusCode = 403;
    throw err;
  }

  return ensureJoinRequests(group).filter(
    (request) => request.status === 'pending' && request.user
  );
};

const approveJoinRequest = async (groupId, managerId, targetUserId) => {
  if (!targetUserId) {
    const err = new Error('Thiếu người dùng cần duyệt');
    err.statusCode = 400;
    throw err;
  }

  const group = await getActiveGroupOrThrow(groupId);

  if (!canManageGroup(group, managerId)) {
    const err = new Error('Chỉ admin hoặc kiểm duyệt viên mới có quyền duyệt thành viên');
    err.statusCode = 403;
    throw err;
  }

  const pendingRequest = findPendingJoinRequest(group, targetUserId);
  if (!pendingRequest) {
    const err = new Error('Không tìm thấy yêu cầu tham gia đang chờ duyệt');
    err.statusCode = 404;
    throw err;
  }

  if (!isMember(group, targetUserId)) {
    group.members.push({ user: targetUserId });
  }

  pendingRequest.status = 'approved';
  await group.save();
  await logService.createLog('group', 'join', targetUserId, null, group._id, null, { name: group.name, approvedBy: managerId });

  return {
    message: 'Đã duyệt yêu cầu tham gia nhóm thành công',
    membersCount: group.members.length
  };
};

const rejectJoinRequest = async (groupId, managerId, targetUserId) => {
  if (!targetUserId) {
    const err = new Error('Thiếu người dùng cần từ chối');
    err.statusCode = 400;
    throw err;
  }

  const group = await getActiveGroupOrThrow(groupId);

  if (!canManageGroup(group, managerId)) {
    const err = new Error('Chỉ admin hoặc kiểm duyệt viên mới có quyền từ chối thành viên');
    err.statusCode = 403;
    throw err;
  }

  const pendingRequest = findPendingJoinRequest(group, targetUserId);
  if (!pendingRequest) {
    const err = new Error('Không tìm thấy yêu cầu tham gia đang chờ duyệt');
    err.statusCode = 404;
    throw err;
  }

  pendingRequest.status = 'rejected';
  await group.save();

  return { message: 'Đã từ chối yêu cầu tham gia nhóm' };
};

const transferAdmin = async (groupId, currentAdminId, newAdminId) => {
  if (!newAdminId) {
    const err = new Error('Thiếu admin mới');
    err.statusCode = 400;
    throw err;
  }

  const group = await getActiveGroupOrThrow(groupId);

  if (!isGroupAdmin(group, currentAdminId)) {
    const err = new Error('Chỉ admin hiện tại mới có quyền chuyển quyền admin');
    err.statusCode = 403;
    throw err;
  }

  if (toIdString(currentAdminId) === toIdString(newAdminId)) {
    const err = new Error('Không thể chuyển quyền admin cho chính mình');
    err.statusCode = 400;
    throw err;
  }

  if (!isMember(group, newAdminId)) {
    const err = new Error('Admin mới phải là thành viên của nhóm');
    err.statusCode = 400;
    throw err;
  }

  const previousAdminId = group.admin;
  group.admin = newAdminId;

  if (!Array.isArray(group.moderators)) {
    group.moderators = [];
  }

  if (!isGroupModerator(group, previousAdminId)) {
    group.moderators.push(previousAdminId);
  }

  group.moderators = group.moderators.filter(
    (moderator) => toIdString(moderator) !== toIdString(newAdminId)
  );

  await group.save();

  return getPopulatedGroupById(group._id);
};

/**
 * Thăng chức / hạ chức Moderator (kiểm duyệt viên)
 */
const toggleModerator = async (groupId, adminId, targetUserId) => {
  if (!targetUserId) {
    const err = new Error('Thiếu người dùng cần cập nhật quyền moderator');
    err.statusCode = 400;
    throw err;
  }

  const group = await getActiveGroupOrThrow(groupId);
  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  // 1. Kiểm tra xem người gọi có phải admin nhóm không
  if (!isGroupAdmin(group, adminId)) {
    const err = new Error('Chỉ admin nhóm mới có quyền thăng chức/bãi chức kiểm duyệt viên');
    err.statusCode = 403;
    throw err;
  }

  // 2. Không được tự thăng chức/hạ chức chính mình
  if (toIdString(targetUserId) === toIdString(group.admin)) {
    const err = new Error('Không thể thăng chức/bãi chức chủ nhóm');
    err.statusCode = 400;
    throw err;
  }

  // 3. Kiểm tra xem targetUserId có phải thành viên nhóm không
  const isTargetMember = isMember(group, targetUserId);
  if (!isTargetMember) {
    const err = new Error('Người dùng không phải thành viên của nhóm này');
    err.statusCode = 400;
    throw err;
  }

  if (!group.moderators) {
    group.moderators = [];
  }

  const modIndex = group.moderators.findIndex(
    (m) => toIdString(m) === toIdString(targetUserId)
  );
  let action = '';

  if (modIndex === -1) {
    group.moderators.push(targetUserId);
    action = 'promote';
  } else {
    group.moderators.splice(modIndex, 1);
    action = 'demote';
  }

  await group.save();
  return { group, action };
};

/**
 * Lấy danh sách bài đăng chờ duyệt (chỉ admin / mod)
 */
const getPendingPosts = async (groupId, userId) => {
  const group = await getActiveGroupOrThrow(groupId);
  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (!canManageGroup(group, userId)) {
    const err = new Error('Chỉ admin hoặc kiểm duyệt viên mới có quyền xem bài viết chờ duyệt');
    err.statusCode = 403;
    throw err;
  }

  const posts = await Post.find({
    group: groupId,
    isDeleted: { $ne: true },
    $or: [
      { status: 'pending' },
      { 'pendingEdit.status': 'pending' }
    ]
  })
    .populate('user', 'name avatar reputation')
    .populate('comments.user', 'name avatar reputation')
    .sort({ date: -1 });

  return posts.map(post => {
    const postObj = post.toObject();
    if (postObj.pendingEdit && postObj.pendingEdit.status === 'pending') {
      postObj.isEditApproval = true;
      postObj.text = postObj.pendingEdit.text;
      postObj.codeSnippet = postObj.pendingEdit.codeSnippet;
      postObj.codeLanguage = postObj.pendingEdit.codeLanguage;
      postObj.isQuestion = postObj.pendingEdit.isQuestion;
    }
    return postObj;
  });
};

/**
 * Phê duyệt / từ chối bài viết (chỉ admin / mod)
 */
const updatePostStatus = async (groupId, postId, userId, status) => {
  const group = await getActiveGroupOrThrow(groupId);
  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (!canManageGroup(group, userId)) {
    const err = new Error('Chỉ admin hoặc kiểm duyệt viên mới có quyền duyệt bài viết');
    err.statusCode = 403;
    throw err;
  }

  const post = await Post.findOne({ _id: postId, group: groupId });
  if (!post) {
    const err = new Error('Bài viết không tồn tại trong nhóm này');
    err.statusCode = 404;
    throw err;
  }

  if (status === 'approved') {
    if (post.pendingEdit && post.pendingEdit.status === 'pending') {
      // Áp dụng nội dung chỉnh sửa mới
      post.text = post.pendingEdit.text;
      post.codeSnippet = post.pendingEdit.codeSnippet;
      post.codeLanguage = post.pendingEdit.codeLanguage;
      post.isQuestion = post.pendingEdit.isQuestion;
      post.pendingEdit = undefined; // Xóa thông tin chỉnh sửa chờ duyệt
    } else {
      // Bài viết mới hoàn toàn, duyệt public bài đăng
      post.status = 'approved';
    }
    await post.save();

    // Tạo thông báo duyệt thành công cho tác giả bài viết
    const notificationService = require('./notificationService');
    try {
      await notificationService.createNotification(post.user, userId, 'post_approved', post._id);
    } catch (err) {
      console.error('Lỗi tạo thông báo duyệt bài viết:', err.message);
    }
  } else if (status === 'rejected') {
    const notificationService = require('./notificationService');
    try {
      await notificationService.createNotification(post.user, userId, 'post_rejected', post._id);
    } catch (err) {
      console.error('Lỗi tạo thông báo từ chối bài viết:', err.message);
    }

    if (post.pendingEdit && post.pendingEdit.status === 'pending') {
      // Từ chối chỉnh sửa ➔ Hủy bỏ thông tin sửa, giữ nguyên bài đăng cũ đang live
      post.pendingEdit = undefined;
      await post.save();
    } else {
      // Từ chối bài viết mới hoàn toàn ➔ Xóa bài viết khỏi cơ sở dữ liệu
      await post.deleteOne();
    }
  } else {
    const err = new Error('Trạng thái duyệt không hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  return { message: status === 'approved' ? 'Đã phê duyệt bài viết' : 'Đã từ chối và xóa bài viết' };
};

/**
 * Lấy bộ lọc từ cấm của nhóm (chỉ admin / mod)
 */
const getGroupFilters = async (groupId, userId) => {
  const group = await getActiveGroupOrThrow(groupId);
  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (!canManageGroup(group, userId)) {
    const err = new Error('Chỉ admin hoặc kiểm duyệt viên mới có quyền xem bộ lọc từ cấm');
    err.statusCode = 403;
    throw err;
  }

  return group.bannedWords || [];
};

/**
 * Thêm từ cấm vào nhóm (chỉ admin / mod)
 */
const addGroupFilter = async (groupId, userId, word) => {
  const group = await getActiveGroupOrThrow(groupId);
  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (!canManageGroup(group, userId)) {
    const err = new Error('Chỉ admin hoặc kiểm duyệt viên mới có quyền thêm từ cấm');
    err.statusCode = 403;
    throw err;
  }

  const cleanWord = word ? word.trim() : '';
  if (!cleanWord) {
    const err = new Error('Từ cấm không được để trống');
    err.statusCode = 400;
    throw err;
  }

  if (group.bannedWords.some(w => w.toLowerCase() === cleanWord.toLowerCase())) {
    const err = new Error('Từ cấm này đã tồn tại trong bộ lọc nhóm');
    err.statusCode = 400;
    throw err;
  }

  group.bannedWords.push(cleanWord);
  await group.save();

  return group.bannedWords;
};

/**
 * Xóa từ cấm khỏi nhóm (chỉ admin / mod)
 */
const deleteGroupFilter = async (groupId, userId, word) => {
  const group = await getActiveGroupOrThrow(groupId);
  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (!canManageGroup(group, userId)) {
    const err = new Error('Chỉ admin hoặc kiểm duyệt viên mới có quyền xóa từ cấm');
    err.statusCode = 403;
    throw err;
  }

  const decodedWord = decodeURIComponent(word).trim().toLowerCase();
  group.bannedWords = group.bannedWords.filter(w => w.toLowerCase() !== decodedWord);
  await group.save();

  return group.bannedWords;
};

const kickMember = async (groupId, adminId, targetUserId) => {
  const group = await getActiveGroupOrThrow(groupId);

  if (!group) {
    const err = new Error('Nhóm không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const isAdmin = group.admin.toString() === adminId.toString();
  if (!isAdmin) {
    const err = new Error('Chỉ Admin nhóm mới có quyền xóa thành viên');
    err.statusCode = 403;
    throw err;
  }

  if (adminId.toString() === targetUserId.toString()) {
    const err = new Error('Admin không thể tự xóa chính mình khỏi nhóm. Hãy sử dụng tính năng chuyển quyền admin.');
    err.statusCode = 400;
    throw err;
  }

  const isTargetMember = group.members.some(
    (m) => m.user && m.user.toString() === targetUserId.toString()
  );
  if (!isTargetMember) {
    const err = new Error('Người dùng này không phải thành viên của nhóm');
    err.statusCode = 400;
    throw err;
  }

  group.members = group.members.filter(
    (m) => m.user && m.user.toString() !== targetUserId.toString()
  );

  if (Array.isArray(group.moderators)) {
    group.moderators = group.moderators.filter(
      (moderator) => moderator.toString() !== targetUserId.toString()
    );
  }

  await group.save();

  return { message: 'Đã xóa thành viên khỏi nhóm thành công', membersCount: group.members.length };
};

const updateGroupSettings = async (groupId, adminId, { privacyType, postModerationType }) => {
  const group = await getActiveGroupOrThrow(groupId);

  if (group.admin.toString() !== adminId.toString()) {
    const err = new Error('Chỉ Admin nhóm mới có quyền thay đổi cài đặt nhóm');
    err.statusCode = 403;
    throw err;
  }

  if (privacyType) {
    if (!['public', 'private'].includes(privacyType)) {
      const err = new Error('Loại riêng tư không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    group.privacyType = privacyType;
  }

  if (postModerationType) {
    if (!['auto', 'manual'].includes(postModerationType)) {
      const err = new Error('Chế độ kiểm duyệt không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    group.postModerationType = postModerationType;
  }

  await group.save();
  return group;
};

module.exports = {
  createGroup,
  getAllGroups,
  getGroupById,
  joinGroup,
  leaveGroup,
  deleteGroup,
  getGroupFeed,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  transferAdmin,
  isMember,
  isGroupAdmin,
  isGroupModerator,
  canManageGroup,
  toggleModerator,
  getPendingPosts,
  updatePostStatus,
  getGroupFilters,
  addGroupFilter,
  deleteGroupFilter,
  kickMember,
  updateGroupSettings,
};
