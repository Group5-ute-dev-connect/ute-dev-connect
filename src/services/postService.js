const Post = require('../models/Post');
const User = require('../models/User');
const Group = require('../models/Group');
const PostView = require('../models/PostView');
const logService = require('./logService');

const createPost = async (userId, text, isQuestion = false, groupId = null, codeSnippet = '', codeLanguage = 'javascript', visibility = 'public') => {
  try {
    let status = 'approved';
    let isPendingDueToBannedWord = false;

    // Lấy thông tin nhóm học tập
    let group = null;
    if (groupId) {
      group = await Group.findById(groupId);
    }

    // Lọc nội dung cấm hoặc AI
    const filterService = require('./filterService');
    const groupBannedWords = group ? (group.bannedWords || []) : [];

    // Kiểm tra xem người đăng có phải Admin hoặc Mod nhóm không, nếu có thì tự động duyệt thông qua
    const isAdminOrMod = group && (group.admin.toString() === userId.toString() ||
                         (group.moderators && group.moderators.some(m => m.toString() === userId.toString())));

    let textCheck = { isViolation: false };
    let codeCheck = { isViolation: false };

    if (!isAdminOrMod) {
      textCheck = await filterService.checkContentWithGroup(text, groupBannedWords);
      if (codeSnippet) {
        codeCheck = await filterService.checkContentWithGroup(codeSnippet, groupBannedWords);
      }
    }

    if (groupId) {
      if (!isAdminOrMod) {
        if (group && group.postModerationType === 'manual') {
          status = 'pending';
        } else if (textCheck.isViolation || codeCheck.isViolation) {
          status = 'pending';
          isPendingDueToBannedWord = true;
        }
      }
    } else {
      if (textCheck.isViolation || codeCheck.isViolation) {
        const violationWord = textCheck.word || codeCheck.word || '';
        const violationReason = textCheck.reason || codeCheck.reason || '';
        const error = new Error(violationWord ? `Nội dung chứa từ cấm không cho phép: "${violationWord}"` : `Nội dung vi phạm chính sách kiểm duyệt: ${violationReason}`);
        error.statusCode = 400;
        throw error;
      }
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      const error = new Error('Người dùng không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    const newPost = new Post({
      text,
      isQuestion,
      name: user.name,
      avatar: user.avatar,
      user: userId,
      group: groupId || null,
      codeSnippet,
      codeLanguage,
      status,
      visibility,
    });

    let post = await newPost.save();
    post = await Post.findById(post._id).populate('user', 'name avatar reputation');

    // Nếu bài đăng ở trạng thái pending trong nhóm, tạo thông báo hệ thống và gửi qua socket tới Admin/Mod nhóm
    if (status === 'pending' && group) {
      const notificationService = require('./notificationService');
      const admins = [group.admin.toString(), ...(group.moderators || []).map(m => m.toString())];
      for (const adminId of admins) {
        try {
          await notificationService.createNotification(adminId, userId, 'post_pending', post._id);
        } catch (err) {
          console.error('Lỗi tạo thông báo pending cho Admin/Mod nhóm:', err.message);
        }
      }
    }

    await logService.createLog('post', 'create', userId, post._id, groupId, null, { text });

    return post;
  } catch (error) {
    throw error;
  }
};

