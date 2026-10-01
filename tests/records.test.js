import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import { useArenaStore } from '@/stores/arena'
import { aggregate, keyOf } from '@/lib/scoring'
import { LS } from '@/lib/storage'
import Records from '@/views/Records.vue'

/* 每个用例都用干净的 Pinia + localStorage */
function freshStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArenaStore()
  store.loadState()
  return { pinia, store }
}

function reloadStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArenaStore()
  store.loadState()
  return store
}

function storedReviews() {
  return JSON.parse(localStorage.getItem(LS.reviews) || 'null')
}

/* 记录页用 useRouter，测试提供内存路由 */
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/records' },
      { path: '/records', name: 'records', component: { template: '<div />' } },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
    ],
  })
}

async function mountRecords(pinia) {
  const router = makeRouter()
  await router.push('/records')
  await router.isReady()
  const wrapper = mount(Records, { global: { plugins: [pinia, router] } })
  await nextTick()
  return { wrapper, router }
}

function btnByText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text().trim() === text)
}

/* 让 demo 数据 + 两次提问构造出 8 行记录（FQ-001 / FQ-002 各 4 条） */
async function seeded(pinia, store) {
  store.loadDemoReviews()
  store.askQuestion('FQ-001')
  store.askQuestion('FQ-002')
  return mountRecords(pinia)
}

beforeEach(() => {
  localStorage.clear()
})

describe('评审记录 · 视图与筛选（复刻 reviewRows）', () => {
  it('未提问时整个视图为空状态，不渲染筛选与表格', async () => {
    const { pinia, store } = freshStore()
    store.loadDemoReviews() // 只有评审数据、没有提问：记录页仍应为空

    const { wrapper } = await mountRecords(pinia)
    expect(store.askedCases.length).toBe(0)
    expect(store.reviewRows.length).toBe(0)
    expect(wrapper.find('table.tbl.records').exists()).toBe(false)
    expect(wrapper.text()).toContain('还没有提问')
  })

  it('四个筛选维度任意组合均正确过滤', () => {
    const { store } = freshStore()
    store.loadDemoReviews()
    store.askQuestion('FQ-001')
    store.askQuestion('FQ-002')

    expect(store.reviewRows.length).toBe(8)

    // 维度一：问题
    store.filters.caseId = 'FQ-001'
    expect(store.reviewRows.length).toBe(4)
    expect(store.reviewRows.every((x) => x.c.case_id === 'FQ-001')).toBe(true)

    // 维度二：模型
    store.resetFilters()
    store.filters.modelId = 'wencai'
    expect(store.reviewRows.length).toBe(2)
    expect(store.reviewRows.every((x) => x.a.model_id === 'wencai')).toBe(true)

    // 维度三：状态（仅 FQ-002/qwen 为 doing）
    store.resetFilters()
    store.filters.status = 'doing'
    expect(store.reviewRows.length).toBe(1)
    expect(store.reviewRows[0].c.case_id).toBe('FQ-002')
    expect(store.reviewRows[0].a.model_id).toBe('qwen')

    // 维度四：失败标签（FQ-001 qwen/yuanbao + FQ-002 yuanbao）
    store.resetFilters()
    store.filters.label = 'num_error'
    expect(store.reviewRows.length).toBe(3)
    expect(store.reviewRows.every((x) => x.r.failures.includes('num_error'))).toBe(true)

    // 四维组合命中唯一一条
    Object.assign(store.filters, { caseId: 'FQ-001', modelId: 'qwen', status: 'done', label: 'num_error' })
    expect(store.reviewRows.length).toBe(1)
    expect(store.reviewRows[0].a.model_id).toBe('qwen')

    // 组合不命中
    store.filters.modelId = 'wencai'
    expect(store.reviewRows.length).toBe(0)
  })

  it('记录页组件：筛选实时联动、重置、编辑打开弹窗、查看跳转对话评审', async () => {
    const { pinia, store } = freshStore()
    const { wrapper, router } = await seeded(pinia, store)

    const rows = () => wrapper.findAll('table.tbl.records tbody tr')
    expect(rows().length).toBe(8)
    expect(wrapper.text()).toContain('命中 8 条')

    // 第 3 个 select 是「状态」，切到评审中 → 只剩 1 行
    await wrapper.findAll('select')[2].setValue('doing')
    await nextTick()
    expect(rows().length).toBe(1)
    expect(rows()[0].text()).toContain('评审中')
    expect(wrapper.text()).toContain('命中 1 条')

    // 重置筛选 → 恢复 8 行
    await btnByText(wrapper, '重置筛选').trigger('click')
    await nextTick()
    expect(rows().length).toBe(8)

    // 操作列「编辑」打开评审弹窗（复用 P3 ReviewModal 的 store 态）
    await btnByText(wrapper, '编辑').trigger('click')
    expect(store.reviewModal).not.toBe(null)
    expect(store.reviewModal.caseId).toBe(store.reviewRows[0].c.case_id)
    store.closeReviewModal()

    // 操作列「查看」跳转到该题的对话评审回合
    const targetCase = store.reviewRows[0].c.case_id
    await btnByText(wrapper, '查看').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/chat')
    expect(store.chat.focusCaseId).toBe(targetCase)
    const idx = store.chat.rounds.findIndex((r) => r.caseId === targetCase)
    expect(store.chat.expandedRounds).toEqual([idx])
  })
})

