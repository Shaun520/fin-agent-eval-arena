import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import { useArenaStore } from '@/stores/arena'
import { aggregate, countLabels, keyOf } from '@/lib/scoring'
import { leaderboardMarkdown, reportMarkdown } from '@/lib/export'
import Leaderboard from '@/views/Leaderboard.vue'
import Report from '@/views/Report.vue'
import LabelDistribution from '@/views/LabelDistribution.vue'
import LabelBars from '@/components/charts/LabelBars.vue'

/* 每个用例都用干净的 Pinia + localStorage */
function freshStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArenaStore()
  store.loadState()
  return { pinia, store }
}

/* 载入 20 条演示评审 + 提问全部 5 道参考题（构造出与原型一致的种子场景） */
function seedAll(store) {
  store.loadDemoReviews()
  ;['FQ-001', 'FQ-002', 'FQ-003', 'FQ-004', 'FQ-005'].forEach((id) => store.askQuestion(id))
}

/* 分析视图都用 useRouter，测试提供内存路由 */
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/leaderboard' },
      { path: '/leaderboard', name: 'leaderboard', component: { template: '<div />' } },
      { path: '/report', name: 'report', component: { template: '<div />' } },
      { path: '/labels', name: 'labels', component: { template: '<div />' } },
      { path: '/records', name: 'records', component: { template: '<div />' } },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
    ],
  })
}

async function mountView(Comp, pinia, path) {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Comp, { global: { plugins: [pinia, router] } })
  await nextTick()
  return { wrapper, router }
}

beforeEach(() => {
  localStorage.clear()
})

describe('分析视图 · 聚合口径与原型一致（同种子数据同结果）', () => {
  it('aggregate 只纳入「已完成且五维齐全」，题均总分与覆盖题数正确', () => {
    const { store } = freshStore()
    seedAll(store)

    const agg = aggregate('all', { reviews: store.allReviews, models: store.allModels() })
    expect(agg.n).toBe(18) // 20 条演示记录中 FQ-002/qwen、FQ-003/doubao 为「评审中」被排除

    expect(agg.byModel.wencai.avg).toBeCloseTo(97.6, 5)
    expect(agg.byModel.doubao.avg).toBeCloseTo(76.75, 5)
    expect(agg.byModel.qwen.avg).toBeCloseTo(70.25, 5)
    expect(agg.byModel.yuanbao.avg).toBeCloseTo(60.2, 5)

    expect(agg.byModel.wencai.n).toBe(5)
    expect(agg.byModel.doubao.n).toBe(4)
    expect(agg.byModel.qwen.n).toBe(4)
    expect(agg.byModel.yuanbao.n).toBe(5)

    // 分维度均分（抽验与原型 chart/明细表一致）
    expect(agg.byModel.wencai.dims.citation).toBeCloseTo(4.4, 5)
    expect(agg.byModel.wencai.dims.quality).toBeCloseTo(4.8, 5)
    expect(agg.byModel.doubao.dims.citation).toBeCloseTo(2.25, 5)
    expect(agg.byModel.qwen.dims.accuracy).toBeCloseTo(3.5, 5)
    expect(agg.byModel.yuanbao.dims.accuracy).toBeCloseTo(3, 5)
  })

  it('单题范围聚合：FQ-001 四模型题均总分正确', () => {
    const { store } = freshStore()
    seedAll(store)
    const agg = aggregate('FQ-001', { reviews: store.allReviews, models: store.allModels() })
    expect(agg.n).toBe(4)
    expect(agg.byModel.wencai.avg).toBe(100)
    expect(agg.byModel.doubao.avg).toBeCloseTo(76, 5)
    expect(agg.byModel.qwen.avg).toBe(73)
    expect(agg.byModel.yuanbao.avg).toBe(53)
  })
})

