const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Gộp chung các hàm import từ authValidator vào 1 dòng
const { validateForgotPassword, validateResetPassword, validateLogin, validateRegister,
  validateVerifyRegisterOtp,
  validateResendRegisterOtp } = require('../middlewares/validators/authValidator');

// Gộp chung các hàm import từ rateLimiter vào 1 dòng
const { forgotPasswordLimiter, resetPasswordLimiter, loginLimiter, registerLimiter,
  verifyRegisterOtpLimiter,
  resendRegisterOtpLimiter } = require('../middlewares/rateLimiter');


// API Quên mật khẩu: Áp dụng Rate Limiting -> Validator -> Controller
router.post(
    '/forgot-password', 
    forgotPasswordLimiter, 
    validateForgotPassword, 
    authController.forgotPassword
);

// API Đặt lại mật khẩu: Áp dụng Rate Limiting -> Validator -> Controller
router.post(
    '/reset-password', 
    resetPasswordLimiter, 
    validateResetPassword, 
    authController.resetPassword
);

// API Đăng nhập
router.post('/login', loginLimiter, validateLogin, authController.login);

// API Đăng ký
router.post('/register', registerLimiter, validateRegister, authController.register);

router.post(
  '/verify-register-otp',
  verifyRegisterOtpLimiter,
  validateVerifyRegisterOtp,
  authController.verifyRegisterOtp
);

router.post(
  '/resend-register-otp',
  resendRegisterOtpLimiter,
  validateResendRegisterOtp,
  authController.resendRegisterOtp
);

// API Đăng nhập Google
router.post('/google', authController.googleLogin);

module.exports = router;