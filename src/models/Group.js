const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GroupSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  avatar: {
    type: String,
    default: ''
  },
  // Người tạo nhóm / quản trị viên
  admin: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  // Danh sách kiểm duyệt viên
  moderators: [
    {
      type: Schema.Types.ObjectId,
      ref: 'user'
    }
  ],
  // Danh sách thành viên (bao gồm cả admin)
  members: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'user'
      },
      joinedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  joinRequests: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'user'
      },
      requestedAt: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
      }
    }
  ],
  // Tag công nghệ của nhóm (vd: 'react', 'nodejs')
  tags: {
    type: [String],
    default: []
  },
  // Soft delete: isActive = false thay vì xóa thật
  isActive: {
    type: Boolean,
    default: true
  },
  // Bộ lọc từ cấm riêng của nhóm học tập
  bannedWords: {
    type: [String],
    default: []
  },
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('group', GroupSchema);
