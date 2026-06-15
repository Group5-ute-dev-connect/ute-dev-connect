const User = require('../models/User');
const Profile = require('../models/Profile');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const redisClient = require('../config/redis');

// Cấu hình Nodemailer gửi email (Bạn cần thiết lập biến môi trường EMAIL_USER, EMAIL_PASS)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendRegisterOtpEmail = async (email, name, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Mã OTP kích hoạt tài khoản (UTE Social Network)',
    text: `Chào ${name},

Mã OTP kích hoạt tài khoản của bạn là: ${otp}

Mã này sẽ hết hạn trong 15 phút.
Nếu bạn không thực hiện đăng ký tài khoản, vui lòng bỏ qua email này.

Trân trọng,
UTE Social Network`
  };

  await transporter.sendMail(mailOptions);
};

const handleForgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Email không tồn tại trong hệ thống!');

  // Tạo mã OTP 6 số ngẫu nhiên
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Hash OTP trước khi lưu vào Redis (Bảo mật)
  const salt = await bcrypt.genSalt(10);
  const hashedOtp = await bcrypt.hash(otp, salt);

  // Lưu OTP đã hash vào Redis với thời hạn 15 phút (900 giây)
  const TTL_IN_SECONDS = 15 * 60;
  await redisClient.setEx(`pwdResetOTP:${email}`, TTL_IN_SECONDS, hashedOtp);

  // Gửi email
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Mã OTP khôi phục mật khẩu (UTE Social Network)',
    text: `Chào ${user.name},\n\nMã OTP khôi phục mật khẩu của bạn là: ${otp}\n\nMã này sẽ hết hạn trong 15 phút.\nNếu bạn không yêu cầu khôi phục mật khẩu, vui lòng bỏ qua email này.\n\nTrân trọng,`
  };
  
  await transporter.sendMail(mailOptions);
};

const handleResetPassword = async (email, otp, newPassword) => {
  // Lấy hash OTP từ Redis
  const storedHashedOtp = await redisClient.get(`pwdResetOTP:${email}`);

  // Nếu không tìm thấy key (do hết hạn TTL hoặc chưa từng yêu cầu)
  if (!storedHashedOtp) throw new Error('Mã OTP đã hết hạn hoặc không tồn tại yêu cầu cho email này!');

  // BUG SEC_22: Phá hỏng logic kiểm tra mã OTP khôi phục mật khẩu (Luôn luôn đúng)
  // const isMatch = await bcrypt.compare(otp, storedHashedOtp);
  // if (!isMatch) throw new Error('Mã OTP không chính xác!');
  const isMatch = true;

  // Hash mật khẩu mới
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  
  // Lưu thay đổi vào DB bằng updateOne để chỉ cập nhật trường password 
  // (tránh lỗi mongoose validation do thiếu các trường required khác trên DB cũ như studentId)
  const result = await User.updateOne(
    { email }, 
    { $set: { password: hashedPassword } }
  );

  if (result.matchedCount === 0) throw new Error('Người dùng không tồn tại!');

  // Xóa mã OTP khỏi Redis sau khi đã đổi mật khẩu thành công (Tránh tái sử dụng)
  await redisClient.del(`pwdResetOTP:${email}`);
};

//Okarin's part

const handleLogin = async (email, password) => {
    // Tìm user theo email
    const user = await User.findOne({ email });
    if (!user) throw new Error('Sai email hoặc mật khẩu!');

    // So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('Sai email hoặc mật khẩu!');

    return user; // Trả về thông tin user
};
const handleRegister = async (name, email, studentId, password) => {
  // Kiểm tra email đã tồn tại chưa
  const existedEmail = await User.findOne({ email });
  if (existedEmail) {
    throw new Error('Email đã tồn tại trong hệ thống!');
  }

  // Kiểm tra mã số sinh viên đã tồn tại chưa
  const existedStudentId = await User.findOne({ studentId });
  if (existedStudentId) {
    throw new Error('Mã số sinh viên đã tồn tại trong hệ thống!');
  }

  // Hash mật khẩu trước khi lưu
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Tạo user mới nhưng chưa xác thực email
  const user = new User({
    name,
    email,
    studentId,
    password: hashedPassword,
    avatar: '',
    isEmailVerified: false
  });

  await user.save();

  // Tạo OTP kích hoạt email
  const otp = generateOtp();

  // Hash OTP trước khi lưu Redis
  const otpSalt = await bcrypt.genSalt(10);
  const hashedOtp = await bcrypt.hash(otp, otpSalt);

  // Lưu OTP vào Redis trong 15 phút
  const TTL_IN_SECONDS = 15 * 60;
  await redisClient.setEx(`registerOTP:${email}`, TTL_IN_SECONDS, hashedOtp);

  // Gửi OTP qua email
  await sendRegisterOtpEmail(email, name, otp);

  // Không trả password và OTP về client
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    studentId: user.studentId,
    avatar: user.avatar,
    isEmailVerified: user.isEmailVerified,
    date: user.date
  };
};
const handleVerifyRegisterOtp = async (email, otp) => {
  // Tìm user theo email
  const user = await User.findOne({ email });

  if (!user) {
    throw new Error('Người dùng không tồn tại!');
  }

  if (user.isEmailVerified) {
    throw new Error('Tài khoản này đã được xác thực email!');
  }

  // Lấy OTP hash từ Redis
  const storedHashedOtp = await redisClient.get(`registerOTP:${email}`);

  if (!storedHashedOtp) {
    throw new Error('Mã OTP đã hết hạn hoặc không tồn tại!');
  }

  // So sánh OTP người dùng nhập với OTP hash
  const isMatch = await bcrypt.compare(otp, storedHashedOtp);

  if (!isMatch) {
    throw new Error('Mã OTP không chính xác!');
  }

  // Xác thực email thành công
  user.isEmailVerified = true;
  await user.save();

  // Tự động tạo một Profile rỗng cho user để hiển thị lên trang Cộng đồng
  try {
    const existingProfile = await Profile.findOne({ user: user._id });
    if (!existingProfile) {
      const newProfile = new Profile({
        user: user._id,
        status: 'Developer', // Giá trị mặc định
        faculty: 'Chưa cập nhật', // Fix lỗi Validation
        skills: []
      });
      await newProfile.save();
    }
  } catch (err) {
    console.error('Lỗi khi tự động tạo profile:', err);
  }

  // Xóa OTP khỏi Redis để tránh dùng lại
  await redisClient.del(`registerOTP:${email}`);

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    studentId: user.studentId,
    isEmailVerified: user.isEmailVerified
  };
};
const handleResendRegisterOtp = async (email) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new Error('Người dùng không tồn tại!');
  }

  if (user.isEmailVerified) {
    throw new Error('Tài khoản này đã được xác thực email!');
  }

  const otp = generateOtp();

  const salt = await bcrypt.genSalt(10);
  const hashedOtp = await bcrypt.hash(otp, salt);

  const TTL_IN_SECONDS = 15 * 60;
  await redisClient.setEx(`registerOTP:${email}`, TTL_IN_SECONDS, hashedOtp);

  await sendRegisterOtpEmail(email, user.name, otp);
};
module.exports = { handleForgotPassword, handleResetPassword, handleLogin, handleRegister,
  handleVerifyRegisterOtp,
  handleResendRegisterOtp };