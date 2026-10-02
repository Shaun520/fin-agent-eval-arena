/* 数据导出（单题 / 全量三范围）与报告文本。内部一律相对路径导入，便于 Node 复用 */
import { SCHEMA_ID } from './storage.js'
import { DIMENSIONS } from '../data/dimensions.js'
import { FAILURE_LABELS } from '../data/failureLabels.js'
import { fmt1, fmt2 } from './format.js'
import { aggregate, countLabels, reviewTotal, keyOf, TO_LABEL } from './scoring.js'

/* 是否含评审内容：决定该条记录是否随导出（与原型 buildExport 的过滤口径一致） */
export function hasContent(r) {
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

/*
 * 全量/分范围导出（复刻原型 buildExport）。
 * @param {'all'|'reviews'|'answers'} scope
 * @param {object} ctx { cases, answersOf(caseId), reviews, models, stream }
 */
export function buildExport(scope, { cases = [], answersOf, reviews = [], models = [], stream } = {}) {
  const allCases = cases
  const ids = new Set(allCases.map((c) => c.case_id))
  const answers = allCases.flatMap((c) => (answersOf ? answersOf(c.case_id) : []))
  const scopedReviews = (reviews || []).filter(
    (r) => ids.has(r.case_id) && (hasContent(r) || r.status !== 'none'),
  )
  const base = {
    schema: SCHEMA_ID,
    exported_at: new Date().toISOString(),
    scope,
    config: { dimensions: DIMENSIONS, failure_labels: FAILURE_LABELS, stream },
    models,
    cases: allCases,
    answers,
    reviews: scopedReviews,
  }
  if (scope === 'reviews') return { schema: SCHEMA_ID, exported_at: base.exported_at, scope, reviews: scopedReviews }
  if (scope === 'answers') return { schema: SCHEMA_ID, exported_at: base.exported_at, scope, models, cases: allCases, answers }
  return base
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

/* ------------------------------ 报告数据装配（浏览器与 Node 共用，保证「报告 = 页面」） ------------------------------ */

const labelName = (k) => (FAILURE_LABELS.find((l) => l.key === k) || { name: k }).name

/*
 * 由问题 / 回答 / 评审 / 模型原始数据装配报告所需数据（纯函数）。
 * @param {object} p
 *   cases, answers, reviews, models,
 *   askedCaseIds  显式指定「已提问」的问题 id（浏览器传 store.askedCases）；
 *                 缺省时回退为「出现在评审记录中的问题」（供 Node 从导出 JSON 复现）
 * @returns {object} { askedCount, totalAns, doneCount, rate, agg, allLabels, perModelLabels, matrix }
 */
export function buildReportData({ cases = [], answers = [], reviews = [], models = [], askedCaseIds = null } = {}) {
  const caseById = {}
  cases.forEach((c) => {
    if (c && c.case_id) caseById[c.case_id] = c
  })
  const answersByCase = {}
  answers.forEach((a) => {
    if (!a || !a.case_id) return
    ;(answersByCase[a.case_id] = answersByCase[a.case_id] || []).push(a)
  })
  const reviewMap = {}
  ;(reviews || []).forEach((r) => {
    if (r && r.case_id && r.model_id) reviewMap[keyOf(r.case_id, r.model_id)] = r
  })

  const rawIds = askedCaseIds && askedCaseIds.length
    ? askedCaseIds
    : [...new Set((reviews || []).map((r) => r && r.case_id))]
  const askedIds = rawIds.filter((id) => caseById[id])

  let totalAns = 0
  let doneCount = 0
  const matrix = askedIds.map((id) => {
    const c = caseById[id]
    const as = answersByCase[id] || []
    totalAns += as.length
    let sum = 0
    let n = 0
    const labelCount = {}
    const cells = models.map((m) => {
      const a = as.find((x) => x.model_id === m.id)
      if (!a) return { model: m, none: true }
      const r = reviewMap[keyOf(id, m.id)] || { status: 'none', failures: [] }
      const t = reviewTotal(r)
      if (r.status === 'done') doneCount++
      if (r.status === 'done' && t !== null) {
        sum += t
        n++
      }
      ;(r.failures || []).forEach((k) => {
        labelCount[k] = (labelCount[k] || 0) + 1
      })
      return { model: m, t, status: r.status }
    })
    const topLabels = Object.entries(labelCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => ({ key: k, name: labelName(k), n: v }))
    return { c, cells, avg: n ? sum / n : null, topLabels }
  })

  const reviewedWithContent = (reviews || []).filter(hasContent)
  const allLabels = countLabels(reviewedWithContent)
  const perModelLabels = {}
  models.forEach((m) => {
    perModelLabels[m.id] = countLabels(reviewedWithContent.filter((r) => r.model_id === m.id))
  })

  return {
    askedCount: askedIds.length,
    totalAns,
    doneCount,
    rate: totalAns ? ((doneCount / totalAns) * 100).toFixed(0) : 0,
    agg: aggregate('all', { reviews, models }),
    allLabels,
    perModelLabels,
    matrix,
  }
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

/* 汇总报告 Markdown：覆盖率 + 各模型汇总 + 标签分布（总/分模型）+ 问题×模型对比 + 排行榜 */
export function reportMarkdown({
  generatedAt = '',
  askedCount = 0,
  totalAns = 0,
  doneCount = 0,
  rate,
  agg = { byModel: {}, n: 0 },
  models = [],
  allLabels = {},
  perModelLabels = {},
  matrix = [],
} = {}) {
  const pct = rate === undefined ? (totalAns ? ((doneCount / totalAns) * 100).toFixed(0) : 0) : rate
  const colNames = models.map((m) => m.short || m.name)
  let md = '# 金融 Agent 评测汇总报告\n\n'
  md += '生成时间：' + (generatedAt || new Date().toLocaleString('zh-CN')) + '\n\n'

  /* 覆盖率统计 */
  md += '## 覆盖率统计\n\n'
  md += '- 问题数：' + askedCount + '\n- 回答数：' + totalAns + '\n- 已完成评审：' + doneCount + '\n- 完成率：' + pct + '%\n\n'

  /* 各模型题均总分与分维表 */
  md += '## 各模型汇总\n\n| 模型 | 题均总分 | 覆盖问题数 | ' + DIMENSIONS.map((d) => d.name).join(' | ') + ' | 失败标签数 |\n'
  md += '|---|---|---|' + DIMENSIONS.map(() => '---').join('|') + '|---|\n'
  models.forEach((m) => {
    const s = agg.byModel[m.id] || { avg: null, dims: {}, n: 0, labels: {} }
    md +=
      '| ' + m.name + ' | ' + (s.avg === null ? '—' : fmt1(s.avg)) + ' | ' + s.n + '/' + askedCount + ' | ' +
      DIMENSIONS.map((d) => (s.dims[d.key] === null || s.dims[d.key] === undefined ? '—' : fmt2(s.dims[d.key]))).join(' | ') + ' | ' +
      Object.values(s.labels || {}).reduce((a, b) => a + b, 0) + ' |\n'
  })

  /* 失败标签：总体分布 + 分模型分布 */
  md += '\n## 失败标签分布\n\n### 总体分布（全部模型）\n\n| 标签 | 次数 |\n|---|---|\n'
  md += FAILURE_LABELS.map((l) => '| ' + l.name + ' | ' + (allLabels[l.key] || 0) + ' |').join('\n') + '\n'
  if (colNames.length && Object.keys(perModelLabels).length) {
    const cols = ['失败标签', ...colNames, '合计']
    md += '\n### 分模型分布\n\n| ' + cols.join(' | ') + ' |\n'
    md += '|' + cols.map(() => '---').join('|') + '|\n'
    FAILURE_LABELS.forEach((l) => {
      const cells = models.map((m) => (perModelLabels[m.id] && perModelLabels[m.id][l.key]) || 0)
      md += '| ' + [l.name, ...cells, cells.reduce((a, b) => a + b, 0)].join(' | ') + ' |\n'
    })
  }

  /* 问题 × 模型对比表 */
  if (matrix.length && colNames.length) {
    const cols = ['问题', ...colNames, '均分', '主要失败标签']
    md += '\n## 问题 × 模型对比\n\n| ' + cols.join(' | ') + ' |\n'
    md += '|' + cols.map(() => '---').join('|') + '|\n'
    matrix.forEach((row) => {
      const cells = row.cells.map((cell) => {
        if (cell.none) return '无回答'
        const s = cell.t === null || cell.t === undefined ? '—' : fmt1(cell.t)
        return s + '（' + (TO_LABEL[cell.status] || '未评审') + '）'
      })
      const labels = row.topLabels.length ? row.topLabels.map((t) => t.name + ' ×' + t.n).join('、') : '—'
      const qlabel = row.c.case_id + (row.c.title ? ' ' + row.c.title : '')
      md += '| ' + [qlabel, ...cells, row.avg === null ? '—' : fmt1(row.avg), labels].join(' | ') + ' |\n'
    })
  }

  md += '\n## 排行榜\n\n' + leaderboardMarkdown({ scopeLabel: '全部问题', sampleN: agg.n, agg, models })
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