describe('模型排行榜视图', () => {
  it('渲染排行榜（名次/进度条/总分/覆盖）、分维度 SVG 图与明细表', async () => {
    const { pinia, store } = freshStore()
    seedAll(store)
    const { wrapper } = await mountView(Leaderboard, pinia, '/leaderboard')

    expect(wrapper.text()).toContain('样本：18 条「已完成且五维齐全」记录')

    // 名次降序：问财 > 豆包 > 千问 > 元宝
    const t = wrapper.text()
    expect(t.indexOf('同花顺问财')).toBeLessThan(t.indexOf('豆包'))
    expect(t.indexOf('豆包')).toBeLessThan(t.indexOf('千问'))
    expect(t.indexOf('千问')).toBeLessThan(t.indexOf('腾讯元宝'))

    // 原生 SVG 分组柱：5 维 × 4 模型 = 20 根柱
    expect(wrapper.findAll('svg').length).toBe(1)
    expect(wrapper.findAll('svg rect').length).toBe(20)

    // 分维度明细表：首行为问财 97.6
    const rows = wrapper.findAll('table.tbl tbody tr')
    expect(rows.length).toBe(4)
    expect(rows[0].text()).toContain('同花顺问财')
    expect(rows[0].text()).toContain('97.6')
    expect(rows[1].text()).toContain('76.8')
    expect(rows[2].text()).toContain('70.3')
    expect(rows[3].text()).toContain('60.2')
    // 问财 citation 均分 4.40 出现在明细行
    expect(rows[0].text()).toContain('4.40')
  })

  it('无评审数据时给出引导空态（未提问 / 已提问但无 solved 记录）', async () => {
    // 未提问：即使有演示评审也不展示排行榜
    const a = freshStore()
    a.store.loadDemoReviews({ ask: false })
    const ra = await mountView(Leaderboard, a.pinia, '/leaderboard')
    expect(ra.wrapper.text()).toContain('还没有提问')

    // 已提问但没有「已完成且五维齐全」记录：保留范围卡 + 空提示
    localStorage.clear()
    const b = freshStore()
    b.store.askQuestion('FQ-001')
    const rb = await mountView(Leaderboard, b.pinia, '/leaderboard')
    expect(rb.wrapper.find('select').exists()).toBe(true)
    expect(rb.wrapper.text()).toContain('还没有「已完成且五维齐全」的评审记录')
    expect(rb.wrapper.find('svg').exists()).toBe(false)
  })
})

