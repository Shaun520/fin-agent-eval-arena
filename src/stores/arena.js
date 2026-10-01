import { defineStore } from 'pinia'
import { MODELS, CUSTOM_MODEL_PALETTE } from '@/data/models'
import { DIMENSIONS } from '@/data/dimensions'
import BUILTIN_CASES from '@/data/cases.json'
import BUILTIN_ANSWERS from '@/data/answers.json'
import { LS, lsGet, lsSet, lsRemove } from '@/lib/storage'
import { STREAM_SPEEDS, DEFAULT_STREAM } from '@/lib/stream'
import { clone, normText, parseCitations } from '@/lib/format'
import { keyOf, reviewTotal, isSolved } from '@/lib/scoring'

/* 新建会话（仅会话内使用，不入持久层结构之外的字段） */
function newSession() {
  return {
    id: 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    title: '新会话',
    rounds: [],
    createdAt: new Date().toISOString(),
  }
}

export const useArenaStore = defineStore('arena', {
  state: () => ({
    /* 侧边栏分段（评审 / 分析）：进入「数据导入导出」时保持不变 */
    seg: 'review',

    /* 题目：种子数据来自 data/cases.json，可被导入替换 */
    cases: [],

    /* 回答：builtin 为内置只读层；custom 为本地录入/导入层；deleted 记录被删除的内置回答 id */
    answersStore: { builtin: [], custom: [], deleted: [] },

    /* 评审记录：key = `caseId||modelId` */
    reviews: {},

    stream: DEFAULT_STREAM,
    filters: { caseId: 'all', modelId: 'all', status: 'all', label: 'all' },
    leaderboardCase: 'all',

    chat: {
      sessions: [],
      rounds: [], // 始终指向当前会话的 rounds
      active: MODELS.map((m) => m.id),
      customModels: [],
      reviewMode: true,
      editing: null, // 「编辑评分」中的回答 key
      expandedRounds: [],
      animated: {},
      /* 以下为交互态 */
      currentId: null,
      selected: null,
      showPicker: false,
      addingModel: false,
      modelPopOpen: false,
    },

    toasts: [],
  }),

  getters: {
    allReviews: (state) => Object.values(state.reviews),

    /* 已完成且五维齐全：榜单与汇总的唯一统计口径 */
    solvedReviews: (state) => Object.values(state.reviews).filter(isSolved),

    /* 评审完成进度：各会话中「已提问的问题 × 该轮选中的模型」去重统计，未提问时为 0 / 0 */
    progressStats: (state) => {
      const perCase = {}
      state.chat.sessions.forEach((s) =>
        (s.rounds || []).forEach((r) => {
          if (!r || r.kind === 'chat' || !r.caseId) return
          const bag = (perCase[r.caseId] = perCase[r.caseId] || {})
          ;(r.modelIds || []).forEach((id) => {
            bag[id] = true
          })
        }),
      )
      let total = 0
      let done = 0
      Object.keys(perCase).forEach((cid) => {
        Object.keys(perCase[cid]).forEach((mid) => {
          total++
          const rv = state.reviews[keyOf(cid, mid)]
          if (rv && rv.status === 'done') done++
        })
      })
      return { total, done }
    },

    /* 当前参与作答的模型（内置 + 自定义，按 chat.active 过滤） */
    activeModels: (state) => {
      const on = state.chat.active
      return MODELS.concat(state.chat.customModels).filter((m) => on.indexOf(m.id) >= 0)
    },

    /* 侧边栏徽标：目前只有「评审记录」需要显示已评审条数 */
    navCount: (state) => (key) => {
      if (key !== 'records') return ''
      const n = Object.values(state.reviews).filter(
        (r) =>
          (r.failures || []).length > 0 ||
          String(r.comment || '').trim() !== '' ||
          DIMENSIONS.some((d) => r.scores[d.key] !== null && r.scores[d.key] !== undefined),
      ).length
      return n ? String(n) : ''
    },
  },

  actions: {
    /* ------------------------------ 加载 / 持久化 ------------------------------ */
    loadState() {
      /* 题目：首次载入种子数据并打 seeded 标记，避免重复灌入 */
      const savedCases = lsGet(LS.cases, null)
      this.cases = Array.isArray(savedCases) && savedCases.length ? savedCases : clone(BUILTIN_CASES)
      if (!lsGet(LS.seeded, null)) {
        this.persistCases()
        lsSet(LS.seeded, new Date().toISOString())
      }

      /* 回答：内置层始终来自内置 JSON（不落盘），本地层从存储恢复 */
      this.answersStore.builtin = clone(BUILTIN_ANSWERS)
      const savedAnswers = lsGet(LS.answers, { custom: [], deleted: [] })
      this.answersStore.custom = Array.isArray(savedAnswers.custom) ? savedAnswers.custom : []
      this.answersStore.deleted = Array.isArray(savedAnswers.deleted) ? savedAnswers.deleted : []

      /* 评审记录：内置参考问题一律从未评审开始，不预置演示评分 */
      const savedReviews = lsGet(LS.reviews, null)
      this.reviews = savedReviews && typeof savedReviews === 'object' ? savedReviews : {}

      /* 配置 */
      const cfg = lsGet(LS.config, {})
      this.stream = cfg.stream && STREAM_SPEEDS[cfg.stream] !== undefined ? cfg.stream : DEFAULT_STREAM

      /* 会话 */
      const chat = lsGet(LS.chat, null)
      if (chat) {
        if (Array.isArray(chat.customModels)) this.chat.customModels = chat.customModels
        if (Array.isArray(chat.active) && chat.active.length) this.chat.active = chat.active
        this.chat.selected = chat.selected || null
        this.chat.reviewMode = chat.reviewMode === undefined ? true : !!chat.reviewMode
        if (chat.animated && typeof chat.animated === 'object') this.chat.animated = chat.animated
        if (Array.isArray(chat.sessions) && chat.sessions.length) {
          this.chat.sessions = chat.sessions.filter((s) => s && Array.isArray(s.rounds))
        } else {
          /* 兼容旧版只有一个 rounds 数组的存储结构 */
          const s = newSession()
          if (Array.isArray(chat.rounds) && chat.rounds.length) s.rounds = chat.rounds
          this.chat.sessions = [s]
        }
        if (!this.chat.sessions.length) this.chat.sessions = [newSession()]
        this.chat.currentId = chat.currentId && this.chat.sessions.some((s) => s.id === chat.currentId)
          ? chat.currentId
          : this.chat.sessions[0].id
      } else {
        this.chat.sessions = [newSession()]
        this.chat.currentId = this.chat.sessions[0].id
      }
      this.chat.showPicker = false

      /* 至少保留一个模型参与，且轮次里的题目必须真实存在（日常对话轮除外） */
      const ids = this.allModels().map((m) => m.id)
      this.chat.active = this.chat.active.filter((id) => ids.indexOf(id) >= 0)
      if (!this.chat.active.length) this.chat.active = MODELS.map((m) => m.id)
      if (this.chat.selected && !this.cases.some((c) => c.case_id === this.chat.selected)) this.chat.selected = null
      this.chat.sessions.forEach((s) => {
        s.rounds = s.rounds.filter((r) => r && (r.kind === 'chat' || this.cases.some((c) => c.case_id === r.caseId)))
        s.rounds.forEach((r) => {
          if (r.kind !== 'chat' && !Array.isArray(r.modelIds)) r.modelIds = MODELS.map((m) => m.id)
        })
      })
      this.syncSession()
    },

    persistReviews() {
      lsSet(LS.reviews, this.reviews)
    },
    persistAnswers() {
      lsSet(LS.answers, { custom: this.answersStore.custom, deleted: this.answersStore.deleted })
    },
    persistCases() {
      lsSet(LS.cases, this.cases)
    },
    persistConfig() {
      lsSet(LS.config, { stream: this.stream })
    },
    /* 只落盘持久字段，编辑态 / 动画态 / 弹层态不写入 */
    persistChat() {
      lsSet(LS.chat, {
        sessions: this.chat.sessions,
        currentId: this.chat.currentId,
        active: this.chat.active,
        customModels: this.chat.customModels,
        reviewMode: this.chat.reviewMode,
        selected: this.chat.selected,
        animated: this.chat.animated,
      })
    },

    /* ------------------------------ 模型 / 回答 ------------------------------ */
    allModels() {
      return MODELS.concat(this.chat.customModels)
    },

    /* 自定义层（含导入覆盖）优先于内置层；同 id 时以自定义为准 */
    answersOf(caseId) {
      const deleted = new Set(this.answersStore.deleted)
      const custom = this.answersStore.custom.filter((a) => a.case_id === caseId && !deleted.has(a.id))
      const overridden = new Set(this.answersStore.custom.map((a) => a.id))
      const base = this.answersStore.builtin.filter(
        (a) => a.case_id === caseId && !deleted.has(a.id) && !overridden.has(a.id),
      )
      return base.concat(custom)
    },

    /* 粘贴/修改回答：写入自定义层（同 id 覆盖内置层，可在数据页整体还原） */
    putAnswer(caseId, modelId, text, citations) {
      const id = caseId + '::' + modelId
      const answer = {
        id,
        case_id: caseId,
        model_id: modelId,
        answer: text,
        citations: citations || [],
        generated_at: new Date().toISOString(),
        custom: true,
      }
      const i = this.answersStore.custom.findIndex((a) => a.id === id)
      if (i >= 0) this.answersStore.custom[i] = answer
      else this.answersStore.custom.push(answer)
      const d = this.answersStore.deleted.indexOf(id)
      if (d >= 0) this.answersStore.deleted.splice(d, 1)
      this.persistAnswers()
      /* 新内容重新播放一次流式动画 */
      delete this.chat.animated['ans_' + id.replace(/[^a-zA-Z0-9]/g, '_')]
    },

    /* 删除回答：内置回答记入 deleted，自定义回答直接移除；评审记录一并清理 */
    deleteAnswer(caseId, modelId, answerId, isCustom) {
      if (isCustom) this.answersStore.custom = this.answersStore.custom.filter((a) => a.id !== answerId)
      else if (this.answersStore.deleted.indexOf(answerId) < 0) this.answersStore.deleted.push(answerId)
      delete this.reviews[keyOf(caseId, modelId)]
      /* 同时把该模型移出本轮，避免删掉后立刻又变成「等待回答」卡片 */
      this.chat.rounds.forEach((rd) => {
        if (rd.caseId === caseId) rd.modelIds = rd.modelIds.filter((id) => id !== modelId)
      })
      this.persistChat()
      this.persistAnswers()
      this.persistReviews()
      this.toast('已删除 ' + this.modelOf(modelId).name + ' 的回答')
    },

    /* ------------------------------ 评审记录 ------------------------------ */
    blankReview(caseId, modelId) {
      const scores = {}
      DIMENSIONS.forEach((d) => (scores[d.key] = null))
      return {
        case_id: caseId,
        model_id: modelId,
        scores,
        failures: [],
        comment: '',
        status: 'none',
        reviewed_at: null,
        updated_at: null,
        demo: false,
      }
    },

    /* 读取：不写入。渲染路径一律使用，避免把空记录写进存储 */
    getReview(caseId, modelId) {
      return this.reviews[keyOf(caseId, modelId)] || this.blankReview(caseId, modelId)
    },

    /* 写入：仅在用户产生变更时创建记录 */
    ensureReview(caseId, modelId) {
      const k = keyOf(caseId, modelId)
      if (!this.reviews[k]) this.reviews[k] = this.blankReview(caseId, modelId)
      return this.reviews[k]
    },

    hasAnyReviewContent(r) {
      return (
        (r.failures || []).length > 0 ||
        String(r.comment || '').trim() !== '' ||
        DIMENSIONS.some((d) => r.scores[d.key] !== null && r.scores[d.key] !== undefined)
      )
    },

    pruneEmpty(caseId, modelId) {
      const k = keyOf(caseId, modelId)
      const r = this.reviews[k]
      if (r && !this.hasAnyReviewContent(r) && r.status === 'none' && !r.demo) delete this.reviews[k]
    },

    /* 变更后的统一收尾：更新时间戳、去掉演示标记、清理空记录、落盘 */
    touchReview(caseId, modelId) {
      const r = this.reviews[keyOf(caseId, modelId)]
      if (!r) return
      r.updated_at = new Date().toISOString()
      r.demo = false
      this.pruneEmpty(caseId, modelId)
      this.persistReviews()
    },

    /* 评分锁定：已提交的记录默认锁定，进入「编辑评分」后解锁 */
    isEditingCard(caseId, modelId) {
      return this.chat.editing === 'ans_' + (caseId + '::' + modelId).replace(/[^a-zA-Z0-9]/g, '_')
    },

    setScore(caseId, modelId, dim, v) {
      const cur = this.getReview(caseId, modelId)
      if (cur.status === 'done' && !this.isEditingCard(caseId, modelId)) {
        this.toast('该评审已提交，如需修改请到「评审记录」中编辑', true)
        return
      }
      const r = this.ensureReview(caseId, modelId)
      r.scores[dim] = r.scores[dim] === v ? null : v
      if (r.status === 'none' && this.hasAnyReviewContent(r)) r.status = 'doing'
      this.touchReview(caseId, modelId)
    },

    toggleTag(caseId, modelId, tag) {
      const cur = this.getReview(caseId, modelId)
      if (cur.status === 'done' && !this.isEditingCard(caseId, modelId)) {
        this.toast('该评审已提交，如需修改请到「评审记录」中编辑', true)
        return
      }
      const r = this.ensureReview(caseId, modelId)
      const i = r.failures.indexOf(tag)
      if (i >= 0) r.failures.splice(i, 1)
      else r.failures.push(tag)
      if (r.status === 'none') r.status = 'doing'
      this.touchReview(caseId, modelId)
    },

    setStatus(caseId, modelId, s) {
      const r = this.ensureReview(caseId, modelId)
      r.status = s
      if (s === 'done') {
        r.reviewed_at = r.reviewed_at || new Date().toISOString()
        const missing = DIMENSIONS.filter((d) => r.scores[d.key] === null).map((d) => d.name)
        if (missing.length) this.toast('已标记完成，但以下维度未打分：' + missing.join('、'), true)
      }
      this.touchReview(caseId, modelId)
    },

    saveReview(caseId, modelId) {
      const r = this.ensureReview(caseId, modelId)
      r.status = r.status === 'none' ? 'doing' : r.status
      r.reviewed_at = new Date().toISOString()
      r.updated_at = r.reviewed_at
      r.demo = false
      this.persistReviews()
      const t = reviewTotal(r)
      this.toast('已保存：' + caseId + ' / ' + modelId + ' · ' + (t === null ? '未评完' : '总分 ' + t.toFixed(1)))
    },

    resetReview(caseId, modelId) {
      delete this.reviews[keyOf(caseId, modelId)]
      this.persistReviews()
      this.toast('已清空该回答的评分')
    },

    /* ------------------------------ 会话 ------------------------------ */
    /* 让 chat.rounds 始终引用当前会话的数组 */
    syncSession() {
      const s = this.chat.sessions.find((x) => x.id === this.chat.currentId) || this.chat.sessions[0] || null
      this.chat.rounds = s ? s.rounds : []
      const last = this.chat.rounds.length - 1
      this.chat.expandedRounds = last >= 0 ? [last] : []
    },

    /* ------------------------------ 对话评审：查询 ------------------------------ */
    modelOf(id) {
      return (
        this.allModels().find((m) => m.id === id) || { id, name: id, short: id, vendor: '', color: '#8a8f98' }
      )
    },

    caseById(caseId) {
      return this.cases.find((c) => c.case_id === caseId) || null
    },

    /* 参考问题 = 内置的、带参考答案的问题；自由提问不进这个列表 */
    referenceCases() {
      return this.cases.filter((c) => !c.free)
    },

    /* 某题的完成进度：已提交评审的回答数 / 该题现有回答数 */
    reviewProgress(caseId) {
      const as = this.answersOf(caseId)
      return {
        done: as.filter((a) => this.getReview(caseId, a.model_id).status === 'done').length,
        total: as.length,
      }
    },

    isRoundExpanded(idx) {
      return this.chat.expandedRounds.indexOf(idx) >= 0
    },

    toggleRound(idx) {
      const at = this.chat.expandedRounds.indexOf(idx)
      if (at >= 0) this.chat.expandedRounds.splice(at, 1)
      else this.chat.expandedRounds.push(idx)
    },

    collapseRound(idx) {
      const at = this.chat.expandedRounds.indexOf(idx)
      if (at >= 0) this.chat.expandedRounds.splice(at, 1)
    },

    /* ------------------------------ 对话评审：选题 / 提问 ------------------------------ */
    /* 选中一条参考问题：带入输入框、进入评审模式（题干写入由 Composer 监听 selected 完成） */
    pickQuestion(caseId) {
      this.chat.selected = caseId
      this.chat.showPicker = false
      this.chat.reviewMode = true
    },

    toggleReviewMode() {
      this.chat.reviewMode = !this.chat.reviewMode
      this.chat.modelPopOpen = false
      this.persistChat()
      this.toast(this.chat.reviewMode ? '已开启评审模式：提问将触发选中模型作答' : '已切换为日常对话')
    },

    pickDefaultModel() {
      this.chat.reviewMode = false
      this.chat.modelPopOpen = false
      this.persistChat()
      this.toast('已选择默认模型：日常对话')
    },

    /* 勾选/取消模型：只改变后续提问的作答模型集合，不改动已提问回合的卡片（与原型一致）。
       增减已提问回合的卡片只能通过「再次提问该题」或卡片上的 ✕ 删除回答。 */
    toggleModel(modelId) {
      if (!this.chat.reviewMode) return
      const i = this.chat.active.indexOf(modelId)
      if (i >= 0) {
        if (this.chat.active.length <= 1) {
          this.toast('至少保留一个模型参与回答', true)
          return
        }
        this.chat.active.splice(i, 1)
      } else {
        this.chat.active.push(modelId)
      }
      this.persistChat()
    },

    addCustomModel(name, vendor) {
      const n = this.chat.customModels.length
      const id = 'custom_' + Date.now().toString(36) + n
      this.chat.customModels.push({
        id,
        name,
        short: name.slice(0, 3),
        vendor,
        color: CUSTOM_MODEL_PALETTE[n % CUSTOM_MODEL_PALETTE.length],
        custom: true,
      })
      this.chat.active.push(id)
      this.chat.reviewMode = true
      this.chat.addingModel = false
      this.persistChat()
      this.toast('已新增模型：' + name + '（需要粘贴回答后才能评分）')
    },

    /* 提问：选中的模型并行作答；同一题重复提问则复用该回合并刷新时间 */
    askQuestion(caseId) {
      const ids = this.activeModels.map((m) => m.id)
      if (!ids.length) {
        this.toast('请至少选择一个模型', true)
        return
      }
      const c = this.caseById(caseId)
      if (!c) {
        this.toast('没有找到这条问题，请重新输入', true)
        return
      }
      let idx = this.chat.rounds.findIndex((rd) => rd.caseId === caseId)
      if (idx >= 0) {
        this.chat.rounds[idx].modelIds = ids
        this.chat.rounds[idx].askedAt = new Date().toISOString()
      } else {
        this.chat.rounds.push({ caseId, modelIds: ids, askedAt: new Date().toISOString() })
        idx = this.chat.rounds.length - 1
      }
      if (this.chat.expandedRounds.indexOf(idx) < 0) this.chat.expandedRounds.push(idx)
      this.chat.selected = null
      this.chat.showPicker = false
      this.persistChat()
      this.toast(ids.length + ' 个模型正在作答')
    },

    /* 日常对话：不触发评审，固定回复 */
    askDaily(text) {
      this.chat.rounds.push({ kind: 'chat', text, askedAt: new Date().toISOString() })
      const idx = this.chat.rounds.length - 1
      if (this.chat.expandedRounds.indexOf(idx) < 0) this.chat.expandedRounds.push(idx)
      this.chat.selected = null
      this.chat.showPicker = false
      this.chat.modelPopOpen = false
      this.persistChat()
    },

    /* 输入文本与内置参考问题匹配（去掉空白与标点后比较） */
    matchCase(text) {
      const t = normText(text)
      if (t.length < 4) return null
      for (const c of this.cases) {
        if (normText(c.question) === t) return c
      }
      for (const c of this.cases) {
        const q = normText(c.question)
        if (q.indexOf(t) >= 0 || t.indexOf(q) >= 0) return c
      }
      return null
    },

    /* 自由提问：没有内置参考答案，评分以评审人判断为准 */
    createFreeQuestion(question) {
      const text = String(question || '').trim()
      const id = 'free_' + Date.now().toString(36)
      const short = text.length > 16 ? text.slice(0, 16) + '…' : text
      this.cases.push({
        case_id: id,
        title: short,
        question: text,
        reference_answer: '',
        reference_values: [],
        allowed_evidence: [],
        cutoff_at: '',
        risk_labels: [],
        focus: '',
        free: true,
      })
      this.persistCases()
      this.toast('已加入一条自由提问（无内置参考答案，按你的判断评分）')
      return id
    },

    /* ------------------------------ 对话评审：回答录入 ------------------------------ */
    pendingSubmit(caseId, modelId, text, citesText) {
      const t = String(text || '').trim()
      if (!t) {
        this.toast('请先粘贴该模型的回答', true)
        return false
      }
      this.putAnswer(caseId, modelId, t, parseCitations(citesText))
      this.toast('已录入 ' + this.modelOf(modelId).name + ' 的回答')
      return true
    },

    pendingSkip(caseId, modelId) {
      this.chat.rounds.forEach((rd) => {
        if (rd.caseId === caseId) rd.modelIds = rd.modelIds.filter((id) => id !== modelId)
      })
      this.persistChat()
    },

    /* ------------------------------ 提示 ------------------------------ */
    toast(msg, isErr = false) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
      this.toasts.push({ id, msg, isErr })
      setTimeout(() => {
        const i = this.toasts.findIndex((t) => t.id === id)
        if (i >= 0) this.toasts.splice(i, 1)
      }, 2300)
    },

    /* 清空演示记录（不触碰真实评审） */
    clearDemoReviews() {
      let n = 0
      Object.keys(this.reviews).forEach((k) => {
        if (this.reviews[k].demo) {
          delete this.reviews[k]
          n++
        }
      })
      this.persistReviews()
      lsRemove(LS.seeded)
      return n
    },
  },
})