const User = require('../models/User');
const Post = require('../models/Post');
const Group = require('../models/Group');
const Message = require('../models/Message');

const adminController = {
  getStats: async (req, res) => {
    try {
      // Execute all count queries in parallel for better performance
      const [totalUsers, totalPosts, totalGroups, totalMessages] = await Promise.all([
        User.countDocuments(),
        Post.countDocuments(),
        Group.countDocuments(),
        Message.countDocuments()
      ]);

      return res.status(200).json({
        success: true,
        data: {
          totalUsers,
          totalPosts,
          totalGroups,
          totalMessages
        }
      });
    } catch (error) {
      console.error('Lỗi khi lấy thống kê admin:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy dữ liệu thống kê'
      });
    }
  },

  getUsers: async (req, res) => {
    try {
      const users = await User.find().select('-password').sort({ date: -1 });
      return res.status(200).json({ success: true, data: users });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách user:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
      }
      
      // Có thể xóa thêm bài viết của user ở đây nếu cần (tùy chọn)
      await Post.deleteMany({ user: userId });
      await User.findByIdAndDelete(userId);

      return res.status(200).json({ success: true, message: 'Đã xóa người dùng thành công' });
    } catch (error) {
      console.error('Lỗi khi xóa user:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  },

  getPosts: async (req, res) => {
    try {
      const posts = await Post.find().populate('user', ['name', 'avatar']).sort({ date: -1 });
      return res.status(200).json({ success: true, data: posts });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách post:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  },

  deletePost: async (req, res) => {
    try {
      const postId = req.params.id;
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
      }

      await Post.findByIdAndDelete(postId);
      return res.status(200).json({ success: true, message: 'Đã xóa bài viết thành công' });
    } catch (error) {
      console.error('Lỗi khi xóa post:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
};

module.exports = adminController;
