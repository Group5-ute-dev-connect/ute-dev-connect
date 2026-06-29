const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Check if Cloudinary credentials are set up
const isCloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('☁️  Cloudinary đã được cấu hình thành công!');
} else {
  console.log('⚠️  Cloudinary chưa được cấu hình. Hệ thống sẽ tự động dùng Local Storage.');
}

/**
 * Uploads a local file to Cloudinary and deletes it locally.
 * If Cloudinary is not configured, returns null (caller will fall back to local storage).
 * 
 * @param {string} localFilePath - Path to local file
 * @param {string} folder - Folder name on Cloudinary
 * @returns {Promise<string|null>} - Cloudinary secure URL or null
 */
const uploadToCloudinary = async (localFilePath, folder = 'ute-dev-connect') => {
  if (!isCloudinaryConfigured) {
    return null;
  }

  try {
    const result = await cloudinary.uploader.upload(localFilePath, {
      folder: folder,
      resource_type: 'auto',
    });

    // Remove local temporary file
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    return result.secure_url;
  } catch (error) {
    console.error('Lỗi khi tải file lên Cloudinary:', error);
    // Keep local file for fallback, do not throw unless absolutely necessary
    // So the caller can still use the local path if cloud upload fails.
    return null;
  }
};

module.exports = {
  uploadToCloudinary,
  isCloudinaryConfigured,
};
