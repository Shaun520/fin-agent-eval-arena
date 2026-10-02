import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import { useArenaStore } from '@/stores/arena'
import { LS } from '@/lib/storage'
import AppSidebar from '@/components/layout/AppSidebar.vue'

function freshStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArenaStore()
  store.loadState()
  return { pinia, store }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/chat' },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/records', name: 'records', component: { template: '<div />' } },
      { path: '/leaderboard', name: 'leaderboard', component: { template: '<div />' } },
    ],
  })
}

async function mountSidebar(pinia) {
  const router = makeRouter()
  await router.push('/chat')
  await router.isReady()
  const wrapper = mount(AppSidebar, { global: { plugins: [pinia, router] } })
  await nextTick()
  return { wrapper, router }
}

beforeEach(() => {
  localStorage.clear()
})

describe('会话 · sessionTitle 口径', () => {
  it('无轮次为「新会话」；显式标题优先；否则取首轮内容并截 14 字', () => {
    const { store } = freshStore()
    const s = store.chat.sessions[0]
    expect(store.sessionTitle(s)).toBe('新会话')

    s.title = '自定义标题'
    expect(store.sessionTitle(s)).toBe('自定义标题')

    s.title = '新会话'
    s.rounds.push({ caseId: 'FQ-001', modelIds: ['wencai'], askedAt: '' })
    const q = store.caseById('FQ-001').question
    expect(store.sessionTitle(s)).toBe(q.slice(0, 14))

    const chat = { id: 's_x', title: '新会话', rounds: [{ kind: 'chat', text: '这是一句日常对话内容用于截断' }] }
    expect(store.sessionTitle(chat)).toBe('这是一句日常对话内容用于截断')

    expect(store.sessionTitle(null)).toBe('新会话')
  })
})

describe('会话 · 新建 / 切换 / 删除', () => {
  it('新建：置顶并切为当前，清空选择态并落盘', () => {
    const { store } = freshStore()
    store.chat.selected = 'FQ-001'
    store.chat.editing = 'ans_x'
    store.chat.showPicker = true
    const before = store.chat.sessions.length

    const s = store.createSession()

    expect(store.chat.sessions.length).toBe(before + 1)
    expect(store.chat.sessions[0].id).toBe(s.id)
    expect(store.chat.currentId).toBe(s.id)
    expect(store.chat.rounds).toBe(store.chat.sessions[0].rounds)
    expect(store.chat.selected).toBe(null)
    expect(store.chat.editing).toBe(null)
    expect(store.chat.showPicker).toBe(false)
    expect(JSON.parse(localStorage.getItem(LS.chat)).currentId).toBe(s.id)
  })

  it('切换：仅改当前指针并让 rounds 指向该会话；不存在或已当前则忽略', () => {
    const { store } = freshStore()
    store.askQuestion('FQ-001')
    const first = store.chat.sessions[0]
    const second = store.createSession(true)
    expect(store.chat.currentId).toBe(second.id)

    store.switchSession(first.id)
    expect(store.chat.currentId).toBe(first.id)
    expect(store.chat.rounds).toBe(store.chat.sessions.find((x) => x.id === first.id).rounds)

    store.switchSession(first.id) // 已当前 → 忽略
    expect(store.chat.currentId).toBe(first.id)

    store.switchSession('not-exist')
    expect(store.chat.currentId).toBe(first.id)
  })

  it('删除：确认后移除；删空自动补一个；删当前切到首个；评审记录保留', () => {
    const { store } = freshStore()
    const originalConfirm = window.confirm
    const confirm = vi.fn(() => true)
    window.confirm = confirm

    store.askQuestion('FQ-001')
    store.setScore('FQ-001', 'wencai', 'accuracy', 5)
    const first = store.chat.sessions[0]
    const second = store.createSession(true)

    // 取消确认：不删除
    confirm.mockReturnValue(false)
    store.deleteSession(first.id)
    expect(store.chat.sessions.some((s) => s.id === first.id)).toBe(true)

    // 确认删除当前会话 → 切到剩余的第一个
    confirm.mockReturnValue(true)
    store.deleteSession(second.id)
    expect(store.chat.sessions.some((s) => s.id === second.id)).toBe(false)
    expect(store.chat.currentId).toBe(store.chat.sessions[0].id)
    // 评审记录不受影响
    expect(store.getReview('FQ-001', 'wencai').scores.accuracy).toBe(5)

    // 删到空 → 自动补一个新会话
    store.chat.sessions.slice().forEach((s) => store.deleteSession(s.id))
    expect(store.chat.sessions.length).toBe(1)
    expect(store.sessionTitle(store.chat.sessions[0])).toBe('新会话')

    window.confirm = originalConfirm
  })
})

describe('最近评审 · recentRounds', () => {
  it('只取当前会话的评审轮（日常对话不入），并带 rounds 下标', () => {
    const { store } = freshStore()
    store.askQuestion('FQ-001')
    store.askDaily('你好')
    store.askQuestion('FQ-002')

    expect(store.recentRounds.map((r) => r.idx)).toEqual([0, 2])
    expect(store.recentRounds.map((r) => r.rd.caseId)).toEqual(['FQ-001', 'FQ-002'])

    // 切换会话后只反映该会话
    store.createSession(true)
    expect(store.recentRounds.length).toBe(0)
  })
})

describe('侧边栏 · 渲染与交互', () => {
  it('评审分组下渲染会话与最近评审；分析分组下两块隐藏', async () => {
    const { pinia, store } = freshStore()
    const { wrapper } = await mountSidebar(pinia)

    expect(wrapper.find('.sessions').exists()).toBe(true)
    expect(wrapper.find('.recent').exists()).toBe(true)
    expect(wrapper.find('.recent-empty').text()).toBe('还没有评审，去右侧选一个开始')

    store.seg = 'analysis'
    await nextTick()
    expect(wrapper.find('.sessions').exists()).toBe(false)
    expect(wrapper.find('.recent').exists()).toBe(false)
  })

  it('新建 / 切换会话：点「＋ 新建」置顶新会话，点会话项切回该会话', async () => {
    const { pinia, store } = freshStore()
    const { wrapper } = await mountSidebar(pinia)
    const firstId = store.chat.sessions[0].id

    await wrapper.find('.sess-add').trigger('click')
    expect(store.chat.sessions.length).toBe(2)

    const items = wrapper.findAll('.sess-item')
    expect(items[0].classes()).toContain('on')
    expect(items[0].find('.sess-n').text()).toBe('0')

    // 点最后一个会话项（原会话）切回
    await items[items.length - 1].find('.sess-open').trigger('click')
    expect(store.chat.currentId).toBe(firstId)
  })

  it('最近评审：显示题面与 done/total，点击切换该轮展开态', async () => {
    const { pinia, store } = freshStore()
    const { wrapper } = await mountSidebar(pinia)

    store.askQuestion('FQ-001')
    await nextTick()
    const item = wrapper.find('.rq-item')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('★')
    expect(item.find('.rq-n').text()).toBe('0/4')

    // 首次提问后该轮默认展开，点一下应收起
    expect(store.isRoundExpanded(0)).toBe(true)
    await item.trigger('click')
    expect(store.isRoundExpanded(0)).toBe(false)
  })
})