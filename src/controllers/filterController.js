const filterService = require('../services/filterService');
const Filter = require('../models/Filter');

// Lấy cấu hình bộ lọc hiện tại
const getFilterConfig = async (req, res) => {
  try {
    const config = await filterService.getOrCreateFilter();
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// Thêm từ cấm
const addBannedWord = async (req, res) => {
  try {
    const { word } = req.body;
    if (!word || !word.trim()) {
      return res.status(400).json({ success: false, message: 'Từ cấm không được để trống' });
    }

    const filter = await filterService.getOrCreateFilter();
    const cleanWord = word.trim();
    if (filter.bannedWords.some(w => w.toLowerCase() === cleanWord.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Từ cấm này đã tồn tại' });
    }

    filter.bannedWords.push(cleanWord);
    await filter.save();

    res.status(200).json({
      success: true,
      message: 'Thêm từ cấm thành công',
      data: filter
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// Xóa từ cấm
const deleteBannedWord = async (req, res) => {
  try {
    const { word } = req.params;
    const filter = await filterService.getOrCreateFilter();
    const decodedWord = decodeURIComponent(word).trim().toLowerCase();
    
    filter.bannedWords = filter.bannedWords.filter(
      (w) => w.toLowerCase() !== decodedWord
    );
    await filter.save();

    res.status(200).json({
      success: true,
      message: 'Xóa từ cấm thành công',
      data: filter
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// Bật/tắt AI Filter
const toggleAiFilter = async (req, res) => {
  try {
    const { enabled } = req.body;
    const filter = await filterService.getOrCreateFilter();
    filter.aiFilterEnabled = !!enabled;
    await filter.save();

    res.status(200).json({
      success: true,
      message: `Đã ${filter.aiFilterEnabled ? 'bật' : 'tắt'} bộ lọc AI thành công`,
      data: filter
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// Xuất từ khóa cấm ra file CSV
const exportBannedWords = async (req, res) => {
  try {
    const config = await filterService.getOrCreateFilter();
    const words = config.bannedWords || [];
    
    // Thêm UTF-8 BOM để Excel hiển thị đúng chữ tiếng Việt
    const csvContent = '\uFEFF' + words.join('\r\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=banned_words.csv');
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('Lỗi khi xuất file CSV:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server khi xuất file' });
  }
};

// Nhập từ khóa cấm từ file CSV
const importBannedWords = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng tải lên một file CSV' });
    }

    const csvData = req.file.buffer.toString('utf-8');
    // Tách từ khóa theo dòng mới, dấu phẩy, hoặc dấu chấm phẩy
    const rawWords = csvData.split(/[\r\n,;]+/);
    
    const newWords = rawWords
      .map(word => word.replace(/^\uFEFF/, '').trim())
      .filter(word => word.length > 0);

    if (newWords.length === 0) {
      return res.status(400).json({ success: false, message: 'File CSV không chứa từ khóa hợp lệ' });
    }

    const filter = await filterService.getOrCreateFilter();
    let addedCount = 0;

    for (const word of newWords) {
      const trimmedWord = word.trim();
      if (!filter.bannedWords.some(w => w.toLowerCase() === trimmedWord.toLowerCase())) {
        filter.bannedWords.push(trimmedWord);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      await filter.save();
    }

    res.status(200).json({
      success: true,
      message: `Đã nhập thành công ${addedCount} từ khóa mới từ file CSV`,
      data: filter
    });
  } catch (err) {
    console.error('Lỗi khi nhập file CSV:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server khi nhập file' });
  }
};

// Cập nhật AI Prompt
const updateAiPrompt = async (req, res) => {
  try {
    const { aiPrompt } = req.body;
    if (!aiPrompt || !aiPrompt.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung bộ lọc AI không được để trống' });
    }

    const filter = await filterService.getOrCreateFilter();
    filter.aiPrompt = aiPrompt.trim();
    await filter.save();

    res.status(200).json({
      success: true,
      message: 'Cập nhật bộ lọc AI thành công',
      data: filter
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

// Khôi phục AI Prompt mặc định
const resetAiPrompt = async (req, res) => {
  try {
    const filter = await filterService.getOrCreateFilter();
    filter.aiPrompt = filterService.DEFAULT_AI_PROMPT;
    await filter.save();

    res.status(200).json({
      success: true,
      message: 'Khôi phục bộ lọc AI mẫu thành công',
      data: filter
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
  }
};

module.exports = {
  getFilterConfig,
  addBannedWord,
  deleteBannedWord,
  toggleAiFilter,
  exportBannedWords,
  importBannedWords,
  updateAiPrompt,
  resetAiPrompt
};