const getPostById = async (postId, currentUserId = null, clientIp = null) => {
  try {
    const post = await Post.findById(postId)
      .populate('user', 'name avatar reputation')
      .populate('comments.user', 'name avatar reputation');

    if (!post || post.isDeleted) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    // Check hidden post access
    if (post.isHidden && post.user?._id?.toString() !== currentUserId?.toString()) {
      const error = new Error('Bài viết đã bị ẩn');
      error.statusCode = 403;
      throw error;
    }

    // Check visibility logic
    if (post.visibility && post.visibility !== 'public' && post.user?._id?.toString() !== currentUserId?.toString()) {
      if (!currentUserId) {
        const error = new Error('Bạn không có quyền xem bài viết này');
        error.statusCode = 401;
        throw error;
      }

      const viewer = await User.findById(currentUserId);
      if (!viewer) {
        const error = new Error('Bạn không có quyền xem bài viết này');
        error.statusCode = 401;
        throw error;
      }

      const authorId = post.user?._id?.toString() || post.user?.toString();
      const followingIds = viewer.following.map(f => f.user?.toString());
      const followerIds = viewer.followers.map(f => f.user?.toString());

      if (post.visibility === 'personal') {
        const error = new Error('Bài viết này ở chế độ cá nhân');
        error.statusCode = 403;
        throw error;
      } else if (post.visibility === 'followers') {
        if (!followingIds.includes(authorId)) {
          const error = new Error('Bài viết này chỉ hiển thị với người theo dõi');
          error.statusCode = 403;
          throw error;
        }
      } else if (post.visibility === 'friends') {
        const isFriend = followingIds.includes(authorId) && followerIds.includes(authorId);
        if (!isFriend) {
          const error = new Error('Bài viết này chỉ hiển thị với bạn bè (theo dõi chéo)');
          error.statusCode = 403;
          throw error;
        }
      }
    }

    // Cooldown check for view tracking (15 minutes)
    if (clientIp || currentUserId) {
      const cooldownPeriod = new Date(Date.now() - 15 * 60 * 1000);
      let query = { post: postId, date: { $gte: cooldownPeriod } };
      if (currentUserId) {
        query.user = currentUserId;
      } else if (clientIp) {
        query.ip = clientIp;
      }

      const hasViewed = await PostView.findOne(query);
      if (!hasViewed) {
        const newView = new PostView({
          post: postId,
          user: currentUserId || null,
          ip: clientIp || '127.0.0.1'
        });
        await newView.save();

        // Increment cached views on Post
        post.views = (post.views || 0) + 1;
        await Post.findByIdAndUpdate(postId, { $inc: { views: 1 } });
      }
    }

    return post;
  } catch (error) {
    if (error.kind === 'ObjectId') {
      const invalidIdError = new Error('Định dạng ID bài viết không hợp lệ');
      invalidIdError.statusCode = 400;
      throw invalidIdError;
    }

    throw error;
  }
};

const getAllPosts = async (page = 1, limit = 5, currentUserId = null, filterType = 'latest', timeframe = '7d') => {
  try {
    const skip = (page - 1) * limit;

    let filter = { 
      group: null,
      isDeleted: { $ne: true },
      isHidden: { $ne: true }
    };

    let followingIds = [];
    let friendIds = [];

    if (currentUserId) {
      const user = await User.findById(currentUserId);
      if (user) {
        followingIds = user.following.map(f => f.user);
        const followerIds = user.followers.map(f => f.user);
        friendIds = followingIds.filter(id => 
          followerIds.some(fId => fId.toString() === id.toString())
        );

        filter.$or = [
          { visibility: 'public' },
          { visibility: { $exists: false } },
          { user: currentUserId },
          { visibility: 'followers', user: { $in: followingIds } },
          { visibility: 'friends', user: { $in: friendIds } }
        ];
      } else {
        filter.visibility = 'public';
      }
    } else {
      filter.$or = [
        { visibility: 'public' },
        { visibility: { $exists: false } }
      ];
    }

    // Tinh chỉnh bộ lọc theo loại (friends)
    if (filterType === 'friends') {
      if (!currentUserId) {
        return { posts: [], hasMore: false, total: 0 };
      }
      filter = {
        group: null,
        isDeleted: { $ne: true },
        isHidden: { $ne: true },
        user: { $in: friendIds },
        $or: [
          { visibility: 'public' },
          { visibility: { $exists: false } },
          { visibility: 'friends' },
          { visibility: 'followers' }
        ]
      };
    }

    let posts;
    if (filterType === 'trending') {
      if (timeframe === 'all') {
        // Sắp xếp xu hướng Tất cả thời gian: dùng trực tiếp trường views trên Post (bao gồm cả các view cũ)
        posts = await Post.aggregate([
          { $match: filter },
          {
            $addFields: {
              recentViewsCount: { $ifNull: ['$views', 0] },
              likesCount: { $size: { $ifNull: ['$likes', []] } },
              commentsCount: { $size: { $ifNull: ['$comments', []] } }
            }
          },
          {
            $sort: {
              recentViewsCount: -1,
              commentsCount: -1,
              likesCount: -1,
              date: -1
            }
          },
          { $skip: skip },
          { $limit: limit }
        ]);
      } else {
        // Xác định thời điểm bắt đầu lọc views cho các khoảng thời gian cụ thể
        let startDate = new Date(0);
        const now = Date.now();
        if (timeframe === '24h') {
          startDate = new Date(now - 24 * 60 * 60 * 1000);
        } else if (timeframe === '7d') {
          startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        } else if (timeframe === '30d') {
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        }

        // Sắp xếp xu hướng: ưu tiên views trong timeframe, commentsCount, likesCount, date
        posts = await Post.aggregate([
          { $match: filter },
          {
            $lookup: {
              from: 'postviews',
              let: { postId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$post', '$$postId'] },
                        { $gte: ['$date', startDate] }
                      ]
                    }
                  }
                },
                { $count: 'count' }
              ],
              as: 'recentViews'
            }
          },
          {
            $addFields: {
              recentViewsCount: {
                $ifNull: [ { $arrayElemAt: ['$recentViews.count', 0] }, 0 ]
              },
              likesCount: { $size: { $ifNull: ['$likes', []] } },
              commentsCount: { $size: { $ifNull: ['$comments', []] } }
            }
          },
          {
            $sort: {
              recentViewsCount: -1,
              commentsCount: -1,
              likesCount: -1,
              date: -1
            }
          },
          { $skip: skip },
          { $limit: limit }
        ]);
      }
      await Post.populate(posts, { path: 'user', select: 'name avatar reputation' });
    } else {
      // 'latest' hoặc 'friends'
      posts = await Post.find(filter)
        .populate('user', 'name avatar reputation')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit);
    }

    const total = await Post.countDocuments(filter);
    const hasMore = total > skip + posts.length;

    return {
      posts,
      hasMore,
      total,
    };
  } catch (error) {
    throw error;
  }
};

