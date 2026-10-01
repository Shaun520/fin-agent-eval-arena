import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useArenaStore } from '@/stores/arena'
import Composer from '@/components/chat/Composer.vue'

/* 每个用例都用干净的 Pinia + localStorage，避免 chat/answers 的持久化互相污染 */
function freshStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArenaStore()
  store.loadState()
  return { pinia, store }
}

describe('对话评审 · 模型勾选只影响后续提问（不做实时增减）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('取消/恢复勾选：只改 active，已提问回合的卡片不变', () => {
    const { store } = freshStore()
    store.askQuestion('FQ-001')
    const before = [...store.chat.rounds[0].modelIds]
    expect(before).toEqual(['wencai', 'doubao', 'qwen', 'yuanbao'])

    store.toggleModel('qwen')
    expect(store.chat.active).not.toContain('qwen')
    expect(store.chat.rounds[0].modelIds).toEqual(before)

    store.toggleModel('qwen')
    expect(store.chat.active).toContain('qwen')
    expect(store.chat.rounds[0].modelIds).toEqual(before)
  })

  it('新增自定义模型：进入 active，但不给已提问回合补卡', () => {
    const { store } = freshStore()
    store.askQuestion('FQ-001')
    const before = [...store.chat.rounds[0].modelIds]

    store.addCustomModel('DeepSeek-V3', '深度求索')
    const customId = store.chat.customModels[0].id

    expect(store.chat.active).toContain(customId)
    expect(store.chat.rounds[0].modelIds).toEqual(before)
    expect(store.chat.rounds[0].modelIds).not.toContain(customId)
  })

  it('再次提问同一题：复用该回合并把 modelIds 刷新为当前 active', () => {
    const { store } = freshStore()
    store.askQuestion('FQ-001')
    store.toggleModel('qwen')
    store.askQuestion('FQ-001')

    expect(store.chat.rounds.length).toBe(1)
    expect(store.chat.rounds[0].modelIds).toEqual(['wencai', 'doubao', 'yuanbao'])
  })

  it('删除回答：同步把该模型移出本轮，避免立刻变成「待录入」卡', () => {
    const { store } = freshStore()
    store.askQuestion('FQ-001')

    store.deleteAnswer('FQ-001', 'doubao', 'FQ-001::doubao', false)

    expect(store.chat.rounds[0].modelIds).not.toContain('doubao')
    expect(store.answersStore.deleted).toContain('FQ-001::doubao')
  })

  it('至少保留一个模型参与回答', () => {
    const { store } = freshStore()
    store.chat.active = ['wencai']
    store.toggleModel('wencai')
    expect(store.chat.active).toEqual(['wencai'])
  })
})

describe('对话评审 · 模型下拉弹窗', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('点击「新增模型」打开内联表单且不收起下拉', async () => {
    const { pinia, store } = freshStore()
    const wrapper = mount(Composer, { global: { plugins: [pinia] }, attachTo: document.body })

    await wrapper.find('.model-dd-btn').trigger('click')
    expect(wrapper.find('.model-pop2').exists()).toBe(true)

    await wrapper.find('.mopt.add').trigger('click')
    expect(store.chat.addingModel).toBe(true)
    expect(store.chat.modelPopOpen).toBe(true)
    expect(wrapper.find('.mopt-form').exists()).toBe(true)
    expect(wrapper.findAll('.mopt-form input').length).toBe(2)

    wrapper.unmount()
  })

  it('下拉内部的点击被 .model-dd 拦截，不会冒泡到 document（避免误判为「点了外部」）', async () => {
    const { pinia } = freshStore()
    const wrapper = mount(Composer, { global: { plugins: [pinia] }, attachTo: document.body })

    await wrapper.find('.model-dd-btn').trigger('click')

    const hits = []
    const spy = (e) => hits.push(e.target)
    document.addEventListener('click', spy)
    await wrapper.find('.mopt.add').trigger('click')
    document.removeEventListener('click', spy)

    expect(hits.length).toBe(0)

    wrapper.unmount()
  })

  it('点击下拉以外的区域仍会收起（外部点击逻辑未被破坏）', async () => {
    const { pinia, store } = freshStore()
    const wrapper = mount(Composer, { global: { plugins: [pinia] }, attachTo: document.body })

    await wrapper.find('.model-dd-btn').trigger('click')
    expect(store.chat.modelPopOpen).toBe(true)

    await wrapper.find('textarea').trigger('click')

    expect(store.chat.modelPopOpen).toBe(false)

    wrapper.unmount()
  })
})