import { DIMENSIONS } from '@/data/dimensions'

/* 评分口径常量（与原型保持一致） */
export const SCORE_STEPS = [0, 1, 2, 3, 4, 5]
export const MAX_DIM_SCORE = 5
export const WARN_LOW = 3 // 分数 <= 3 视为低分（红色）
export const WARN_MID = 3.5 // 分数 <= 3.5 视为中档（橙色）

/* 评审状态文案 */
export const TO_LABEL = { none: '未评审', doing: '评审中', done: '已完成' }

/* 加权总分 = Σ(维度分 / 5 × 权重) × 100 */
export function weightedTotal(scores) {
  let sum = 0
  DIMENSIONS.forEach((d) => {
    sum += ((scores[d.key] || 0) / MAX_DIM_SCORE) * d.weight
  })
  return sum * 100
}

/* 五维未打满时返回 null（不计入排行榜与汇总统计） */
export function reviewTotal(review) {
  if (!review || !DIMENSIONS.every((d) => review.scores[d.key] !== null && review.scores[d.key] !== undefined)) return null
  return weightedTotal(review.scores)
}

/* 打分按钮的语义色：低/中/正常 */
export function scoreClass(v) {
  if (v === null || v === undefined) return 'low'
  if (v <= WARN_LOW) return 'low'
  if (v <= WARN_MID) return 'mid'
  return ''
}

export const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1)
export const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2)