const getUserPosts = async (targetUserId, page = 1, limit = 5, currentUserId = null) => {
  try {
    const skip = (page - 1) * limit;

    let filter = { 
      user: targetUserId,
      group: null,
      isDeleted: { $ne: true },
      isHidden: { $ne: true }
    };

    if (currentUserId && currentUserId.toString() !== targetUserId.toString()) {
      const user = await User.findById(currentUserId);
      if (user) {
        const followingIds = user.following.map(f => f.user?.toString());
        const followerIds = user.followers.map(f => f.user?.toString());
        const friendIds = followingIds.filter(id => 
          followerIds.some(fId => fId === id)
        );

        filter.$or = [
          { visibility: 'public' },
          { visibility: { $exists: false } }
        ];

        if (followingIds.includes(targetUserId.toString())) {
          filter.$or.push({ visibility: 'followers' });
        }
        if (friendIds.includes(targetUserId.toString())) {
          filter.$or.push({ visibility: 'friends' });
        }
      } else {
        filter.visibility = 'public';
      }
    } else if (!currentUserId) {
      filter.$or = [
        { visibility: 'public' },
        { visibility: { $exists: false } }
      ];
    }
    // If currentUserId === targetUserId, no visibility filter needed (can see all own posts)

    const posts = await Post.find(filter)
      .populate('user', 'name avatar reputation')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments(filter);
    const hasMore = total > skip + posts.length;

    return {
      posts,
      hasMore,
      total,
    };
  } catch (error) {
    throw error;
  }
};

const getTopTrendingPosts = async (currentUserId = null) => {
  try {
    let matchFilter = {
      group: null,
      isDeleted: { $ne: true },
      isHidden: { $ne: true }
    };

    if (currentUserId) {
      const user = await User.findById(currentUserId);
      if (user) {
        const followingIds = user.following.map(f => f.user);
        const followerIds = user.followers.map(f => f.user);
        const friendIds = followingIds.filter(id => 
          followerIds.some(fId => fId.toString() === id.toString())
        );

        matchFilter.$or = [
          { visibility: 'public' },
          { visibility: { $exists: false } },
          { user: user._id },
          { visibility: 'followers', user: { $in: followingIds } },
          { visibility: 'friends', user: { $in: friendIds } }
        ];
      } else {
        matchFilter.visibility = 'public';
      }
    } else {
      matchFilter.$or = [
        { visibility: 'public' },
        { visibility: { $exists: false } }
      ];
    }

    const posts = await Post.aggregate([
      {
        $match: matchFilter
      },
      {
        $addFields: {
          likesCount: { $size: { $ifNull: ['$likes', []] } },
          commentsCount: { $size: { $ifNull: ['$comments', []] } },
        },
      },
      {
        $sort: {
          likesCount: -1,
          commentsCount: -1,
          date: -1,
        },
      },
      {
        $limit: 10,
      },
    ]);

    // Populate user details for trending posts
    await Post.populate(posts, { path: 'user', select: 'name avatar reputation' });

    return posts;
  } catch (error) {
    throw error;
  }
};

