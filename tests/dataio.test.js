import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useArenaStore } from '@/stores/arena'
import { buildExport, buildReportData, reportMarkdown, leaderboardMarkdown } from '@/lib/export'
import { SCHEMA_ID } from '@/lib/storage'
import { keyOf, reviewTotal } from '@/lib/scoring'
import DataIO from '@/views/DataIO.vue'

/* 每个用例都用干净的 Pinia + localStorage */
function freshStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArenaStore()
  store.loadState()
  return { pinia, store }
}

/* 载入 20 条演示评审 + 提问全部 5 道参考题 */
function seedAll(store) {
  store.loadDemoReviews()
  ;['FQ-001', 'FQ-002', 'FQ-003', 'FQ-004', 'FQ-005'].forEach((id) => store.askQuestion(id))
}

/* 供 buildExport 的取数上下文 */
const ctx = (store) => ({
  cases: store.cases,
  answersOf: (id) => store.answersOf(id),
  reviews: store.allReviews,
  models: store.allModels(),
  stream: store.stream,
})

beforeEach(() => {
  localStorage.clear()
})

describe('P6 · 全量 / 分范围导出结构', () => {
  it('导出全部：schema / 时间戳 / 配置 / 模型 / 题目 / 回答 / 评审齐备', () => {
    const { store } = freshStore()
    seedAll(store)

    const p = buildExport('all', ctx(store))
    expect(p.schema).toBe(SCHEMA_ID)
    expect(p.scope).toBe('all')
    expect(typeof p.exported_at).toBe('string')
    expect(new Date(p.exported_at).toString()).not.toBe('Invalid Date')
    expect(p.config.dimensions.length).toBe(5)
    expect(p.config.failure_labels.length).toBe(8)
    expect(p.config.stream).toBe(store.stream)
    expect(p.models.length).toBe(4)
    expect(p.cases.length).toBe(6)
    expect(p.answers.length).toBe(24)
    expect(p.reviews.length).toBe(20)
  })

  it('仅导出评审记录 / 仅导出回答：字段范围与原型一致', () => {
    const { store } = freshStore()
    seedAll(store)

    const r = buildExport('reviews', ctx(store))
    expect(r.scope).toBe('reviews')
    expect(r.reviews.length).toBe(20)
    expect(r.cases).toBeUndefined()
    expect(r.answers).toBeUndefined()
    expect(r.models).toBeUndefined()

    const a = buildExport('answers', ctx(store))
    expect(a.scope).toBe('answers')
    expect(a.answers.length).toBe(24)
    expect(a.cases.length).toBe(6)
    expect(a.models.length).toBe(4)
    expect(a.reviews).toBeUndefined()
  })
})

describe('P6 · 导出 → 清空 → 导入 闭环还原', () => {
  it('同一份 JSON 往返后，评审记录 / 状态 / 分数 / 自定义回答完全还原', () => {
    const { store } = freshStore()
    seedAll(store)
    /* 覆盖一条内置回答，制造自定义回答 */
    store.putAnswer('FQ-001', 'doubao', '自定义覆盖回答：波动风险与口径提示。', [])

    const payload = buildExport('all', ctx(store))
    const before = {
      reviews: store.allReviews.length,
      done: store.allReviews.filter((x) => x.status === 'done').length,
      wencaiTotal: reviewTotal(store.getReview('FQ-001', 'wencai')),
      customText: store.answersOf('FQ-001').find((x) => x.model_id === 'doubao').answer,
    }

    /* 清空：评审记录 + 自定义回答 */
    store.clearAllReviews()
    store.answersStore.custom = []
    store.persistAnswers()
    expect(store.allReviews.length).toBe(0)

    /* 导入同一份 JSON */
    const ok = store.importData(payload, { replace: true, reviews: true })
    expect(ok.length).toBe(3) // 6 题 / 24 条回答 / 20 条评审记录

    expect(store.allReviews.length).toBe(before.reviews)
    expect(store.allReviews.filter((x) => x.status === 'done').length).toBe(before.done)
    expect(reviewTotal(store.getReview('FQ-001', 'wencai'))).toBe(before.wencaiTotal)
    expect(store.answersOf('FQ-001').find((x) => x.model_id === 'doubao').answer).toBe(before.customText)
    expect(store.answersStore.custom.every((x) => x.custom === true)).toBe(true)
  })

  it('「同时导入评审记录」关闭时不导入 reviews', () => {
    const { store } = freshStore()
    seedAll(store)
    const payload = buildExport('all', ctx(store))
    store.clearAllReviews()

    store.importData(payload, { replace: false, reviews: false })
    expect(store.allReviews.length).toBe(0)
  })
})

