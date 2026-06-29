const profileService = require('../services/profileService');
const User = require('../models/User');
const Post = require('../models/Post');
const notificationService = require('../services/notificationService');
const { uploadToCloudinary } = require('../utils/cloudinary');
const fs = require('fs');

/**
 * Controller: Cập nhật hoặc tạo mới hồ sơ người dùng (Edit Profile)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const editProfile = async (req, res) => {
    try {
        // Lấy userId từ req.user (đã được gán bởi authMiddleware)
        const userId = req.user.id;

        // Trích xuất các trường từ body request
        const {
            faculty, classCode, company, website, location, status, skills, bio, githubusername,
            youtube, twitter, facebook, linkedin, instagram
        } = req.body;

        // Xây dựng object profileFields để lưu vào database
        const profileFields = {};
        profileFields.user = userId; // Gán ID user

        if (faculty) profileFields.faculty = faculty;
        if (classCode) profileFields.classCode = classCode;
        if (company) profileFields.company = company;
        if (website) profileFields.website = website;
        if (location) profileFields.location = location;
        if (status) profileFields.status = status;
        if (bio) profileFields.bio = bio;
        if (githubusername) profileFields.githubusername = githubusername;

        // Xử lý mảng skills: chia chuỗi thành mảng bằng dấu phẩy và xóa khoảng trắng 2 đầu
        if (skills) {
            profileFields.skills = Array.isArray(skills) 
                ? skills 
                : skills.split(',').map(skill => skill.trim());
        }

        // Xây dựng object social
        profileFields.social = {};
        if (youtube) profileFields.social.youtube = youtube;
        if (twitter) profileFields.social.twitter = twitter;
        if (facebook) profileFields.social.facebook = facebook;
        if (linkedin) profileFields.social.linkedin = linkedin;
        if (instagram) profileFields.social.instagram = instagram;

        // Gọi hàm từ Service để xử lý logic update/create
        const profile = await profileService.updateUserProfile(userId, profileFields);

        // Trả về JSON status 200 kèm dữ liệu profile
        return res.status(200).json(profile);
    } catch (error) {
        console.error('Lỗi ở editProfile controller:', error.message);
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Lấy hồ sơ của người dùng hiện tại
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const getCurrentProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`[getCurrentProfile] Bắt đầu lấy profile cho user: ${userId}`);
        const profile = await profileService.getProfileByUserId(userId);

        if (!profile) {
            console.log(`[getCurrentProfile] Không tìm thấy profile cho user: ${userId}`);
            return res.status(404).json({ msg: 'Không tìm thấy hồ sơ cho người dùng này' });
        }

        console.log(`[getCurrentProfile] Đã tìm thấy profile, trả về data.`);
        return res.status(200).json(profile);
    } catch (error) {
        console.error('Lỗi ở getCurrentProfile controller:', error.message);
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Lấy tất cả hồ sơ người dùng
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const getAllProfiles = async (req, res) => {
    try {
        const profiles = await profileService.getAllProfiles();
        return res.status(200).json(profiles);
    } catch (error) {
        console.error('Lỗi ở getAllProfiles controller:', error.message);
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Lấy hồ sơ người dùng theo ID
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const getProfileById = async (req, res) => {
    try {
        const profile = await profileService.getProfileByUserId(req.params.user_id);

        if (!profile) {
            return res.status(404).json({ msg: 'Không tìm thấy hồ sơ cho người dùng này' });
        }

        return res.status(200).json(profile);
    } catch (error) {
        console.error('Lỗi ở getProfileById controller:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Không tìm thấy hồ sơ cho người dùng này' });
        }
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Lấy top 10 lập trình viên nổi bật
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const getTopDevelopers = async (req, res) => {
    try {
        const developers = await profileService.getTopDevelopers();
        return res.status(200).json(developers);
    } catch (error) {
        console.error('Lỗi ở getTopDevelopers controller:', error.message);
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Follow người dùng
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const followUser = async (req, res) => {
    try {
        const userIdToFollow = req.params.user_id;
        const loggedInUserId = req.user.id;

        if (userIdToFollow === loggedInUserId) {
            return res.status(400).json({ msg: 'Bạn không thể tự theo dõi chính mình' });
        }

        const userToFollow = await User.findById(userIdToFollow);
        const loggedInUser = await User.findById(loggedInUserId);

        if (!userToFollow || !loggedInUser) {
            return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        }

        // Kiểm tra xem đã follow chưa
        if (userToFollow.followers.filter(follower => follower.user.toString() === loggedInUserId).length > 0) {
            return res.status(400).json({ msg: 'Bạn đã theo dõi người dùng này rồi' });
        }

        // Thêm vào mảng bằng updateOne để tránh lỗi validation ở các field cũ (như studentId)
        await User.updateOne(
            { _id: userIdToFollow },
            { $push: { followers: { $each: [{ user: loggedInUserId }], $position: 0 } } }
        );

        await User.updateOne(
            { _id: loggedInUserId },
            { $push: { following: { $each: [{ user: userIdToFollow }], $position: 0 } } }
        );

        // Trả về data mới
        userToFollow.followers.unshift({ user: loggedInUserId });
        loggedInUser.following.unshift({ user: userIdToFollow });

        // Tạo thông báo khi có người theo dõi
        await notificationService.createNotification(userIdToFollow, loggedInUserId, 'follow');

        return res.status(200).json({ followers: userToFollow.followers, following: loggedInUser.following });
    } catch (error) {
        console.error('Lỗi ở followUser controller:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        }
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Unfollow người dùng
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const unfollowUser = async (req, res) => {
    try {
        const userIdToUnfollow = req.params.user_id;
        const loggedInUserId = req.user.id;

        const userToUnfollow = await User.findById(userIdToUnfollow);
        const loggedInUser = await User.findById(loggedInUserId);

        if (!userToUnfollow || !loggedInUser) {
            return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        }

        // Kiểm tra xem đã follow chưa
        if (userToUnfollow.followers.filter(follower => follower.user.toString() === loggedInUserId).length === 0) {
            return res.status(400).json({ msg: 'Bạn chưa theo dõi người dùng này' });
        }

        // Xóa khỏi mảng bằng updateOne
        await User.updateOne(
            { _id: userIdToUnfollow },
            { $pull: { followers: { user: loggedInUserId } } }
        );

        await User.updateOne(
            { _id: loggedInUserId },
            { $pull: { following: { user: userIdToUnfollow } } }
        );

        // Cập nhật mảng local để trả về
        userToUnfollow.followers = userToUnfollow.followers.filter(
            follower => follower.user.toString() !== loggedInUserId
        );
        loggedInUser.following = loggedInUser.following.filter(
            following => following.user.toString() !== userIdToUnfollow
        );

        return res.status(200).json({ followers: userToUnfollow.followers, following: loggedInUser.following });
    } catch (error) {
        console.error('Lỗi ở unfollowUser controller:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        }
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Lấy danh sách người theo dõi của một user
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const getFollowers = async (req, res) => {
    try {
        const user = await User.findById(req.params.user_id).populate('followers.user', ['name', 'avatar', 'studentId']);
        if (!user) return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        return res.status(200).json(user.followers);
    } catch (error) {
        console.error('Lỗi ở getFollowers controller:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        }
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Lấy danh sách đang theo dõi của một user
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const getFollowing = async (req, res) => {
    try {
        const user = await User.findById(req.params.user_id).populate('following.user', ['name', 'avatar', 'studentId']);
        if (!user) return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        return res.status(200).json(user.following);
    } catch (error) {
        console.error('Lỗi ở getFollowing controller:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        }
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Cập nhật ảnh đại diện của user (Cloudinary hoặc Local Fallback)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const updateAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ msg: 'Vui lòng chọn hình ảnh để tải lên' });
        }

        const userId = req.user.id;
        let avatarUrl = '';

        // Tải ảnh lên Cloudinary
        try {
            const cloudinaryUrl = await uploadToCloudinary(req.file.path, 'avatars');
            if (cloudinaryUrl) {
                avatarUrl = cloudinaryUrl;
            } else {
                // Fallback: Nếu uploadToCloudinary trả về null (do không có cấu hình Cloudinary), dùng ảnh lưu local
                avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
            }
        } catch (uploadError) {
            console.error('Lỗi khi tải ảnh lên Cloudinary, chuyển sang dùng Local Fallback...', uploadError);
            avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        }

        // Cập nhật trường avatar trong bảng User
        const user = await User.findByIdAndUpdate(
            userId,
            { avatar: avatarUrl },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ msg: 'Không tìm thấy người dùng' });
        }

        // ĐỒNG BỘ: Cập nhật ảnh đại diện trong tất cả bài đăng của user này
        await Post.updateMany(
            { user: userId },
            { $set: { avatar: avatarUrl } }
        );

        // ĐỒNG BỘ: Cập nhật ảnh đại diện trong tất cả bình luận của user này
        await Post.updateMany(
            { "comments.user": userId },
            { $set: { "comments.$[elem].avatar": avatarUrl } },
            { arrayFilters: [{ "elem.user": userId }] }
        );

        return res.status(200).json({
            msg: 'Cập nhật ảnh đại diện thành công',
            avatar: user.avatar,
            user
        });
    } catch (error) {
        console.error('Lỗi ở updateAvatar controller:', error.message);
        // Dọn dẹp file tạm trên local nếu có lỗi xảy ra và file vẫn tồn tại
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (err) {
                console.error('Lỗi khi xóa file tạm:', err);
            }
        }
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

/**
 * Controller: Xóa ảnh đại diện của user (quay về mặc định)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const deleteAvatar = async (req, res) => {
    try {
        const userId = req.user.id;
        const defaultAvatarUrl = '';

        // Cập nhật trường avatar trong bảng User thành rỗng
        const user = await User.findByIdAndUpdate(
            userId,
            { avatar: defaultAvatarUrl },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ msg: 'Không tìm thấy người dùng' });
        }

        // ĐỒNG BỘ: Cập nhật ảnh đại diện trong tất cả bài đăng của user này
        await Post.updateMany(
            { user: userId },
            { $set: { avatar: defaultAvatarUrl } }
        );

        // ĐỒNG BỘ: Cập nhật ảnh đại diện trong tất cả bình luận của user này
        await Post.updateMany(
            { "comments.user": userId },
            { $set: { "comments.$[elem].avatar": defaultAvatarUrl } },
            { arrayFilters: [{ "elem.user": userId }] }
        );

        return res.status(200).json({
            msg: 'Xóa ảnh đại diện thành công',
            avatar: user.avatar,
            user
        });
    } catch (error) {
        console.error('Lỗi ở deleteAvatar controller:', error.message);
        return res.status(500).json({ msg: 'Lỗi máy chủ (Server Error)' });
    }
};

module.exports = {
    editProfile,
    getCurrentProfile,
    getAllProfiles,
    getProfileById,
    getTopDevelopers,
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    updateAvatar,
    deleteAvatar
};

