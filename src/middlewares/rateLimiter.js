const rateLimit = require("express-rate-limit");

// Giới hạn request cho API Forgot Password (Ví dụ: 3 lần/15 phút)
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 3, // Giới hạn 3 request mỗi windowMs
  standardHeaders: true, // Trả về thông tin Rate limit ở header (RateLimit-*)
  legacyHeaders: false, // Vô hiệu hóa `X-RateLimit-*` headers
  handler: (req, res) => {
    // Trả về định dạng JSON tùy chỉnh khi vượt quá giới hạn
    return res.status(429).json({
      message:
        "Bạn đã yêu cầu gửi mã OTP quá nhiều lần. Vui lòng thử lại sau 15 phút.",
    });
  },
});

// Giới hạn request cho API Reset Password (Ví dụ: 5 lần/15 phút)
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 5, // Giới hạn 5 request mỗi windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      message:
        "Bạn đã nhập sai mã OTP hoặc yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút.",
    });
  },
});

//Okarin's part

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 6, // Tối đa 6 lần thử
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message:
        "Bạn đã đăng nhập quá nhiều lần. Vui lòng thử lại sau 1 phút.",
    });
  },
});

// Giới hạn cho API Cập nhật Profile
const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 20, // Cho phép cập nhật profile 20 lần / 15 phút để chống spam request
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Bạn cập nhật Profile quá nhanh. Vui lòng đợi một lát.",
    });
  },
});

const verifyRegisterOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP verification attempts. Please try again later.",
  },
});

const resendRegisterOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP resend attempts. Please try again later.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many register attempts. Please try again after 15 minutes.'
  }
});

module.exports = {
  forgotPasswordLimiter,
  resetPasswordLimiter,
  loginLimiter,
  profileLimiter,
  registerLimiter,
  verifyRegisterOtpLimiter,
  resendRegisterOtpLimiter
};