describe('评审记录 · 编辑已保存记录并跨视图联动', () => {
  it('保存即落盘、刷新后为新值，aggregate 结果同步变化', () => {
    const { store } = freshStore()
    store.loadDemoReviews()
    store.askQuestion('FQ-001')

    // 编辑前：FQ-001/wencai 为五维满分演示记录
    const before = aggregate('FQ-001', { reviews: store.allReviews, models: store.allModels() })
    expect(before.n).toBe(4)
    expect(before.byModel.wencai.avg).toBe(100)
    expect(before.byModel.wencai.labels.num_error).toBe(0)

    // 通过弹窗草稿改分数 / 标签 / 评语，点保存
    store.openReviewModal('FQ-001', 'wencai')
    store.modalSetScore('accuracy', 2) // 5 → 2
    store.modalToggleTag('num_error')
    store.modalSetComment('人工复核：数字口径错误')
    store.saveReviewModal()
    expect(store.reviewModal).toBe(null)

    // 立即落盘（不走防抖）
    const saved = storedReviews()[keyOf('FQ-001', 'wencai')]
    expect(saved.scores.accuracy).toBe(2)
    expect(saved.failures).toEqual(['num_error'])
    expect(saved.comment).toBe('人工复核：数字口径错误')

    // 模拟刷新：新 Pinia 从 localStorage 恢复，新值仍在
    const reloaded = reloadStore()
    const r = reloaded.getReview('FQ-001', 'wencai')
    expect(r.scores.accuracy).toBe(2)
    expect(r.comment).toBe('人工复核：数字口径错误')

    // 共用 store 的汇总口径随之变化（排行榜/报告消费同一份 reviews）
    const after = aggregate('FQ-001', { reviews: reloaded.allReviews, models: reloaded.allModels() })
    expect(after.byModel.wencai.avg).toBe(82) // (2/5×0.30 + 1×0.70) × 100
    expect(after.byModel.wencai.labels.num_error).toBe(1)
  })

  it('进题查看：focusCaseRound 定位并展开该题回合，clearFocusCase 复位', () => {
    const { store } = freshStore()
    store.askQuestion('FQ-001')
    store.askQuestion('FQ-002')
    store.collapseRound(0)
    store.collapseRound(1)
    expect(store.chat.expandedRounds).toEqual([])

    store.focusCaseRound('FQ-001')
    const idx = store.chat.rounds.findIndex((r) => r.caseId === 'FQ-001')
    expect(store.chat.expandedRounds).toEqual([idx])
    expect(store.chat.focusCaseId).toBe('FQ-001')

    store.clearFocusCase()
    expect(store.chat.focusCaseId).toBe(null)
  })
})
