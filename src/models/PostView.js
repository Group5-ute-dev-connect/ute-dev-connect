const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PostViewSchema = new Schema({
  post: {
    type: Schema.Types.ObjectId,
    ref: 'post',
    required: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    default: null
  },
  ip: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
});

// Index to optimize lookup and cooldown checks
PostViewSchema.index({ post: 1, date: -1 });
PostViewSchema.index({ post: 1, user: 1, date: -1 });
PostViewSchema.index({ post: 1, ip: 1, date: -1 });

module.exports = mongoose.model('postView', PostViewSchema);