const toggleSavePost = async (userId, postId) => {
  const post = await Post.findById(postId);

  if (!post) {
    const error = new Error('Không tìm thấy bài viết');
    error.statusCode = 404;
    throw error;
  }

  const user = await User.findById(userId);

  if (!user) {
    const error = new Error('Không tìm thấy người dùng');
    error.statusCode = 404;
    throw error;
  }

  const isSaved = user.savedPosts.some(
    (savedPostId) => savedPostId.toString() === postId.toString()
  );

  if (isSaved) {
    user.savedPosts = user.savedPosts.filter(
      (savedPostId) => savedPostId.toString() !== postId.toString()
    );
  } else {
    user.savedPosts.unshift(postId);
  }

  await user.save();

  return {
    isSaved: !isSaved,
    savedPosts: user.savedPosts,
    postId,
  };
};

const getSavedPosts = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const user = await User.findById(userId).populate({
    path: 'savedPosts',
    options: { sort: { date: -1 }, skip, limit },
    populate: { path: 'user', select: 'name avatar reputation' }
  });

  if (!user) {
    const error = new Error('Không tìm thấy người dùng');
    error.statusCode = 404;
    throw error;
  }

  const userDoc = await User.findById(userId);
  const totalItems = userDoc.savedPosts.length;

  return {
    posts: user.savedPosts,
    total: totalItems,
    hasMore: skip + user.savedPosts.length < totalItems
  };
};

// Like / Unlike bài viết dạng toggle
const toggleLikePost = async (postId, userId) => {
  try {
    const post = await Post.findById(postId);

    if (!post) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    const likedIndex = post.likes.findIndex(
      (like) => like.user.toString() === userId.toString()
    );

    let liked = false;
    let reputationChange = 0;

    if (likedIndex === -1) {
      post.likes.unshift({ user: userId });
      liked = true;
      reputationChange = 2;
    } else {
      post.likes.splice(likedIndex, 1);
      liked = false;
      reputationChange = -2;
    }

    await post.save();

    await logService.createLog('like', liked ? 'like' : 'unlike', userId, post._id, post.group, null);

    // Cập nhật reputation cho tác giả bài viết nếu không tự like
    if (post.user && post.user.toString() !== userId.toString()) {
      await User.findByIdAndUpdate(post.user, {
        $inc: { reputation: reputationChange }
      });
    }

    return {
      liked,
      isLiked: liked,
      likesCount: post.likes.length,
      likes: post.likes,
      postOwnerId: post.user,
    };
  } catch (error) {
    if (error.kind === 'ObjectId') {
      const invalidIdError = new Error('Định dạng ID bài viết không hợp lệ');
      invalidIdError.statusCode = 400;
      throw invalidIdError;
    }

    throw error;
  }
};

