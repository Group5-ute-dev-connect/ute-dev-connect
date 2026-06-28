const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FilterSchema = new Schema({
  bannedWords: {
    type: [String],
    default: []
  },
  aiFilterEnabled: {
    type: Boolean,
    default: false
  },
  aiPrompt: {
    type: String,
    default: 'You are a content moderator for a university social network. Check the input text for any policy violations related to gambling or betting (such as sports betting, card games for money, casinos, lottery, online gambling, or bookmaker promotions). Reply ONLY in a strict JSON format: {"isViolation": boolean, "reason": "brief explanation in Vietnamese"}. Do not include markdown code block formatting or backticks around the JSON.'
  }
});

module.exports = mongoose.model('filter', FilterSchema);
