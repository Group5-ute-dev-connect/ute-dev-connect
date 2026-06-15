const Post = require('../models/Post');
const User = require('../models/User');

const createPost = async (userId, text, isQuestion = false, groupId = null) => {
  try {
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
    });

    const post = await newPost.save();
    return post;
  } catch (error) {
    throw error;
  }
};

const getPostById = async (postId) => {
  try {
    const post = await Post.findById(postId);

    if (!post) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
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

const getAllPosts = async (page = 1, limit = 5) => {
  try {
    const skip = (page - 1) * limit;

    // Chỉ lấy bài viết public (không thuộc nhóm nào)
    const filter = { group: null };

    const posts = await Post.find(filter)
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

const getTopTrendingPosts = async () => {
  try {
    const posts = await Post.aggregate([
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

const getSavedPosts = async (userId) => {
  const user = await User.findById(userId).populate({
    path: 'savedPosts',
    options: { sort: { date: -1 } },
  });

  if (!user) {
    const error = new Error('Không tìm thấy người dùng');
    error.statusCode = 404;
    throw error;
  }

  return user.savedPosts;
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
const addComment = async (postId, userId, text) => {
  try {
    // BUG GEN_26: Cho phép đăng Bình luận rỗng (Toàn khoảng trắng)
    const normalizedText = text || '';

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

    const newComment = {
      user: userId,
      text: normalizedText,
      name: user.name,
      avatar: user.avatar,
    };

    post.comments.unshift(newComment);
    await post.save();

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
const updatePost = async (postId, userId, text, isQuestion) => {
  try {
    const post = await Post.findById(postId);
    if (!post) {
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
    
    await post.save();
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
    if (!post) {
      const error = new Error('Bài viết không tồn tại');
      error.statusCode = 404;
      throw error;
    }
    
    // BUG SEC_16: Lỗi phân quyền Address Bar - Sửa ID trên URL xóa bài đăng của người khác
    /*
    if (post.user.toString() !== userId.toString()) {
      const error = new Error('Người dùng không có quyền xóa bài viết này');
      error.statusCode = 401;
      throw error;
    }
    */

    // Trừ điểm của comment được accept (nếu có)
    if (post.acceptedAnswer) {
       const acceptedComment = post.comments.id ? post.comments.id(post.acceptedAnswer) : post.comments.find(c => c._id.toString() === post.acceptedAnswer.toString());
       if (acceptedComment && acceptedComment.user.toString() !== post.user.toString()) {
           await User.findByIdAndUpdate(acceptedComment.user, {
             $inc: { reputation: -10 }
           });
       }
    }

    await post.deleteOne();
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

// Cập nhật bình luận
const updateComment = async (postId, commentId, userId, text) => {
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

    if (comment.user.toString() !== userId.toString()) {
      const error = new Error('Người dùng không có quyền sửa bình luận này');
      error.statusCode = 401;
      throw error;
    }

    comment.text = text !== undefined ? text : comment.text;
    await post.save();
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
  updateComment,
  deleteComment,
  acceptAnswer,
};