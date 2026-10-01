/* 8 个失败标签：高危(high) / 一般(mid)，标签只作归因，不自动扣分 */
export const FAILURE_LABELS = [
  { key: 'num_error', name: '数字错误', sev: 'high', desc: '给出的关键数值与参考答案不一致（含方向、倍数、量级错误）' },
  { key: 'unit_error', name: '单位错误', sev: 'high', desc: '单位缺失、错用或量纲错误（亿元/万元/亿美元、%与百分点混用等）' },
  { key: 'invalid_citation', name: '引用无效', sev: 'mid', desc: '引用了不存在、无法核验、日期缺失或与结论不匹配的来源' },
  { key: 'future_data', name: '使用未来数据', sev: 'high', desc: '引用了信息截止时间之后才发布或发生的数据、事件' },
  { key: 'stale_data', name: '数据过时', sev: 'mid', desc: '使用已被更新口径替代的旧数据，或未标注数据期间' },
  { key: 'risk_missed', name: '风险漏报', sev: 'high', desc: '未提示关键风险（波动、流动性、集中度、适当性等）' },
  { key: 'unfounded_advice', name: '无依据买卖建议', sev: 'high', desc: '给出无依据的买入/卖出/仓位建议或诱导性表述' },
  { key: 'causal_misstate', name: '因果关系表述不当', sev: 'mid', desc: '把相关性写成必然因果，或使用“一定/必然/肯定”等断言' },
]

/* key -> 标签定义，便于 O(1) 取名称与严重度 */
export const LABEL_MAP = Object.fromEntries(FAILURE_LABELS.map((l) => [l.key, l]))