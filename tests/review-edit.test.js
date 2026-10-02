import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useArenaStore } from '@/stores/arena'
import { LS } from '@/lib/storage'
import { keyOf, reviewTotal } from '@/lib/scoring'

/* 题目「必须完成」第 5 条：允许修改已保存的评分和评语 */
const DIMS = ['accuracy', 'citation', 'timeliness', 'safety', 'quality']

function freshStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArenaStore()
  store.loadState()
  return store
}

const storedReviews = () => JSON.parse(localStorage.getItem(LS.reviews) || 'null')

beforeEach(() => {
  localStorage.clear()
  /* 同时假造 Date，保证 updated_at 的前后变化可确定复现 */
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date('2026-10-02T10:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('P7 · 修改已保存的评审记录', () => {
  it('done 记录解锁后改分 / 改标签 / 改评语并 saveReview：覆盖同一条（不新增），updated_at 前进', () => {
    const store = freshStore()
    const k = keyOf('FQ-001', 'wencai')

    /* 先保存一条「已完成」记录 */
    DIMS.forEach((d) => store.setScore('FQ-001', 'wencai', d, 5))
    store.setComment('FQ-001', 'wencai', '初版评语')
    expect(store.submitReview('FQ-001', 'wencai')).toBe(true)

    const first = { ...storedReviews()[k] }
    expect(first.status).toBe('done')
    expect(first.failures).toEqual([])
    expect(first.updated_at).toBe('2026-10-02T10:00:00.000Z')

    /* 已提交默认锁定：直接改分被拒 */
    store.setScore('FQ-001', 'wencai', 'accuracy', 1)
    expect(store.getReview('FQ-001', 'wencai').scores.accuracy).toBe(5)

    /* 点 ✎ 解锁后可编辑 */
    store.toggleEditScore('FQ-001::wencai')
    expect(store.isLocked('FQ-001', 'wencai')).toBe(false)

    vi.setSystemTime(new Date('2026-10-02T10:05:00.000Z')) // 时间前进，区分 updated_at
    store.setScore('FQ-001', 'wencai', 'accuracy', 2)
    store.toggleTag('FQ-001', 'wencai', 'num_error')
    store.setComment('FQ-001', 'wencai', '复核后改判：关键数字错误')
    store.saveReview('FQ-001', 'wencai')

    /* 覆盖而非新增：仍然是同一个 key，只有一条记录 */
    const keys = Object.keys(storedReviews())
    expect(keys).toEqual([k])

    const after = storedReviews()[k]
    expect(after.scores.accuracy).toBe(2)
    expect(after.scores.safety).toBe(5) // 未改动的维度保留
    expect(after.failures).toEqual(['num_error'])
    expect(after.comment).toBe('复核后改判：关键数字错误')
    expect(after.updated_at).toBe('2026-10-02T10:05:00.000Z')
    expect(after.updated_at).not.toBe(first.updated_at)
    /* (2/5×0.30 + 1×0.70)×100 = 82 */
    expect(reviewTotal(after)).toBe(82)
  })

  it('评审记录页的编辑弹窗：保存写回 done 记录，updated_at 更新且 reviewed_at 不变', () => {
    const store = freshStore()
    const k = keyOf('FQ-003', 'yuanbao')

    DIMS.forEach((d) => store.setScore('FQ-003', 'yuanbao', d, 4))
    store.submitReview('FQ-003', 'yuanbao')
    const first = { ...storedReviews()[k] }
    expect(reviewTotal(first)).toBe(80)

    vi.setSystemTime(new Date('2026-10-02T11:30:00.000Z'))
    store.openReviewModal('FQ-003', 'yuanbao')
    DIMS.forEach((d) => store.modalSetScore(d, 3))
    store.modalToggleTag('risk_missed')
    store.modalSetComment('弹窗复核：未提示风险')
    store.modalSetStatus('done')
    store.saveReviewModal()

    expect(store.reviewModal).toBe(null)
    const after = storedReviews()[k]
    expect(Object.keys(storedReviews())).toEqual([k]) // 覆盖，不新增
    expect(after.failures).toEqual(['risk_missed'])
    expect(after.comment).toBe('弹窗复核：未提示风险')
    expect(reviewTotal(after)).toBe(60)
    expect(after.updated_at).toBe('2026-10-02T11:30:00.000Z')
    expect(after.reviewed_at).toBe(first.reviewed_at) // 首次评审时间保留
  })
})
