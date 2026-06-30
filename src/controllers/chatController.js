const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const mongoose = require('mongoose');

// Lấy danh sách phòng chat của user hiện tại
exports.getConversations = async (req, res) => {
  try {
    const objectId = new mongoose.Types.ObjectId(req.user.id);
    
    const conversations = await Conversation.find({
      participants: { $in: [objectId] }
    })
      .populate('participants', 'name avatar email')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.status(200).json(conversations);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách phòng chat:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

// Lấy lịch sử tin nhắn của một phòng chat
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const objectId = new mongoose.Types.ObjectId(req.user.id);

    // Kiểm tra xem phòng chat có tồn tại và user có nằm trong phòng đó không
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: objectId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập hoặc phòng chat không tồn tại' });
    }

    // Tự động đánh dấu đã đọc các tin nhắn nhận được
    await Message.updateMany(
      { conversationId, sender: { $ne: objectId }, isRead: false },
      { $set: { isRead: true } }
    );

    const messages = await Message.find({ conversationId })
      .populate('sender', 'name avatar')
      .sort({ createdAt: 1 }); // Xếp từ cũ đến mới để dễ hiển thị trên UI

    res.status(200).json(messages);
  } catch (error) {
    console.error('Lỗi khi lấy lịch sử tin nhắn:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

// Tạo hoặc lấy phòng chat 1-1 với một user khác
exports.createOrGetConversation = async (req, res) => {
  try {
    const { userId } = req.params; // ID của người muốn chat cùng
    const currentUserId = req.user.id;
    const objectCurrentId = new mongoose.Types.ObjectId(currentUserId);
    const objectUserId = new mongoose.Types.ObjectId(userId);

    // Kiểm tra xem đã có conversation giữa 2 người chưa
    let conversation = await Conversation.findOne({
      participants: { $all: [objectCurrentId, objectUserId] }
    }).populate('participants', 'name avatar email');

    if (!conversation) {
      // Nếu chưa có, tạo mới
      conversation = new Conversation({
        participants: [objectCurrentId, objectUserId]
      });
      await conversation.save();
      
      // Populate thông tin participant sau khi lưu
      conversation = await Conversation.findById(conversation._id).populate('participants', 'name avatar email');
    }

    res.status(200).json(conversation);
  } catch (error) {
    console.error('Lỗi khi tạo/lấy phòng chat:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

// Tải lên tệp tin hoặc hình ảnh đính kèm
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không có tệp nào được tải lên' });
    }

    // Trả về fileUrl tĩnh
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    // Nhận diện fileType
    let fileType = 'file';
    if (req.file.mimetype.startsWith('image/')) {
      fileType = 'image';
    }

    res.status(200).json({
      success: true,
      fileUrl,
      fileName: req.file.originalname,
      fileType
    });
  } catch (error) {
    console.error('Lỗi khi tải tệp tin lên:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};
