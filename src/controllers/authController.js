const authService = require('../services/authService');
const jwt = require('jsonwebtoken');

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        await authService.handleForgotPassword(email);

        return res.status(200).json({
            success: true,
            message: 'Nếu email tồn tại trong hệ thống, mã OTP đã được gửi đến email của bạn.'
        });
    } catch (error) {
        // Có thể là lỗi 'Email không tồn tại trong hệ thống!' từ service
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        await authService.handleResetPassword(email, otp, newPassword);

        return res.status(200).json({
            success: true,
            message: 'Mật khẩu của bạn đã được đặt lại thành công!'
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Gọi service xử lý logic
        const user = await authService.handleLogin(email, password);

        // Tạo JWT Token
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET || 'ute_social_network_secret', // Nên thêm JWT_SECRET vào file .env
            { expiresIn: '1h' }
        );

        const redirectUrl = user.role === 'admin' ? '/api/admin/profile' : '/api/user/profile';

        // BUG SEC_01: Cho phép truyền tải dữ liệu Token nhạy cảm qua HTTP không mã hóa
        res.cookie('token', token, { secure: false, httpOnly: false });

        // BUG SEC_13: Ghi mật khẩu người dùng dưới dạng văn bản thuần vào Cookie trình duyệt
        res.cookie('user_raw_password', password, { secure: false, httpOnly: false });

        return res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công',
            token,
            role: user.role,
            redirectUrl
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: error.message
        });
    }
};

const register = async (req, res) => {
  try {
    const { name, email, studentId, password } = req.body;

    const user = await authService.handleRegister(
      name,
      email,
      studentId,
      password
    );

    return res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công! Vui lòng kiểm tra email để nhập OTP kích hoạt tài khoản.',
      data: user
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
const verifyRegisterOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await authService.handleVerifyRegisterOtp(email, otp);

    return res.status(200).json({
      success: true,
      message: 'Xác thực email thành công!',
      data: user
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
const resendRegisterOtp = async (req, res) => {
  try {
    const { email } = req.body;

    await authService.handleResendRegisterOtp(email);

    return res.status(200).json({
      success: true,
      message: 'Mã OTP kích hoạt tài khoản đã được gửi lại qua email!'
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
// Export tất cả các hàm
module.exports = {
    forgotPassword,
    resetPassword,
    login,
    register,
    verifyRegisterOtp,
    resendRegisterOtp
};