describe('P6 · 导入合并规则（复刻原型 importData）', () => {
  it('cases 按 case_id 合并；answers 标记 custom 并按 id 去重覆盖', () => {
    const { store } = freshStore()
    const payload = {
      schema: SCHEMA_ID,
      cases: [
        { case_id: 'FQ-001', title: '改写后的标题', question: 'q', reference_answer: '', reference_values: [], allowed_evidence: [], cutoff_at: '', risk_labels: [], focus: '' },
        { case_id: 'FQ-999', title: '新问题', question: 'q2', reference_answer: '', reference_values: [], allowed_evidence: [], cutoff_at: '', risk_labels: [], focus: '' },
      ],
      answers: [{ id: 'FQ-001::wencai', case_id: 'FQ-001', model_id: 'wencai', answer: '导入覆盖文本', citations: [] }],
    }
    store.importData(payload, { replace: false, reviews: true })

    expect(store.cases.length).toBe(7) // 6 内置 + 1 新（FQ-001 按 id 合并覆盖，不新增）
    expect(store.caseById('FQ-001').title).toBe('改写后的标题')
    expect(store.caseById('FQ-999')).toBeTruthy()
    const a = store.answersStore.custom.find((x) => x.id === 'FQ-001::wencai')
    expect(a.custom).toBe(true)
    expect(a.answer).toBe('导入覆盖文本')
    /* 覆盖后内置同 id 回答不再重复出现 */
    expect(store.answersOf('FQ-001').filter((x) => x.model_id === 'wencai').length).toBe(1)
  })

  it('reviews 按 (case_id,model_id) 覆盖；分数 clamp 0–5；非法状态回落 none', () => {
    const { store } = freshStore()
    store.importData(
      {
        schema: SCHEMA_ID,
        reviews: [
          {
            case_id: 'FQ-001',
            model_id: 'wencai',
            scores: { accuracy: 9, citation: -3, timeliness: 3, safety: 4, quality: 5 },
            failures: ['num_error'],
            comment: '越界分数',
            status: 'not-a-status',
            reviewed_at: '2025-06-30T20:10:00+08:00',
          },
        ],
      },
      { replace: false, reviews: true },
    )

    const r = store.getReview('FQ-001', 'wencai')
    expect(r.scores.accuracy).toBe(5)
    expect(r.scores.citation).toBe(0)
    expect(r.status).toBe('none')
    expect(r.comment).toBe('越界分数')
    expect(r.failures).toEqual(['num_error'])
    expect(r.demo).toBe(false)
  })

  it('无法识别的 JSON 返回空并提示失败', () => {
    const { store } = freshStore()
    expect(store.importData(null)).toEqual([])
    expect(store.importData({ foo: 1 })).toEqual([])
    expect(store.toasts[store.toasts.length - 1].isErr).toBe(true)
  })
})

describe('P6 · 演示数据管理', () => {
  it('恢复内置演示数据 / 清空全部评审记录 / 还原被删除的内置回答', () => {
    const { store } = freshStore()
    seedAll(store)
    store.putAnswer('FQ-001', 'doubao', 'x', [])
    store.deleteAnswer('FQ-001', 'qwen', 'FQ-001::qwen', false)
    expect(store.answersStore.deleted.length).toBe(1)

    store.restoreAnswers()
    expect(store.answersStore.deleted.length).toBe(0)

    store.clearAllReviews()
    expect(store.allReviews.length).toBe(0)
    expect(store.cases.length).toBe(6)

    store.putAnswer('FQ-001', 'doubao', 'y', [])
    store.resetAll()
    expect(store.cases.length).toBe(6)
    expect(store.allReviews.length).toBe(0)
    expect(store.answersStore.custom.length).toBe(0)
    expect(store.answersStore.deleted.length).toBe(0)
    expect(store.chat.sessions.length).toBe(1)
  })
})

