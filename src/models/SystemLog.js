const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SystemLogSchema = new Schema({
  type: {
    type: String,
    enum: ['like', 'comment', 'post', 'group'],
    required: true
  },
  action: {
    type: String,
    enum: ['like', 'unlike', 'create', 'update', 'delete', 'join', 'leave'],
    required: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  post: {
    type: Schema.Types.ObjectId,
    ref: 'post',
    default: null
  },
  group: {
    type: Schema.Types.ObjectId,
    ref: 'group',
    default: null
  },
  commentId: {
    type: Schema.Types.ObjectId,
    default: null
  },
  details: {
    type: Schema.Types.Mixed,
    default: {}
  },
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('systemLog', SystemLogSchema);
