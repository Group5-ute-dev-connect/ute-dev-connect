const User = require('../models/User');
const Post = require('../models/Post');
const Group = require('../models/Group');
const Filter = require('../models/Filter');
const Profile = require('../models/Profile');

// Helper to fill in dates with 0 counts for chart rendering
const fillMissingDates = (statsArray, startDate, endDate) => {
  const dateMap = new Map();
  statsArray.forEach(item => {
    dateMap.set(item._id, item.count);
  });

  const result = [];
  const current = new Date(startDate);
  const targetEnd = new Date(endDate);

  // Set hours to 0 to avoid timezone rolling issues during comparison
  current.setHours(0, 0, 0, 0);
  targetEnd.setHours(0, 0, 0, 0);

  // Limit loop to prevent infinite loops in case of extreme input
  let safetyCounter = 0;
  while (current <= targetEnd && safetyCounter < 366) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    result.push({
      date: dateStr,
      count: dateMap.get(dateStr) || 0
    });
    
    current.setDate(current.getDate() + 1);
    safetyCounter++;
  }
  return result;
};

const getSystemStats = async (req, res) => {
  try {
    // 1. Parse date parameters
    let { startDate, endDate, preset } = req.query;
    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      
      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ success: false, message: 'Định dạng ngày bắt đầu hoặc kết thúc không hợp lệ' });
      }
      if (start > end) {
        return res.status(400).json({ success: false, message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc' });
      }
    } else {
      // Handle presets: 7d (default), 30d
      const days = preset === '30d' ? 30 : 7;
      end = new Date();
      start = new Date();
      start.setDate(end.getDate() - days + 1); // include today
    }

    // Set time boundaries
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // 2. Overview metrics (all-time totals)
    const totalUsers = await User.countDocuments();
    const totalPosts = await Post.countDocuments({ isDeleted: { $ne: true } });
    const totalGroups = await Group.countDocuments({ isActive: true });
    
    // Sum total comments across all non-deleted posts
    const commentsAgg = await Post.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $project: { commentsCount: { $size: { $ifNull: ['$comments', []] } } } },
      { $group: { _id: null, total: { $sum: '$commentsCount' } } }
    ]);
    const totalComments = commentsAgg[0]?.total || 0;

    // Moderation queue and rules
    const pendingPosts = await Post.countDocuments({ status: 'pending', isDeleted: { $ne: true } });
    const filterConfig = await Filter.findOne();
    const bannedWordsCount = filterConfig?.bannedWords?.length || 0;

    // 3. Growth data aggregated daily within the date range
    const newUsersStats = await User.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const newPostsStats = await Post.aggregate([
      { $match: { date: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const newGroupsStats = await Group.aggregate([
      { $match: { date: { $gte: start, $lte: end }, isActive: true } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill missing days to ensure a continuous timeline for charts
    const usersTimeline = fillMissingDates(newUsersStats, start, end);
    const postsTimeline = fillMissingDates(newPostsStats, start, end);
    const groupsTimeline = fillMissingDates(newGroupsStats, start, end);

    // 4. Leaderboards / Top entities
    // Top 5 members by reputation
    const topUsers = await User.find()
      .sort({ reputation: -1 })
      .limit(5)
      .select('name email avatar reputation role date');

    // Top 5 groups by member count
    const topGroups = await Group.aggregate([
      { $match: { isActive: true } }
      ,{ $project: { name: 1, membersCount: { $size: { $ifNull: ['$members', []] } }, admin: 1, tags: 1 } }
      ,{ $sort: { membersCount: -1 } }
      ,{ $limit: 5 }
      ,{ $lookup: { from: 'users', localField: 'admin', foreignField: '_id', as: 'adminUser' } }
      ,{ $unwind: { path: '$adminUser', preserveNullAndEmptyArrays: true } }
      ,{ $project: { name: 1, membersCount: 1, tags: 1, adminName: '$adminUser.name', adminAvatar: '$adminUser.avatar' } }
    ]);

    // Top 5 posts by views and likes count
    const topPosts = await Post.aggregate([
      { $match: { isDeleted: { $ne: true } } }
      ,{
        $project: {
          text: 1,
          views: { $ifNull: ['$views', 0] },
          likesCount: { $size: { $ifNull: ['$likes', []] } },
          commentsCount: { $size: { $ifNull: ['$comments', []] } },
          user: 1
        }
      }
      ,{ $sort: { views: -1, likesCount: -1 } }
      ,{ $limit: 5 }
      ,{ $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'postUser' } }
      ,{ $unwind: { path: '$postUser', preserveNullAndEmptyArrays: true } }
      ,{ $project: { text: 1, views: 1, likesCount: 1, commentsCount: 1, userName: '$postUser.name', userAvatar: '$postUser.avatar' } }
    ]);

    // 5. Advanced statistics
    // Faculty distribution
    const facultyDistribution = await Profile.aggregate([
      { $match: { faculty: { $exists: true, $ne: '' } } }
      ,{
        $group: {
          _id: '$faculty',
          count: { $sum: 1 }
        }
      }
      ,{ $sort: { count: -1 } }
    ]);

    // Top 10 skills
    const skillsDistribution = await Profile.aggregate([
      { $match: { skills: { $exists: true, $ne: null } } }
      ,{ $unwind: '$skills' }
      ,{
        $group: {
          _id: { $toLower: { $trim: { input: '$skills' } } },
          count: { $sum: 1 }
        }
      }
      ,{ $sort: { count: -1 } }
      ,{ $limit: 10 }
    ]);

    // Top 10 coding languages in posts
    const languagesDistribution = await Post.aggregate([
      { $match: { isDeleted: { $ne: true }, codeLanguage: { $exists: true, $ne: '' } } }
      ,{
        $group: {
          _id: '$codeLanguage',
          count: { $sum: 1 }
        }
      }
      ,{ $sort: { count: -1 } }
      ,{ $limit: 10 }
    ]);

    // Q&A Stats
    const totalQuestions = await Post.countDocuments({ isQuestion: true, isDeleted: { $ne: true } });
    const solvedQuestions = await Post.countDocuments({ isQuestion: true, acceptedAnswer: { $ne: null }, isDeleted: { $ne: true } });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalUsers,
          totalPosts,
          totalGroups,
          totalComments,
          pendingPosts,
          bannedWordsCount
        },
        growth: {
          newUsers: usersTimeline,
          newPosts: postsTimeline,
          newGroups: groupsTimeline
        },
        leaderboards: {
          topUsers,
          topGroups,
          topPosts
        },
        advanced: {
          facultyDistribution,
          skillsDistribution,
          languagesDistribution,
          qaStats: {
            totalQuestions,
            solvedQuestions
          }
        }
      }
    });

  } catch (err) {
    console.error('Lỗi khi lấy thống kê admin:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server khi tổng hợp dữ liệu thống kê' });
  }
};

module.exports = {
  getSystemStats
};
