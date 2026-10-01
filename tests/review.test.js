import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useArenaStore } from '@/stores/arena'
import { reviewTotal } from '@/lib/scoring'
import { LS, SCHEMA_ID, AUTOSAVE_DEBOUNCE_MS } from '@/lib/storage'
import { buildCaseExport } from '@/lib/export'
import ReviewPanel from '@/components/chat/ReviewPanel.vue'
import ReviewModal from '@/components/review/ReviewModal.vue'

const DIMS = ['accuracy', 'citation', 'timeliness', 'safety', 'quality']

/* 每个用例都用干净的 Pinia + localStorage；用假定时器精确控制 260ms 防抖 */
function freshStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArenaStore()
  store.loadState()
  return { pinia, store }
}

function storedReviews() {
  return JSON.parse(localStorage.getItem(LS.reviews) || 'null')
}

beforeEach(() => {
  localStorage.clear()
  /* 只假造定时器，保留 queueMicrotask / performance，避免影响 Vue 的调度与组件挂载 */
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('评分数据流 · UI→store→localStorage', () => {
  it('五维打分：总分按公式即时更新，状态进入 doing，防抖 260ms 后才落盘', () => {
    const { store } = freshStore()
    DIMS.forEach((d) => store.setScore('FQ-001', 'wencai', d, 5))
    store.setScore('FQ-001', 'wencai', 'accuracy', 2) // 覆盖为 2

    const r = store.getReview('FQ-001', 'wencai')
    expect(r.scores.accuracy).toBe(2)
    expect(r.status).toBe('doing')
    /* (2/5×0.30 + 1×0.70) × 100 = 82 */
    expect(reviewTotal(r)).toBe(82)

    /* 防抖窗口内尚未落盘 */
    expect(storedReviews()).toBe(null)
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 1)
    expect(storedReviews()['FQ-001||wencai'].status).toBe('doing')
  })

  it('标签 / 评语 / 状态一并落盘', () => {
    const { store } = freshStore()
    store.toggleTag('FQ-001', 'doubao', 'num_error')
    store.setComment('FQ-001', 'doubao', '数字口径与参考答案不符')
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 1)

    const raw = storedReviews()['FQ-001||doubao']
    expect(raw.failures).toEqual(['num_error'])
    expect(raw.comment).toBe('数字口径与参考答案不符')
    expect(raw.status).toBe('doing')
  })

  it('提交前缺维度被拦截，不允许置 done', () => {
    const { store } = freshStore()
    store.setScore('FQ-001', 'wencai', 'accuracy', 5) // 只打 1 维

    expect(store.submitReview('FQ-001', 'wencai')).toBe(false)
    expect(store.getReview('FQ-001', 'wencai').status).not.toBe('done')
    expect(store.toasts.at(-1).isErr).toBe(true)
    expect(store.toasts.at(-1).msg).toContain('引用与证据')
  })

  it('提交立即落盘（不受防抖影响）', () => {
    const { store } = freshStore()
    DIMS.forEach((d) => store.setScore('FQ-002', 'doubao', d, 5))
    expect(store.submitReview('FQ-002', 'doubao')).toBe(true)
    expect(storedReviews()['FQ-002||doubao'].status).toBe('done')
    expect(storedReviews()['FQ-002||doubao'].reviewed_at).toBeTruthy()
  })

  it('刷新后（重新 loadState）分数 / 标签 / 评语 / 状态完整恢复', () => {
    const { store } = freshStore()
    DIMS.forEach((d) => store.setScore('FQ-004', 'qwen', d, 4))
    store.toggleTag('FQ-004', 'qwen', 'risk_missed')
    store.setComment('FQ-004', 'qwen', '未提示风险')
    store.persistReviews() // 显式落盘

    const { store: reloaded } = freshStore()
    const r = reloaded.getReview('FQ-004', 'qwen')
    expect(r.scores.accuracy).toBe(4)
    expect(r.failures).toEqual(['risk_missed'])
    expect(r.comment).toBe('未提示风险')
    expect(reviewTotal(r)).toBe(80)
  })
})

