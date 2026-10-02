import { describe, expect, it } from 'vitest'
import { MODELS } from '@/data/models'
import { FAILURE_LABELS } from '@/data/failureLabels'
import { aggregate, countLabels, countStatus, isSolved, reviewTotal, weightedTotal } from '@/lib/scoring'

/*
 * 题目「必须完成」第 6 条：为每个模型汇总总分、分维度得分和失败标签分布。
 * 用固定种子 DEMO_SCORES（不依赖页面交互），断言确定值。
 */
const ALL5 = { accuracy: 5, citation: 5, timeliness: 5, safety: 5, quality: 5 }

const DEMO_SCORES = [
  { case_id: 'FQ-001', model_id: 'wencai', scores: ALL5, failures: [], status: 'done' },
  {
    case_id: 'FQ-001',
    model_id: 'doubao',
    scores: { accuracy: 4, citation: 2, timeliness: 4, safety: 5, quality: 3 },
    failures: ['invalid_citation'],
    status: 'done',
  },
  {
    case_id: 'FQ-002',
    model_id: 'wencai',
    scores: { accuracy: 3, citation: 2, timeliness: 2, safety: 5, quality: 3 },
    failures: ['stale_data', 'invalid_citation'],
    status: 'done',
  },
  /* 评审中：不纳入统计 */
  { case_id: 'FQ-002', model_id: 'qwen', scores: ALL5, failures: [], status: 'doing' },
  /* 已完成但五维不全（缺 citation）：同样不纳入统计 */
  {
    case_id: 'FQ-003',
    model_id: 'yuanbao',
    scores: { accuracy: 5, citation: null, timeliness: 5, safety: 5, quality: 5 },
    failures: ['num_error'],
    status: 'done',
  },
]

describe('P7 · 汇总统计口径（只纳入「done 且五维齐全」）', () => {
  it('题均总分、分维度均分、失败标签计数为确定值', () => {
    const agg = aggregate('all', { reviews: DEMO_SCORES, models: MODELS })

    /* 5 条种子中，1 条 doing + 1 条维度缺失被排除 */
    expect(agg.n).toBe(3)

    /* 问财：100 与 64 两条 → 题均 82 */
    expect(agg.byModel.wencai.n).toBe(2)
    expect(agg.byModel.wencai.avg).toBe(82)
    expect(agg.byModel.wencai.dims.accuracy).toBe(4)
    expect(agg.byModel.wencai.dims.citation).toBe(3.5)
    expect(agg.byModel.wencai.dims.timeliness).toBe(3.5)
    expect(agg.byModel.wencai.dims.safety).toBe(5)
    expect(agg.byModel.wencai.dims.quality).toBe(4)
    expect(agg.byModel.wencai.labels.invalid_citation).toBe(1)
    expect(agg.byModel.wencai.labels.stale_data).toBe(1)

    /* 豆包：单条 76 */
    expect(agg.byModel.doubao.n).toBe(1)
    expect(agg.byModel.doubao.avg).toBeCloseTo(76, 6)
    expect(agg.byModel.doubao.dims.citation).toBe(2)

    /* 千问（doing）与元宝（维度缺失）均无计入样本 */
    expect(agg.byModel.qwen.n).toBe(0)
    expect(agg.byModel.qwen.avg).toBe(null)
    expect(agg.byModel.qwen.dims.accuracy).toBe(null)
    expect(agg.byModel.yuanbao.n).toBe(0)
    expect(agg.byModel.yuanbao.avg).toBe(null)
  })

  it('按单题范围聚合只统计该题', () => {
    const all = aggregate('FQ-001', { reviews: DEMO_SCORES, models: MODELS })
    expect(all.n).toBe(2)
    expect(all.byModel.wencai.avg).toBe(100)
    expect(all.byModel.doubao.avg).toBeCloseTo(76, 6)
    expect(all.byModel.qwen.n).toBe(0)

    const none = aggregate('FQ-999', { reviews: DEMO_SCORES, models: MODELS })
    expect(none.n).toBe(0)
  })

  it('countLabels 预置全部 8 个标签；countStatus 按状态计数', () => {
    const c = countLabels(DEMO_SCORES)
    expect(Object.keys(c).length).toBe(FAILURE_LABELS.length)
    expect(FAILURE_LABELS.length).toBe(8)
    expect(c.invalid_citation).toBe(2)
    expect(c.stale_data).toBe(1)
    expect(c.num_error).toBe(1) // 来自被排除统计的那条 done，标签统计只看内容
    expect(c.unit_error).toBe(0)

    expect(countStatus(DEMO_SCORES)).toEqual({ none: 0, doing: 1, done: 4 })
  })
})

describe('P7 · 加权总分边界', () => {
  it('五维满分 = 100；全 0 分 = 0', () => {
    expect(weightedTotal(ALL5)).toBe(100)
    expect(weightedTotal({ accuracy: 0, citation: 0, timeliness: 0, safety: 0, quality: 0 })).toBe(0)
    expect(reviewTotal({ scores: ALL5 })).toBe(100)
  })

  it('空分 / 缺维度返回 null；部分打分按已打分权重累计（不归一化）', () => {
    expect(weightedTotal({})).toBe(0)
    expect(weightedTotal({ accuracy: 5 })).toBe(30)
    expect(weightedTotal({ accuracy: 5, safety: 5 })).toBeCloseTo(55, 6)
    expect(reviewTotal({ scores: {} })).toBe(null)
    expect(reviewTotal({ scores: { ...ALL5, quality: null } })).toBe(null)
    expect(reviewTotal({})).toBe(null)
  })

  it('isSolved 要求 status=done 且五维齐全', () => {
    expect(isSolved({ status: 'done', scores: ALL5 })).toBe(true)
    expect(isSolved({ status: 'doing', scores: ALL5 })).toBe(false)
    expect(isSolved({ status: 'done', scores: { ...ALL5, quality: null } })).toBe(false)
  })
})
