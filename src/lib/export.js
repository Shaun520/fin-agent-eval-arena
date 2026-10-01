/* 数据导出（当前只覆盖「导出本轮」所需的单问题范围；其余范围留待数据导入导出阶段） */
import { SCHEMA_ID } from '@/lib/storage'
import { DIMENSIONS } from '@/data/dimensions'
import { FAILURE_LABELS } from '@/data/failureLabels'
import { fmt1, fmt2 } from '@/lib/format'

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

/* ------------------------------ 报告文本（纯函数，复刻原型 leaderboardMarkdown / reportMarkdown） ------------------------------ */

/* 排行榜 Markdown：名次按题均总分降序，维度列带权重百分比 */
export function leaderboardMarkdown({ scopeLabel = '全部问题', sampleN = 0, agg = { byModel: {}, n: 0 }, models = [] } = {}) {
  const ranked = models
    .map((m) => ({ m, s: agg.byModel[m.id] || { avg: null, dims: {}, n: 0 } }))
    .sort((a, b) => (b.s.avg === null ? -1 : b.s.avg) - (a.s.avg === null ? -1 : a.s.avg))
  let md = '# 金融 Agent 评测排行榜（' + scopeLabel + '）\n\n样本：' + sampleN + ' 条已完成记录\n\n'
  md += '| 排名 | 模型 | 题均总分 | ' + DIMENSIONS.map((d) => d.name + '(' + Math.round(d.weight * 100) + '%)').join(' | ') + ' | 覆盖题数 |\n'
  md += '|---|---|---|' + DIMENSIONS.map(() => '---').join('|') + '|---|\n'
  ranked.forEach((x, i) => {
    md +=
      '| ' + (i + 1) + ' | ' + x.m.name + ' | ' + (x.s.avg === null ? '—' : fmt1(x.s.avg)) + ' | ' +
      DIMENSIONS.map((d) => (x.s.dims[d.key] === null || x.s.dims[d.key] === undefined ? '—' : fmt2(x.s.dims[d.key]))).join(' | ') +
      ' | ' + x.s.n + ' |\n'
  })
  return md
}

/* 汇总报告 Markdown：概览统计 + 各模型汇总 + 标签分布 + 排行榜 */
export function reportMarkdown({
  generatedAt = '',
  askedCount = 0,
  totalAns = 0,
  doneCount = 0,
  agg = { byModel: {}, n: 0 },
  models = [],
  allLabels = {},
} = {}) {
  const rate = totalAns ? ((doneCount / totalAns) * 100).toFixed(0) : 0
  let md = '# 金融 Agent 评测汇总报告\n\n'
  md += '生成时间：' + (generatedAt || new Date().toLocaleString('zh-CN')) + '\n\n'
  md += '- 问题数：' + askedCount + '\n- 回答数：' + totalAns + '\n- 已完成评审：' + doneCount + '\n- 完成率：' + rate + '%\n\n'
  md += '## 各模型汇总\n\n| 模型 | 题均总分 | 覆盖问题数 | ' + DIMENSIONS.map((d) => d.name).join(' | ') + ' | 失败标签数 |\n'
  md += '|---|---|---|' + DIMENSIONS.map(() => '---').join('|') + '|---|\n'
  models.forEach((m) => {
    const s = agg.byModel[m.id] || { avg: null, dims: {}, n: 0, labels: {} }
    md +=
      '| ' + m.name + ' | ' + (s.avg === null ? '—' : fmt1(s.avg)) + ' | ' + s.n + '/' + askedCount + ' | ' +
      DIMENSIONS.map((d) => (s.dims[d.key] === null || s.dims[d.key] === undefined ? '—' : fmt2(s.dims[d.key]))).join(' | ') + ' | ' +
      Object.values(s.labels || {}).reduce((a, b) => a + b, 0) + ' |\n'
  })
  md +=
    '\n## 失败标签分布（全部模型）\n\n| 标签 | 次数 |\n|---|---|\n' +
    FAILURE_LABELS.map((l) => '| ' + l.name + ' | ' + (allLabels[l.key] || 0) + ' |').join('\n') + '\n\n'
  md += '## 排行榜\n\n' + leaderboardMarkdown({ scopeLabel: '全部问题', sampleN: agg.n, agg, models })
  md += '\n> 说明：评分为人工判定，总分 = Σ(维度分/5×权重)×100；仅「已完成且五维齐全」的记录参与统计。\n'
  return md
}

/* 复制到剪贴板：优先 Clipboard API，失败回退 execCommand，返回是否成功 */
export function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => fallbackCopy(text),
    )
  }
  return Promise.resolve(fallbackCopy(text))
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    return true
  } catch (e) {
    return false
  }
}