// Thêm bình luận vào bài viết
const addComment = async (postId, userId, text, codeSnippet = '', codeLanguage = 'javascript') => {
  try {
    const normalizedText = text ? text.trim() : '';

    if (!normalizedText) {
      const error = new Error('Nội dung bình luận không được để trống');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      const error = new Error('Người dùng không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    const post = await Post.findById(postId);

    if (!post) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    // Lọc nội dung cấm hoặc AI dựa trên nhóm học tập của bài viết
    let groupBannedWords = [];
    if (post.group) {
      const group = await Group.findById(post.group);
      if (group) {
        groupBannedWords = group.bannedWords || [];
      }
    }

    const filterService = require('./filterService');
    const textCheck = await filterService.checkContentWithGroup(normalizedText, groupBannedWords);
    let codeCheck = { isViolation: false };
    if (codeSnippet) {
      codeCheck = await filterService.checkContentWithGroup(codeSnippet, groupBannedWords);
    }

    if (textCheck.isViolation || codeCheck.isViolation) {
      const violationWord = textCheck.word || codeCheck.word || '';
      const violationReason = textCheck.reason || codeCheck.reason || '';
      const error = new Error(violationWord ? `Nội dung chứa từ cấm không cho phép: "${violationWord}"` : `Nội dung vi phạm chính sách kiểm duyệt: ${violationReason}`);
      error.statusCode = 400;
      throw error;
    }

    const newComment = {
      user: userId,
      text: normalizedText,
      name: user.name,
      avatar: user.avatar,
      codeSnippet,
      codeLanguage,
      approvals: [],
    };

    post.comments.unshift(newComment);
    await post.save();
    
    await logService.createLog('comment', 'create', userId, post._id, post.group, post.comments[0]._id, { text: normalizedText });

    await post.populate('comments.user', 'name avatar reputation');

    return {
      comments: post.comments,
      postOwnerId: post.user,
    };
  } catch (error) {
    if (error.kind === 'ObjectId') {
      const invalidIdError = new Error('Định dạng ID bài viết không hợp lệ');
      invalidIdError.statusCode = 400;
      throw invalidIdError;
    }

    throw error;
  }
};

// Cập nhật bài viết
const updatePost = async (postId, userId, text, isQuestion, codeSnippet, codeLanguage, visibility) => {
  try {
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }
    if (post.user.toString() !== userId.toString()) {
      const error = new Error('Người dùng không có quyền sửa bài viết này');
      error.statusCode = 401;
      throw error;
    }

    let status = 'approved';
    const filterService = require('./filterService');

    // Nếu bài viết thuộc nhóm học tập, kiểm tra bộ lọc nhóm + bộ lọc hệ thống
    if (post.group) {
      const Group = require('../models/Group');
      const group = await Group.findById(post.group);
      
      const isAdminOrMod = group && (group.admin.toString() === userId.toString() ||
                           (group.moderators && group.moderators.some(m => m.toString() === userId.toString())));
      
      if (isAdminOrMod) {
        status = 'approved';
      } else {
        if (group && group.postModerationType === 'manual') {
          status = 'pending';
        } else {
          const checkText = text !== undefined ? text : post.text;
          const checkSnippet = codeSnippet !== undefined ? codeSnippet : post.codeSnippet;
          
          const checkResult = await filterService.checkContentWithGroup(checkText, group.bannedWords || []);
          const snippetCheckResult = checkSnippet ? await filterService.checkContentWithGroup(checkSnippet, group.bannedWords || []) : { isViolation: false };
          
          if (checkResult.isViolation || snippetCheckResult.isViolation) {
            status = 'pending';
          }
        }
      }
    } else {
      // Bài viết công khai ngoài nhóm, nếu dính từ cấm hệ thống thì chặn lỗi 400 như cũ
      if (text !== undefined) {
        await filterService.checkContent(text);
      }
      if (codeSnippet !== undefined) {
        await filterService.checkContent(codeSnippet);
      }
    }

    const isAlreadyApproved = post.status === 'approved';

    if (status === 'pending') {
      if (isAlreadyApproved) {
        // Lưu chỉnh sửa vào pendingEdit, giữ nguyên nội dung bài đăng đang hiện hữu
        post.pendingEdit = {
          text: text !== undefined ? text : post.text,
          codeSnippet: codeSnippet !== undefined ? codeSnippet : post.codeSnippet,
          codeLanguage: codeLanguage !== undefined ? codeLanguage : post.codeLanguage,
          isQuestion: isQuestion !== undefined ? isQuestion : post.isQuestion,
          status: 'pending'
        };
      } else {
        // Bài viết mới chưa duyệt, ghi đè trực tiếp
        post.text = text !== undefined ? text : post.text;
        post.isQuestion = isQuestion !== undefined ? isQuestion : post.isQuestion;
        post.codeSnippet = codeSnippet !== undefined ? codeSnippet : post.codeSnippet;
        post.codeLanguage = codeLanguage !== undefined ? codeLanguage : post.codeLanguage;
        post.status = 'pending';
      }
    } else {
      // Nội dung sửa đổi hợp lệ, lưu đè trực tiếp và xóa pendingEdit cũ (nếu có)
      post.text = text !== undefined ? text : post.text;
      post.isQuestion = isQuestion !== undefined ? isQuestion : post.isQuestion;
      post.codeSnippet = codeSnippet !== undefined ? codeSnippet : post.codeSnippet;
      post.codeLanguage = codeLanguage !== undefined ? codeLanguage : post.codeLanguage;
      post.pendingEdit = undefined;
      
      // Nếu bài viết thuộc nhóm, chuyển trạng thái về approved
      if (post.group) {
        post.status = 'approved';
      }
    }
    
    post.visibility = visibility !== undefined ? visibility : post.visibility;
    
    await post.save();
    
    await logService.createLog('post', 'update', userId, post._id, post.group, null, { text: text !== undefined ? text : post.text });

    await post.populate('user', 'name avatar reputation');

    // Nếu chuyển sang pending, tạo thông báo cho Admin/Mod nhóm
    if (status === 'pending' && post.group) {
      const Group = require('../models/Group');
      const group = await Group.findById(post.group);
      if (group) {
        const notificationService = require('./notificationService');
        const admins = [group.admin.toString(), ...(group.moderators || []).map(m => m.toString())];
        for (const adminId of admins) {
          try {
            await notificationService.createNotification(adminId, userId, 'post_pending', post._id);
          } catch (err) {
            console.error('Lỗi tạo thông báo pending cho Admin/Mod nhóm khi sửa bài:', err.message);
          }
        }
      }
    }

    return post;
  } catch (error) {
    if (error.kind === 'ObjectId') {
      const invalidIdError = new Error('Định dạng ID bài viết không hợp lệ');
      invalidIdError.statusCode = 400;
      throw invalidIdError;
    }
    throw error;
  }
};

// Xóa bài viết
const deletePost = async (postId, userId) => {
  try {
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }
    
    let hasDeletePermission = post.user.toString() === userId.toString();
    
    // Nếu là bài viết trong nhóm, cho phép Admin/Mod nhóm xóa bài viết đó
    if (!hasDeletePermission && post.group) {
      const Group = require('../models/Group');
      const group = await Group.findById(post.group);
      if (group) {
        const isAdmin = group.admin.toString() === userId.toString();
        const isMod = group.moderators && group.moderators.some(m => m.toString() === userId.toString());
        if (isAdmin || isMod) {
          hasDeletePermission = true;
        }
      }
    }

    if (!hasDeletePermission) {
      const error = new Error('Người dùng không có quyền xóa bài viết này');
      error.statusCode = 401;
      throw error;
    }

    // Trừ điểm của comment được accept (nếu có)
    if (post.acceptedAnswer) {
       const acceptedComment = post.comments.id ? post.comments.id(post.acceptedAnswer) : post.comments.find(c => c._id.toString() === post.acceptedAnswer.toString());
       if (acceptedComment && acceptedComment.user.toString() !== post.user.toString()) {
           await User.findByIdAndUpdate(acceptedComment.user, {
             $inc: { reputation: -10 }
           });
       }
    }

    post.isDeleted = true;
    await post.save();

    await logService.createLog('post', 'delete', userId, post._id, post.group, null, { text: post.text });

    return { message: 'Bài viết đã được xóa' };
  } catch (error) {
    if (error.kind === 'ObjectId') {
      const invalidIdError = new Error('Định dạng ID bài viết không hợp lệ');
      invalidIdError.statusCode = 400;
      throw invalidIdError;
    }
    throw error;
  }
};

