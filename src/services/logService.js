const SystemLog = require('../models/SystemLog');

const createLog = async (type, action, userId, postId = null, groupId = null, commentId = null, details = {}) => {
  try {
    const log = new SystemLog({
      type,
      action,
      user: userId,
      post: postId,
      group: groupId,
      commentId,
      details
    });
    await log.save();
    return log;
  } catch (error) {
    console.error("Error creating system log:", error);
  }
};

const getLogs = async (filters = {}, page = 1, limit = 20) => {
  try {
    const query = {};
    if (filters.type) query.type = filters.type;
    if (filters.action) query.action = filters.action;

    // Date range filter
    if (filters.startDate || filters.endDate) {
      query.date = {};
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    // Search query matching User info or action details/text
    if (filters.search) {
      const searchRegex = new RegExp(filters.search, 'i');
      
      // Since user is populated, we can first query Users matching the search query
      const User = require('../models/User');
      const matchingUsers = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { studentId: searchRegex }
        ]
      }).select('_id');
      
      const userIds = matchingUsers.map(u => u._id);
      
      query.$or = [
        { user: { $in: userIds } },
        { 'details.text': searchRegex },
        { 'details.commentText': searchRegex },
        { 'details.name': searchRegex }
      ];
    }

    const skip = (page - 1) * limit;
    const logs = await SystemLog.find(query)
      .populate('user', 'name avatar email studentId role')
      .populate({
        path: 'post',
        select: 'text user name avatar isDeleted'
      })
      .populate({
        path: 'group',
        select: 'name description isActive'
      })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SystemLog.countDocuments(query);

    return { 
      logs, 
      total, 
      page, 
      pages: Math.ceil(total / limit) 
    };
  } catch (error) {
    console.error("Error fetching system logs:", error);
    throw error;
  }
};

module.exports = {
  createLog,
  getLogs
};
