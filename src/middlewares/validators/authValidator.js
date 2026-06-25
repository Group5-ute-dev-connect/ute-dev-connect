const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => error.msg)
    });
  }

  next();
};

const validateRegister = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters')
        .matches(/^[a-zA-ZÀ-ỹ\s.'-]+$/)
        .withMessage('Name can only contain letters, spaces, dots or hyphens'),

    body('email')
        .trim()
        .isEmail()
        .withMessage('Please include a valid email')
        .normalizeEmail(),

    body('studentId')
        .trim()
        .notEmpty()
        .withMessage('Student ID is required')
        .isLength({ min: 6, max: 20 })
        .withMessage('Student ID must be between 6 and 20 characters'),

    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)
        .withMessage('Password must contain at least one letter and one number'),

    (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(error => error.msg)
            });
        }

        next();
    }
];
const validateVerifyRegisterOtp = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please include a valid email')
    .normalizeEmail(),

  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers'),

  handleValidationErrors
];

const validateResendRegisterOtp = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please include a valid email')
    .normalizeEmail(),

  handleValidationErrors
];

// Hàm xử lý kết quả validation
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

const validateForgotPassword = [
    body('email').isEmail().withMessage('Vui lòng cung cấp một email hợp lệ.'),
    validateRequest
];

const validateResetPassword = [
    body('email').isEmail().withMessage('Vui lòng cung cấp một email hợp lệ.'),
    body('otp')
        .isLength({ min: 6, max: 6 }).withMessage('Mã OTP phải bao gồm đúng 6 ký tự.')
        .isNumeric().withMessage('Mã OTP chỉ được chứa các chữ số.'),
    body('newPassword')
        .isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự.'),
    validateRequest
];


//Okarin's part
const validateLogin = [
    body('email').isEmail().withMessage('Vui lòng cung cấp một email hợp lệ.'),
    body('password').notEmpty().withMessage('Mật khẩu không được để trống.'),
    validateRequest // Tái sử dụng middleware bắt lỗi của nhóm
];


// Export thêm validateLogin
module.exports = {
    validateForgotPassword,
    validateResetPassword,
    validateLogin,
    validateRegister,
    validateVerifyRegisterOtp,
    validateResendRegisterOtp
};