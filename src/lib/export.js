/* 数据导出（当前只覆盖「导出本轮」所需的单问题范围；其余范围留待数据导入导出阶段） */
import { SCHEMA_ID } from '@/lib/storage'
import { DIMENSIONS } from '@/data/dimensions'
import { FAILURE_LABELS } from '@/data/failureLabels'

/* 是否含评审内容：决定该条记录是否随导出（与原型 buildExport 的过滤口径一致） */
function hasContent(r) {
  return (
    (r.failures || []).length > 0 ||
    String(r.comment || '').trim() !== '' ||
    DIMENSIONS.some((d) => r.scores && r.scores[d.key] !== null && r.scores[d.key] !== undefined)
  )
}

/*
 * 单轮导出：该问题的题目 + 它的全部回答 + 该问题的评审记录，附配置与模型元数据。
 * @param {string} caseId
 * @param {object} ctx { cases, answersOf(caseId), reviews, models, stream }
 */
export function buildCaseExport(caseId, { cases = [], answersOf, reviews = [], models = [], stream } = {}) {
  const scopedCases = cases.filter((c) => c.case_id === caseId)
  const answers = scopedCases.flatMap((c) => (answersOf ? answersOf(c.case_id) : []))
  const scopedReviews = reviews.filter(
    (r) => r.case_id === caseId && (hasContent(r) || r.status !== 'none'),
  )
  return {
    schema: SCHEMA_ID,
    exported_at: new Date().toISOString(),
    scope: 'case:' + caseId,
    config: { dimensions: DIMENSIONS, failure_labels: FAILURE_LABELS, stream },
    models,
    cases: scopedCases,
    answers,
    reviews: scopedReviews,
  }
}

export function downloadJSON(obj, name) {
  downloadFile(JSON.stringify(obj, null, 2), name, 'application/json')
}

/* 通用下载：优先 data URL（本地 file:// 下 blob 下载常被拦或卡在 0 B/s），失败回退 blob */
export function downloadFile(text, name, mime) {
  const type = (mime || 'text/plain') + ';charset=utf-8'
  const a = document.createElement('a')
  a.style.display = 'none'
  a.rel = 'noopener'
  a.download = name
  document.body.appendChild(a)
  let ok = false
  try {
    a.href = 'data:' + type + ';base64,' + utf8ToBase64(text)
    a.click()
    ok = true
  } catch (e) {
    ok = false
  }
  if (!ok) {
    const url = URL.createObjectURL(new Blob([text], { type }))
    a.href = url
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  setTimeout(() => {
    a.remove()
  }, 0)
}

/* 先按 UTF-8 编码再 base64，保证中文内容不乱码 */
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}