describe('锁定与解锁', () => {
  it('已提交默认锁定；未解锁改分被拒；✎ 解锁后可改并重新提交', () => {
    const { store } = freshStore()
    DIMS.forEach((d) => store.setScore('FQ-001', 'wencai', d, 5))
    expect(store.submitReview('FQ-001', 'wencai')).toBe(true)
    expect(store.isLocked('FQ-001', 'wencai')).toBe(true)

    /* 未解锁：改分/改标签/清空都被拒 */
    store.setScore('FQ-001', 'wencai', 'accuracy', 1)
    expect(store.getReview('FQ-001', 'wencai').scores.accuracy).toBe(5)
    store.resetReview('FQ-001', 'wencai')
    expect(store.getReview('FQ-001', 'wencai').status).toBe('done')

    /* ✎ 解锁后可改，并由「重新提交」写回 */
    store.toggleEditScore('FQ-001::wencai')
    expect(store.isLocked('FQ-001', 'wencai')).toBe(false)
    store.setScore('FQ-001', 'wencai', 'accuracy', 1)
    expect(store.getReview('FQ-001', 'wencai').scores.accuracy).toBe(1)
    expect(store.submitReview('FQ-001', 'wencai')).toBe(true)
    expect(store.chat.editing).toBe(null)
  })

  it('三态按钮置「已完成」时缺维度同样被拦截', () => {
    const { store } = freshStore()
    expect(store.setStatus('FQ-001', 'yuanbao', 'done')).toBe(false)
    expect(store.getReview('FQ-001', 'yuanbao').status).not.toBe('done')
    expect(store.setStatus('FQ-001', 'yuanbao', 'doing')).toBe(true)
    expect(store.getReview('FQ-001', 'yuanbao').status).toBe('doing')
  })
})

describe('评审编辑弹窗（草稿态，保存才写回）', () => {
  it('打开 → 改草稿 → 保存写回；取消不改动', () => {
    const { store } = freshStore()
    store.openReviewModal('FQ-001', 'qwen')
    expect(store.reviewModal.caseId).toBe('FQ-001')

    DIMS.forEach((d) => store.modalSetScore(d, 3))
    store.modalToggleTag('stale_data')
    store.modalSetComment('弹窗内写回的评语')
    store.modalSetStatus('done')
    store.saveReviewModal()

    expect(store.reviewModal).toBe(null)
    const r = store.getReview('FQ-001', 'qwen')
    expect(r.scores.safety).toBe(3)
    expect(r.failures).toEqual(['stale_data'])
    expect(r.comment).toBe('弹窗内写回的评语')
    expect(r.status).toBe('done')
    expect(r.reviewed_at).toBeTruthy()

    /* 取消：只改草稿，不写回 */
    store.openReviewModal('FQ-001', 'qwen')
    store.modalSetComment('不应写回')
    store.closeReviewModal()
    expect(store.getReview('FQ-001', 'qwen').comment).toBe('弹窗内写回的评语')
  })

  it('组件渲染草稿，点击保存后关闭弹窗并写回', async () => {
    const { pinia, store } = freshStore()
    store.openReviewModal('FQ-003', 'yuanbao')
    const wrapper = mount(ReviewModal, {
      global: { plugins: [pinia], stubs: { teleport: true } },
    })
    expect(wrapper.find('.modal').exists()).toBe(true)
    expect(wrapper.find('.modal-q').text().length).toBeGreaterThan(0)

    await wrapper.findAll('.dim')[0].findAll('.scale button')[2].trigger('click')
    expect(store.reviewModal.drafts.accuracy).toBe(2)

    const footBtns = wrapper.findAll('.modal-foot button')
    await footBtns[1].trigger('click') // 保存
    expect(store.reviewModal).toBe(null)
    expect(store.getReview('FQ-003', 'yuanbao').scores.accuracy).toBe(2)
    wrapper.unmount()
  })
})

