/* 用相对路径（带 .js）：Vite 与 Node（scripts/report.mjs）都能直接加载 */
import { DIMENSIONS, MAX_DIM_SCORE, WARN_LOW, WARN_MID } from '../data/dimensions.js'
import { FAILURE_LABELS } from '../data/failureLabels.js'

/* 评审状态文案 */
export const TO_LABEL = { none: '未评审', doing: '评审中', done: '已完成' }

/* 评审记录主键：case_id + model_id */
export const keyOf = (caseId, modelId) => caseId + '||' + modelId

/* 加权总分 = Σ(维度分 / 5 × 权重) × 100；未打分的维度跳过（与按 0 计等价） */
export function weightedTotal(scores) {
  let sum = 0
  DIMENSIONS.forEach((d) => {
    const v = scores[d.key]
    if (v === null || v === undefined) return
    sum += (v / MAX_DIM_SCORE) * d.weight
  })
  return sum * 100
}

/* 五维全部打满才算得出总分，否则返回 null（不计入排行榜与汇总统计） */
export function reviewTotal(review) {
  if (!review || !review.scores) return null
  if (!DIMENSIONS.every((d) => review.scores[d.key] !== null && review.scores[d.key] !== undefined)) return null
  return weightedTotal(review.scores)
}

/* 打分按钮的语义色：> 3.5 无样式 / <= 3.5 中档 / <= 3 低档 */
export function scoreClass(v) {
  if (v === null || v === undefined) return 'low'
  if (v <= WARN_LOW) return 'low'
  if (v <= WARN_MID) return 'mid'
  return ''
}

/* 失败标签计数：预置全部标签为 0，未知标签也一并统计 */
export function countLabels(reviews) {
  const c = {}
  FAILURE_LABELS.forEach((l) => (c[l.key] = 0))
  ;(reviews || []).forEach((r) => {
    ;(r.failures || []).forEach((k) => {
      if (c[k] === undefined) c[k] = 0
      c[k]++
    })
  })
  return c
}

/* 状态计数：未评审 / 评审中 / 已完成 */
export function countStatus(reviews) {
  const c = { none: 0, doing: 0, done: 0 }
  ;(reviews || []).forEach((r) => {
    const s = r && r.status ? r.status : 'none'
    c[s] = (c[s] || 0) + 1
  })
  return c
}

/* 是否已「完成且五维齐全」——榜单与汇总的唯一统计口径 */
export function isSolved(review) {
  return !!review && review.status === 'done' && reviewTotal(review) !== null
}

/*
 * 按模型汇总（纯函数）：
 * @param {string} scope      'all' 或具体 case_id
 * @param {object} data       { reviews, models }
 * @returns {object}          { byModel: { [modelId]: { model, n, avg, dims, labels } }, n }
 * 只纳入「status=done 且五维齐全」的记录。
 */
export function aggregate(scope, { reviews = [], models = [] } = {}) {
  const scoped = (reviews || [])
    .filter(isSolved)
    .filter((r) => !scope || scope === 'all' || r.case_id === scope)

  const byModel = {}
  models.forEach((m) => {
    const rs = scoped.filter((r) => r.model_id === m.id)
    const dims = {}
    DIMENSIONS.forEach((d) => {
      dims[d.key] = rs.length ? rs.reduce((s, r) => s + r.scores[d.key], 0) / rs.length : null
    })
    byModel[m.id] = {
      model: m,
      n: rs.length,
      avg: rs.length ? rs.reduce((s, r) => s + reviewTotal(r), 0) / rs.length : null,
      dims,
      labels: countLabels(rs),
    }
  })

  return { byModel, n: scoped.length }
}