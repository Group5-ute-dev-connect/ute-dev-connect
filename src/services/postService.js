const Post = require('../models/Post');
const User = require('../models/User');
const Group = require('../models/Group');

const createPost = async (userId, text, isQuestion = false, groupId = null, codeSnippet = '', codeLanguage = 'javascript', visibility = 'public') => {
  try {
    // Lọc nội dung cấm hoặc AI
    const filterService = require('./filterService');
    await filterService.checkContent(text);
    if (codeSnippet) {
      await filterService.checkContent(codeSnippet);
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      const error = new Error('Người dùng không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    let status = 'approved';
    if (groupId) {
      const group = await Group.findById(groupId);
      if (group) {
        const isAdmin = group.admin.toString() === userId.toString();
        const isMod = group.moderators && group.moderators.some(m => m.toString() === userId.toString());
        if (!isAdmin && !isMod) {
          status = 'pending';
        }
      }
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
    return post;
  } catch (error) {
    throw error;
  }
};

const getPostById = async (postId, currentUserId = null) => {
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

const getAllPosts = async (page = 1, limit = 5, currentUserId = null) => {
  try {
    const skip = (page - 1) * limit;

    let filter = { 
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

    // Lọc nội dung cấm hoặc AI
    const filterService = require('./filterService');
    await filterService.checkContent(normalizedText);
    if (codeSnippet) {
      await filterService.checkContent(codeSnippet);
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
    // Lọc nội dung cấm hoặc AI
    const filterService = require('./filterService');
    if (text !== undefined) {
      await filterService.checkContent(text);
    }
    if (codeSnippet !== undefined) {
      await filterService.checkContent(codeSnippet);
    }

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

    post.text = text !== undefined ? text : post.text;
    post.isQuestion = isQuestion !== undefined ? isQuestion : post.isQuestion;
    post.codeSnippet = codeSnippet !== undefined ? codeSnippet : post.codeSnippet;
    post.codeLanguage = codeLanguage !== undefined ? codeLanguage : post.codeLanguage;
    post.visibility = visibility !== undefined ? visibility : post.visibility;
    
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

// Xóa bài viết
const deletePost = async (postId, userId) => {
  try {
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }
    
    if (post.user.toString() !== userId.toString()) {
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