describe('演示评审数据', () => {
  it('一键载入 20 条 demo；清空只删 demo，保留自建记录', () => {
    const { store } = freshStore()
    store.setScore('FQ-006', 'wencai', 'accuracy', 5) // 自建记录（不在演示集内）
    store.persistReviews()

    expect(store.loadDemoReviews()).toBe(20)
    expect(store.allReviews.filter((r) => r.demo).length).toBe(20)
    expect(store.getReview('FQ-006', 'wencai').demo).toBe(false)

    expect(store.clearDemoReviews()).toBe(20)
    expect(store.allReviews.filter((r) => r.demo).length).toBe(0)
    expect(store.getReview('FQ-006', 'wencai').scores.accuracy).toBe(5)
  })

  it('载入演示不覆盖用户自建记录', () => {
    const { store } = freshStore()
    DIMS.forEach((d) => store.setScore('FQ-001', 'wencai', d, 1))
    store.persistReviews()

    store.loadDemoReviews()
    const r = store.getReview('FQ-001', 'wencai')
    expect(r.demo).toBe(false)
    expect(r.scores.accuracy).toBe(1)
  })
})

describe('导出本轮', () => {
  it('单轮导出：范围标记为 case:<id>，只含该题的回答与评审，并过滤空记录', () => {
    const { store } = freshStore()
    store.setScore('FQ-001', 'wencai', 'accuracy', 5) // 该题唯一一条有内容的评审
    store.persistReviews()

    const payload = buildCaseExport('FQ-001', {
      cases: store.cases,
      answersOf: (id) => store.answersOf(id),
      reviews: store.allReviews,
      models: store.allModels(),
      stream: store.stream,
    })

    expect(payload.schema).toBe(SCHEMA_ID)
    expect(payload.scope).toBe('case:FQ-001')
    expect(payload.cases.map((c) => c.case_id)).toEqual(['FQ-001'])
    expect(payload.answers.every((a) => a.case_id === 'FQ-001')).toBe(true)
    expect(payload.reviews.every((r) => r.case_id === 'FQ-001')).toBe(true)
    expect(payload.reviews.length).toBe(1)
    expect(payload.models.length).toBe(4)
  })

  it('exportRound 触发下载并提示', () => {
    const { store } = freshStore()
    store.exportRound('FQ-001')
    expect(store.toasts.at(-1).msg).toContain('已导出')
  })
})

describe('内联评审区组件', () => {
  it('点击打分按钮写入 store，并更新维度分值与加权总分', async () => {
    const { pinia, store } = freshStore()
    const c = store.caseById('FQ-001')
    const a = store.answersOf('FQ-001')[0]
    const wrapper = mount(ReviewPanel, { global: { plugins: [pinia] }, props: { c, a } })

    const dims = wrapper.findAll('.dim')
    for (let i = 0; i < DIMS.length; i++) {
      await dims[i].findAll('.scale button')[5].trigger('click')
    }
    expect(store.getReview('FQ-001', a.model_id).scores.accuracy).toBe(5)
    expect(dims[0].find('.total-mini').text()).toBe('5')

    /* 五维打满后，加权总分行显示 100.0 */
    expect(dims[5].find('.total-mini').text()).toBe('100.0')
    wrapper.unmount()
  })

  it('已提交后评分控件锁定（disabled / readonly）', () => {
    const { pinia, store } = freshStore()
    DIMS.forEach((d) => store.setScore('FQ-001', 'wencai', d, 5))
    store.submitReview('FQ-001', 'wencai')

    const c = store.caseById('FQ-001')
    const a = store.answersOf('FQ-001').find((x) => x.model_id === 'wencai')
    const wrapper = mount(ReviewPanel, { global: { plugins: [pinia] }, props: { c, a } })

    expect(wrapper.findAll('.scale button').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.find('textarea').attributes('readonly')).toBeDefined()
    expect(wrapper.find('.draft-note').text()).toContain('已自动保存')
    wrapper.unmount()
  })
})