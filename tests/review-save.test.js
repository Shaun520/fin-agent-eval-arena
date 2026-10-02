import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useArenaStore } from '@/stores/arena'
import { LS, AUTOSAVE_DEBOUNCE_MS } from '@/lib/storage'
import { keyOf, reviewTotal } from '@/lib/scoring'

/* 题目「必须完成」第 5 条：保存每条评审记录，刷新后仍可恢复 */
const DIMS = ['accuracy', 'citation', 'timeliness', 'safety', 'quality']

function freshStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArenaStore()
  store.loadState()
  return store
}

/* 直接读 localStorage 里的评审映射，验证「真的落盘」而非仅内存态 */
const storedReviews = () => JSON.parse(localStorage.getItem(LS.reviews) || 'null')

beforeEach(() => {
  localStorage.clear()
  /* 只假造定时器，保留真实 Date / microtask，便于精确控制 260ms 防抖 */
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('P7 · 评审记录保存落盘', () => {
  it('打分走 260ms 防抖落盘：窗口内不写，到期后写入且字段与状态正确', () => {
    const store = freshStore()
    DIMS.forEach((d) => store.setScore('FQ-001', 'wencai', d, 4))

    /* 防抖窗口内：内存已更新，localStorage 仍为空 */
    expect(reviewTotal(store.getReview('FQ-001', 'wencai'))).toBe(80)
    expect(storedReviews()).toBe(null)

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 1)
    const r = storedReviews()[keyOf('FQ-001', 'wencai')]
    expect(r.case_id).toBe('FQ-001')
    expect(r.model_id).toBe('wencai')
    expect(r.status).toBe('doing') // 未提交 → 评审中
    expect(Object.keys(r.scores).sort()).toEqual([...DIMS].sort())
    expect(r.updated_at).toBeTruthy()
    expect(r.demo).toBe(false)
    expect(reviewTotal(r)).toBe(80)
  })

  it('saveReview 立即落盘：状态、标签、评语、时间戳写入 localStorage', () => {
    const store = freshStore()
    DIMS.forEach((d) => store.setScore('FQ-002', 'doubao', d, 3))
    store.toggleTag('FQ-002', 'doubao', 'stale_data')
    store.setComment('FQ-002', 'doubao', '使用旧口径数据，未标注期间')
    store.saveReview('FQ-002', 'doubao')

    const r = storedReviews()[keyOf('FQ-002', 'doubao')]
    expect(r.status).toBe('doing')
    expect(r.failures).toEqual(['stale_data'])
    expect(r.comment).toBe('使用旧口径数据，未标注期间')
    expect(r.reviewed_at).toBeTruthy()
    expect(r.updated_at).toBeTruthy()
    expect(reviewTotal(r)).toBe(60)
  })

  it('提交为「已完成」：五维齐全才可提交，提交后刷新可恢复', () => {
    const store = freshStore()
    DIMS.forEach((d) => store.setScore('FQ-003', 'qwen', d, 5))
    expect(store.submitReview('FQ-003', 'qwen')).toBe(true)

    const r = storedReviews()[keyOf('FQ-003', 'qwen')]
    expect(r.status).toBe('done')
    expect(r.reviewed_at).toBe(r.updated_at)
    expect(reviewTotal(r)).toBe(100)

    /* 模拟刷新：新建 store 重新 loadState */
    const reloaded = freshStore()
    expect(reloaded.getReview('FQ-003', 'qwen').status).toBe('done')
    expect(reloaded.getReview('FQ-003', 'qwen').scores.accuracy).toBe(5)
  })

  it('缺维度提交被拦截，不会产生 done 记录', () => {
    const store = freshStore()
    store.setScore('FQ-004', 'yuanbao', 'accuracy', 5) // 仅 1 维

    expect(store.submitReview('FQ-004', 'yuanbao')).toBe(false)
    expect(store.getReview('FQ-004', 'yuanbao').status).toBe('doing')
    expect(store.toasts.at(-1).isErr).toBe(true)

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 1)
    expect(storedReviews()[keyOf('FQ-004', 'yuanbao')].status).toBe('doing')
  })
})
