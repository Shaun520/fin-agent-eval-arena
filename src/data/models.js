/* 内置模型：wencai 为基准模型（同花顺问财） */
export const MODELS = [
  { id: 'wencai', name: '同花顺问财', short: '问财', vendor: '同花顺', color: '#d92b2b', baseline: true },
  { id: 'doubao', name: '豆包', short: '豆包', vendor: '字节跳动', color: '#2b6ef6' },
  { id: 'qwen', name: '千问', short: '千问', vendor: '阿里云', color: '#7b5cf0' },
  { id: 'yuanbao', name: '腾讯元宝', short: '元宝', vendor: '腾讯', color: '#0e9f6e' },
]

/* 自定义模型取色盘（按新增顺序循环） */
export const CUSTOM_MODEL_PALETTE = ['#8b5cf6', '#0891b2', '#ea580c', '#15803d', '#be185d', '#475569']