const toggleHidePost = async (postId, userId) => {
  try {
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }
    
    if (post.user.toString() !== userId.toString()) {
      const error = new Error('Người dùng không có quyền ẩn bài viết này');
      error.statusCode = 401;
      throw error;
    }

    post.isHidden = !post.isHidden;
    await post.save();
    await post.populate('user', 'name avatar reputation');
    return post;
  } catch (error) {
    if (error.kind === 'ObjectId') {
      const invalidIdError = new Error('Định dạng ID bài viết không hợp lệ');
      invalidIdError.statusCode = 400;
      throw invalidIdError;
    }
    throw error;
  }
};

const getHiddenPosts = async (userId, page = 1, limit = 10) => {
  try {
    const skip = (page - 1) * limit;
    const query = {
      user: userId,
      isHidden: true,
      isDeleted: { $ne: true }
    };

    const total = await Post.countDocuments(query);
    const posts = await Post.find(query)
      .populate('user', 'name avatar reputation')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    return {
      posts,
      total,
      hasMore: skip + posts.length < total
    };
  } catch (error) {
    throw error;
  }
};

// Cập nhật bình luận
const updateComment = async (postId, commentId, userId, text) => {
  try {
    // Lọc nội dung cấm hoặc AI
    const filterService = require('./filterService');
    if (text !== undefined) {
      await filterService.checkContent(text);
    }

    const post = await Post.findById(postId);
    if (!post) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    const comment = post.comments.id ? post.comments.id(commentId) : post.comments.find(c => c._id.toString() === commentId.toString());
    if (!comment) {
      const error = new Error('Bình luận không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    if (comment.user.toString() !== userId.toString()) {
      const error = new Error('Người dùng không có quyền sửa bình luận này');
      error.statusCode = 401;
      throw error;
    }

    comment.text = text !== undefined ? text : comment.text;
    await post.save();

    await logService.createLog('comment', 'update', userId, post._id, post.group, commentId, { text: text !== undefined ? text : comment.text });

    await post.populate('comments.user', 'name avatar reputation');
    return post.comments;
  } catch (error) {
    if (error.kind === 'ObjectId') {
      const invalidIdError = new Error('Định dạng ID hợp lệ');
      invalidIdError.statusCode = 400;
      throw invalidIdError;
    }
    throw error;
  }
};

// Xóa bình luận
const deleteComment = async (postId, commentId, userId) => {
  try {
    const post = await Post.findById(postId);
    if (!post) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    const commentIndex = post.comments.findIndex(c => c._id.toString() === commentId.toString());
    if (commentIndex === -1) {
      const error = new Error('Bình luận không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    const comment = post.comments[commentIndex];
    if (comment.user.toString() !== userId.toString() && post.user.toString() !== userId.toString()) {
      const error = new Error('Người dùng không có quyền xóa bình luận này');
      error.statusCode = 401;
      throw error;
    }

    if (post.acceptedAnswer && post.acceptedAnswer.toString() === commentId.toString()) {
        post.acceptedAnswer = null;
        if (comment.user.toString() !== post.user.toString()) {
            await User.findByIdAndUpdate(comment.user, {
                $inc: { reputation: -10 }
            });
        }
    }

    post.comments.splice(commentIndex, 1);
    await post.save();

    await logService.createLog('comment', 'delete', userId, post._id, post.group, commentId, { text: comment.text });

    await post.populate('comments.user', 'name avatar reputation');
    return post.comments;
  } catch (error) {
    if (error.kind === 'ObjectId') {
      const invalidIdError = new Error('Định dạng ID hợp lệ');
      invalidIdError.statusCode = 400;
      throw invalidIdError;
    }
    throw error;
  }
};

// Accept Answer
const acceptAnswer = async (postId, commentId, userId) => {
  try {
    const post = await Post.findById(postId);
    if (!post) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    if (post.user.toString() !== userId.toString()) {
      const error = new Error('Chỉ tác giả bài viết mới có thể chấp nhận câu trả lời');
      error.statusCode = 401;
      throw error;
    }

    const comment = post.comments.id ? post.comments.id(commentId) : post.comments.find(c => c._id.toString() === commentId.toString());
    if (!comment) {
      const error = new Error('Bình luận không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    if (post.acceptedAnswer && post.acceptedAnswer.toString() === commentId.toString()) {
       post.acceptedAnswer = null;
       comment.isAccepted = false;
       
       if (comment.user.toString() !== userId.toString()) {
           await User.findByIdAndUpdate(comment.user, { $inc: { reputation: -10 } });
       }
    } else {
       if (post.acceptedAnswer) {
           const oldComment = post.comments.id ? post.comments.id(post.acceptedAnswer) : post.comments.find(c => c._id.toString() === post.acceptedAnswer.toString());
           if (oldComment) {
               oldComment.isAccepted = false;
               if (oldComment.user.toString() !== userId.toString()) {
                   await User.findByIdAndUpdate(oldComment.user, { $inc: { reputation: -10 } });
               }
           }
       }
       post.acceptedAnswer = commentId;
       comment.isAccepted = true;

       if (comment.user.toString() !== userId.toString()) {
           await User.findByIdAndUpdate(comment.user, { $inc: { reputation: 10 } });
       }
    }

    await post.save();
    await post.populate('user', 'name avatar reputation');
    await post.populate('comments.user', 'name avatar reputation');
    return {
        post,
        comments: post.comments
    };
  } catch (error) {
    if (error.kind === 'ObjectId') {
      const invalidIdError = new Error('Định dạng ID hợp lệ');
      invalidIdError.statusCode = 400;
      throw invalidIdError;
    }
    throw error;
  }
};

// Phê duyệt bình luận (Upvote / Approve Comment)
const approveComment = async (postId, commentId, userId) => {
  try {
    const post = await Post.findById(postId);
    if (!post) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    const comment = post.comments.id ? post.comments.id(commentId) : post.comments.find(c => c._id.toString() === commentId.toString());
    if (!comment) {
      const error = new Error('Bình luận không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    if (!comment.approvals) comment.approvals = [];
    if (!comment.disapprovals) comment.disapprovals = [];

    const approvedIndex = comment.approvals.findIndex(
      (app) => app.user.toString() === userId.toString()
    );
    const disapprovedIndex = comment.disapprovals.findIndex(
      (dis) => dis.user.toString() === userId.toString()
    );

    let reputationChange = 0;

    if (approvedIndex === -1) {
      comment.approvals.push({ user: userId });
      reputationChange += 10;

      if (disapprovedIndex !== -1) {
        comment.disapprovals.splice(disapprovedIndex, 1);
        reputationChange += 10; // Hủy downvote cũ, hoàn lại điểm
      }
    } else {
      comment.approvals.splice(approvedIndex, 1);
      reputationChange -= 10;
    }

    await post.save();

    if (comment.user && comment.user.toString() !== userId.toString() && reputationChange !== 0) {
      await User.findByIdAndUpdate(comment.user, {
        $inc: { reputation: reputationChange }
      });
    }

    await post.populate('comments.user', 'name avatar reputation');
    return post.comments;
  } catch (error) {
    throw error;
  }
};

// Phản đối bình luận (Downvote / Disapprove Comment)
const disapproveComment = async (postId, commentId, userId) => {
  console.log(`[postService.disapproveComment] Khởi tạo. Post: ${postId}, Comment: ${commentId}, User: ${userId}`);
  try {
    const post = await Post.findById(postId);
    if (!post) {
      console.log(`[postService.disapproveComment] LỖI: Không tìm thấy bài viết ${postId}`);
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    const comment = post.comments.id ? post.comments.id(commentId) : post.comments.find(c => c._id.toString() === commentId.toString());
    if (!comment) {
      const error = new Error('Bình luận không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    if (!comment.approvals) comment.approvals = [];
    if (!comment.disapprovals) comment.disapprovals = [];

    const approvedIndex = comment.approvals.findIndex(
      (app) => app.user.toString() === userId.toString()
    );
    const disapprovedIndex = comment.disapprovals.findIndex(
      (dis) => dis.user.toString() === userId.toString()
    );

    let reputationChange = 0;

    if (disapprovedIndex === -1) {
      comment.disapprovals.push({ user: userId });
      reputationChange -= 10;

      if (approvedIndex !== -1) {
        comment.approvals.splice(approvedIndex, 1);
        reputationChange -= 10; // Hủy upvote cũ, trừ thêm điểm
      }
    } else {
      comment.disapprovals.splice(disapprovedIndex, 1);
      reputationChange += 10; // Hủy downvote, cộng lại điểm
    }

    await post.save();

    if (comment.user && comment.user.toString() !== userId.toString() && reputationChange !== 0) {
      await User.findByIdAndUpdate(comment.user, {
        $inc: { reputation: reputationChange }
      });
    }

    await post.populate('comments.user', 'name avatar reputation');
    return post.comments;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createPost,
  getPostById,
  getAllPosts,
  getTopTrendingPosts,
  toggleSavePost,
  getSavedPosts,
  toggleLikePost,
  addComment,
  updatePost,
  deletePost,
  toggleHidePost,
  getHiddenPosts,
  getUserPosts,
  updateComment,
  deleteComment,
  acceptAnswer,
  approveComment,
  disapproveComment,
};