describe('汇总报告视图', () => {
  it('统计卡、各模型汇总、标签分布与问题 × 模型矩阵数值正确', async () => {
    const { pinia, store } = freshStore()
    seedAll(store)
    const { wrapper } = await mountView(Report, pinia, '/report')

    // 4 个 StatCard：问题数 / 回答数 / 已完成评审 / 完成率
    const stats = wrapper.findAll('.stat .v').map((v) => v.text())
    expect(stats).toEqual(['5', '20条', '18 / 20', '90%'])

    // 无「已完成但维度缺失」记录 → 不显示 banner
    expect(wrapper.find('.banner').exists()).toBe(false)

    // 各模型汇总表：问财题均总分 97.6，失败标签合计 0
    const summary = wrapper.findAll('table.tbl')[0]
    expect(summary.text()).toContain('97.6')
    expect(summary.findAll('tbody tr').length).toBe(4)

    // 失败标签总体分布：引用无效 6 次居首
    const bars = wrapper.findAllComponents(LabelBars)
    expect(bars.length).toBe(2)
    expect(bars[0].props('counts').invalid_citation).toBe(6)
    expect(bars[0].props('counts').num_error).toBe(4)
    expect(bars[1].props('title')).toBe('同花顺问财（基准）')

    // 问题 × 模型矩阵：FQ-001 行 问财 100.0，均分 75.5，Top 标签含 ×2
    const matrix = wrapper.findAll('table.tbl')[1]
    const first = matrix.findAll('tbody tr')[0]
    expect(first.text()).toContain('100.0')
    expect(first.text()).toContain('75.5')
    expect(first.text()).toContain('×2')
  })

  it('存在「已完成但维度缺失」记录时提示并可从「去处理」跳转记录页', async () => {
    const { pinia, store } = freshStore()
    seedAll(store)
    // 人为构造一条 done 但 citation 未打分的记录（补齐全流程会拦截，故直接写入存储态）
    store.reviews[keyOf('FQ-001', 'wencai')] = {
      ...store.blankReview('FQ-001', 'wencai'),
      scores: { accuracy: 5, citation: null, timeliness: 5, safety: 5, quality: 5 },
      status: 'done',
    }

    const { wrapper, router } = await mountView(Report, pinia, '/report')
    const banner = wrapper.find('.banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('已从排行榜与汇总统计中排除')

    await banner.find('button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/records')
  })

  it('未提问时为空状态', async () => {
    const { pinia, store } = freshStore()
    store.loadDemoReviews({ ask: false })
    const { wrapper } = await mountView(Report, pinia, '/report')
    expect(wrapper.text()).toContain('还没有提问')
    expect(wrapper.find('.stats').exists()).toBe(false)
  })
})

describe('失败标签分布视图', () => {
  it('标签条形图、标签 × 模型矩阵与判定说明表', async () => {
    const { pinia, store } = freshStore()
    seedAll(store)
    const { wrapper } = await mountView(LabelDistribution, pinia, '/labels')

    expect(wrapper.text()).toContain('统计基于全部有评审内容的记录（20 条，已完成 18 条）')

    // 矩阵：每行为一个标签，列是 4 个内置模型 + 合计
    const matrix = wrapper.find('table.tbl')
    expect(matrix.findAll('thead th').length).toBe(6)
    const rows = matrix.findAll('tbody tr')
    expect(rows.length).toBe(8)
    expect(rows[0].text()).toContain('数字错误')

    // 标签条形图计数
    const bars = wrapper.findComponent(LabelBars)
    expect(bars.props('counts').invalid_citation).toBe(6)
    expect(bars.props('counts').unfounded_advice).toBe(3)

    // 判定说明表：8 个标签，含键与严重度
    const tables = wrapper.findAll('table.tbl')
    const meaning = tables[tables.length - 1]
    expect(meaning.findAll('tbody tr').length).toBe(8)
    expect(meaning.text()).toContain('num_error')
    expect(meaning.text()).toContain('高危')
  })

  it('无评审内容时为空状态', async () => {
    const { pinia } = freshStore()
    const { wrapper } = await mountView(LabelDistribution, pinia, '/labels')
    expect(wrapper.text()).toContain('暂无评审记录')
  })
})

describe('Markdown 导出（排行榜 / 汇总报告）', () => {
  it('leaderboardMarkdown 与 reportMarkdown 内容与原型格式一致', () => {
    const { store } = freshStore()
    seedAll(store)
    const agg = aggregate('all', { reviews: store.allReviews, models: store.allModels() })

    const lb = leaderboardMarkdown({ scopeLabel: '全部问题', sampleN: agg.n, agg, models: store.allModels() })
    expect(lb).toContain('# 金融 Agent 评测排行榜（全部问题）')
    expect(lb).toContain('样本：18 条已完成记录')
    expect(lb).toContain('| 1 | 同花顺问财 | 97.6 |')
    expect(lb).toContain('数字正确性(30%)')

    const rp = reportMarkdown({
      generatedAt: '2026-10-02 10:00',
      askedCount: 5,
      totalAns: 20,
      doneCount: 18,
      agg,
      models: store.allModels(),
      allLabels: countLabels(store.allReviews),
    })
    expect(rp).toContain('# 金融 Agent 评测汇总报告')
    expect(rp).toContain('- 完成率：90%')
    expect(rp).toContain('| 引用无效 | 6 |')
    expect(rp).toContain('## 排行榜')
  })
})