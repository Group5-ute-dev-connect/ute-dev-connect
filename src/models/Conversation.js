const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    isGroup: {
      type: Boolean,
      default: false
    },
    chatName: {
      type: String,
      trim: true
    },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conversation', conversationSchema);
