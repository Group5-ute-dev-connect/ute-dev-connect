const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PostSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'user'
  },
  text: {
    type: String,
    required: true
  },
  codeSnippet: {
    type: String
  },
  codeLanguage: {
    type: String,
    default: 'javascript'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  tags: {
    type: [String],
    default: []
  },
  group: {
    type: Schema.Types.ObjectId,
    ref: 'group',
    default: null
  },
  name: {
    type: String
  },
  avatar: {
    type: String
  },
  isQuestion: {
    type: Boolean,
    default: false
  },
  acceptedAnswer: {
    type: Schema.Types.ObjectId,
    default: null
  },
  visibility: {
    type: String,
    enum: ['public', 'personal', 'followers', 'friends'],
    default: 'public'
  },
  isHidden: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  likes: [
    {
      user: {
        type: Schema.Types.ObjectId
      }
    }
  ],
  comments: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'user'
      },
      text: {
        type: String,
        required: true
      },
      codeSnippet: {
        type: String,
        default: ''
      },
      codeLanguage: {
        type: String,
        default: 'javascript'
      },
      approvals: [
        {
          user: {
            type: Schema.Types.ObjectId,
            ref: 'user'
          }
        }
      ],
      disapprovals: [
        {
          user: {
            type: Schema.Types.ObjectId,
            ref: 'user'
          }
        }
      ],
      name: {
        type: String
      },
      avatar: {
        type: String
      },
      date: {
        type: Date,
        default: Date.now
      },
      isAccepted: {
        type: Boolean,
        default: false
      }
    }
  ],
  date: {
    type: Date,
    default: Date.now
  }
});

// Helper to sort comments by: 1. Accepted answer, 2. Net score (approvals - disapprovals) descending
const sortPostComments = (post) => {
  if (post && post.comments && Array.isArray(post.comments)) {
    post.comments.sort((a, b) => {
      // 1. Accepted answer first
      if (a.isAccepted && !b.isAccepted) return -1;
      if (!a.isAccepted && b.isAccepted) return 1;

      // 2. Net score (approvals - disapprovals) descending
      const aScore = (a.approvals?.length || 0) - (a.disapprovals?.length || 0);
      const bScore = (b.approvals?.length || 0) - (b.disapprovals?.length || 0);
      return bScore - aScore;
    });
  }
};

PostSchema.post('find', function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(doc => sortPostComments(doc));
  }
});

PostSchema.post('findOne', function(doc) {
  sortPostComments(doc);
});

PostSchema.post('findOneAndUpdate', function(doc) {
  sortPostComments(doc);
});

PostSchema.post('save', function(doc) {
  sortPostComments(doc);
});

// Text index cho Full-text search (chỉ được có 1 text index per collection)
PostSchema.index({ text: 'text', tags: 'text' });

module.exports = mongoose.model('post', PostSchema);
