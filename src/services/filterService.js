const Filter = require('../models/Filter');

// Khởi tạo hoặc lấy cấu hình bộ lọc từ DB
const getOrCreateFilter = async () => {
  let filter = await Filter.findOne();
  if (!filter) {
    filter = new Filter({
      bannedWords: ['đm', 'dcm', 'fuck', 'toxicword', 'quang cao tool'],
      aiFilterEnabled: false
    });
    await filter.save();
  }
  return filter;
};

// Kiểm tra nội dung dựa trên từ cấm và bộ lọc AI
const checkContent = async (text) => {
  if (!text) return;
  const filter = await getOrCreateFilter();
  const normalizedText = text.toLowerCase();

  // 1. Kiểm tra từ cấm thủ công
  for (const word of filter.bannedWords) {
    if (normalizedText.includes(word.toLowerCase())) {
      const error = new Error(`Nội dung chứa từ cấm không cho phép: "${word}"`);
      error.statusCode = 400;
      throw error;
    }
  }

// Kiểm tra bằng AI (nếu được bật)
  if (filter.aiFilterEnabled) {
    await checkContentWithMistral(text);
  }
};

// Gọi API Mistral thực tế hoặc fallback về local
const checkContentWithMistral = async (text) => {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.log('[AI Moderation] MISTRAL_API_KEY không được thiết lập. Tự động chuyển về quy tắc quét cục bộ.');
    return checkContentLocalAI(text);
  }

  try {
    const model = process.env.MISTRAL_MODEL || 'open-mistral-7b';
    console.log(`[AI Moderation] Đang gửi yêu cầu kiểm duyệt tới Mistral API sử dụng model: ${model}...`);
    
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a content moderator for a university social network. Check the input text for any policy violations such as severe toxicity, spam, hacking tools, or advertisements. Reply ONLY in a strict JSON format: {"isViolation": boolean, "reason": "brief explanation in Vietnamese"}. Do not include markdown code block formatting or backticks around the JSON.'
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Mistral API trả về status: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const result = JSON.parse(content.trim());
      if (result.isViolation) {
        const error = new Error(`[AI Moderation] ${result.reason || 'Nội dung vi phạm chính sách'}`);
        error.statusCode = 400;
        throw error;
      }
    }
  } catch (err) {
    if (err.statusCode) throw err;
    console.error('[AI Moderation] Lỗi khi kết nối Mistral API:', err.message);
    console.log('[AI Moderation] Đang chuyển hướng về bộ quét cục bộ...');
    return checkContentLocalAI(text);
  }
};

// Bộ lọc cục bộ dự phòng
const checkContentLocalAI = (text) => {
  const normalizedText = text.toLowerCase();
  const aiSpamPatterns = [
    /hack/i, 
    /cung cap tool/i, 
    /phần mềm hack/i, 
    /quang cao/i, 
    /mua ban tài khoản/i, 
    /kiếm tiền online/i, 
    /nạp thẻ/i, 
    /dich vu hack/i,
    /spam/i
  ];
  for (const pattern of aiSpamPatterns) {
    if (pattern.test(normalizedText)) {
      const error = new Error('[AI Moderation] Phát hiện bài đăng/bình luận vi phạm chính sách nội dung (Spam/Quảng cáo/Hack/Nội dung độc hại)');
      error.statusCode = 400;
      throw error;
    }
  }
};

// Kiểm tra nội dung kết hợp bộ lọc hệ thống và bộ lọc riêng của nhóm
const checkContentWithGroup = async (text, groupBannedWords = []) => {
  if (!text) return { isViolation: false };
  const filter = await getOrCreateFilter();
  const normalizedText = text.toLowerCase();

  // 1. Kiểm tra từ cấm của hệ thống
  for (const word of filter.bannedWords) {
    if (normalizedText.includes(word.toLowerCase())) {
      return { isViolation: true, word, isGlobal: true };
    }
  }

  // 2. Kiểm tra từ cấm riêng của nhóm
  for (const word of groupBannedWords) {
    if (normalizedText.includes(word.toLowerCase())) {
      return { isViolation: true, word, isGlobal: false };
    }
  }

  // 3. Kiểm tra bằng AI (nếu được bật)
  if (filter.aiFilterEnabled) {
    try {
      await checkContentWithMistral(text);
    } catch (err) {
      if (err.statusCode) {
        return { isViolation: true, reason: err.message, isAI: true };
      }
    }
  }

  return { isViolation: false };
};

module.exports = {
  getOrCreateFilter,
  checkContent,
  checkContentWithGroup
};