describe('P6 · 汇总报告（程序产出，与页面同口径）', () => {
  it('buildReportData 数值与页面统计一致', () => {
    const { store } = freshStore()
    seedAll(store)
    const models = store.allModels()
    const data = buildReportData({
      cases: store.cases,
      answers: store.cases.flatMap((c) => store.answersOf(c.case_id)),
      reviews: store.allReviews,
      models,
      askedCaseIds: store.askedCases.map((c) => c.case_id),
    })

    expect(data.askedCount).toBe(5)
    expect(data.totalAns).toBe(20)
    expect(data.doneCount).toBe(18)
    expect(data.rate).toBe('90')
    expect(data.matrix.length).toBe(5)
    expect(data.matrix[0].avg).toBeCloseTo(75.5, 5)
    expect(data.matrix[0].cells.length).toBe(4)
    expect(data.allLabels.invalid_citation).toBe(6)
    /* 基准模型无失败标签 */
    expect(Object.values(data.perModelLabels.wencai).reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('reportMarkdown 含覆盖率 / 分维表 / 标签分布 / 问题×模型对比 / 排行榜', () => {
    const { store } = freshStore()
    seedAll(store)
    const models = store.allModels()
    const data = buildReportData({
      cases: store.cases,
      answers: store.cases.flatMap((c) => store.answersOf(c.case_id)),
      reviews: store.allReviews,
      models,
      askedCaseIds: store.askedCases.map((c) => c.case_id),
    })
    const md = reportMarkdown({ generatedAt: '2026-10-02 10:00', models, ...data })

    expect(md).toContain('# 金融 Agent 评测汇总报告')
    expect(md).toContain('## 覆盖率统计')
    expect(md).toContain('- 完成率：90%')
    expect(md).toContain('## 各模型汇总')
    expect(md).toContain('### 分模型分布')
    expect(md).toContain('## 问题 × 模型对比')
    expect(md).toContain('| FQ-001 年报口径与数字核对 |')
    expect(md).toContain('## 排行榜')
    expect(md).toContain('| 1 | 同花顺问财 | 97.6 |')

    /* 表格列数一致，避免错位 */
    const rows = md.split('\n').filter((l) => l.startsWith('|'))
    rows.forEach((line) => {
      const groups = line.split('|').length - 2
      expect(groups).toBeGreaterThan(0)
    })
  })

  it('leaderboardMarkdown 名次与维度权重正确', () => {
    const { store } = freshStore()
    seedAll(store)
    const models = store.allModels()
    const agg = buildReportData({
      cases: store.cases,
      answers: store.cases.flatMap((c) => store.answersOf(c.case_id)),
      reviews: store.allReviews,
      models,
      askedCaseIds: store.askedCases.map((c) => c.case_id),
    }).agg
    const md = leaderboardMarkdown({ scopeLabel: '全部问题', sampleN: agg.n, agg, models })
    expect(md).toContain('# 金融 Agent 评测排行榜（全部问题）')
    expect(md).toContain('数字正确性(30%)')
    expect(md).toContain('| 1 | 同花顺问财 | 97.6 |')
  })
})

describe('P6 · 数据导入导出视图', () => {
  it('渲染统计卡 / 导出导入按钮 / 折叠快照，且开关默认勾选', async () => {
    const { pinia, store } = freshStore()
    seedAll(store)
    const wrapper = mount(DataIO, { global: { plugins: [pinia] } })
    await nextTick()

    /* 4 统计卡：参考问题 / 回答 / 评审记录 / 自定义回答 */
    const stats = wrapper.findAll('.stat .v').map((v) => v.text())
    expect(stats).toEqual(['6条', '24条', '20条', '0条'])

    /* 导出三按钮 + 复制 + 报告 */
    const btns = wrapper.findAll('button').map((b) => b.text())
    expect(btns).toContain('导出全部')
    expect(btns).toContain('仅导出评审记录')
    expect(btns).toContain('仅导出回答')
    expect(btns).toContain('复制 JSON 到剪贴板')
    expect(btns).toContain('导出汇总报告（.md）')

    /* 两个导入开关默认勾选 */
    const checks = wrapper.findAll('input[type="checkbox"]')
    expect(checks.length).toBe(2)
    expect(checks.every((c) => c.element.checked)).toBe(true)

    /* 只读快照包含 schema 与内部编号 */
    const snapshot = wrapper.find('textarea.snapshot').element.value
    expect(snapshot).toContain(SCHEMA_ID)
    expect(snapshot).toContain('FQ-001')
  })

  it('从文本框导入：非法 JSON 提示失败，合法 JSON 生效', async () => {
    const { pinia, store } = freshStore()
    const wrapper = mount(DataIO, { global: { plugins: [pinia] } })
    await nextTick()

    const ta = wrapper.find('textarea.ctl')
    await ta.setValue('{ not json }')
    await wrapper.findAll('button').find((b) => b.text() === '从文本框导入').trigger('click')
    expect(store.toasts[store.toasts.length - 1].isErr).toBe(true)

    await ta.setValue(
      JSON.stringify({ schema: SCHEMA_ID, reviews: [{ case_id: 'FQ-001', model_id: 'wencai', scores: { accuracy: 5, citation: 5, timeliness: 5, safety: 5, quality: 5 }, status: 'done' }] }),
    )
    await wrapper.findAll('button').find((b) => b.text() === '从文本框导入').trigger('click')
    await flushPromises()
    expect(store.getReview('FQ-001', 'wencai').status).toBe('done')
    expect(ta.element.value).toBe('')
  })
})