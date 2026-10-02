import { defineStore } from 'pinia'
import { MODELS, CUSTOM_MODEL_PALETTE } from '@/data/models'
import { DIMENSIONS, MAX_DIM_SCORE } from '@/data/dimensions'
import BUILTIN_CASES from '@/data/cases.json'
import BUILTIN_ANSWERS from '@/data/answers.json'
import DEMO_REVIEWS from '@/data/demoReviews.json'
import { LS, lsGet, lsSet, lsRemove, AUTOSAVE_DEBOUNCE_MS } from '@/lib/storage'
import { STREAM_SPEEDS, DEFAULT_STREAM } from '@/lib/stream'
import { clone, normText, parseCitations, dateStamp, dayStamp } from '@/lib/format'
import {
  buildCaseExport,
  buildExport,
  buildReportData,
  reportMarkdown,
  downloadJSON,
  downloadFile,
  copyText,
} from '@/lib/export'
import { keyOf, reviewTotal, isSolved, TO_LABEL } from '@/lib/scoring'

/* 评分自动保存的防抖句柄（模块级单例：同一时刻只保留一次待落盘的写入） */
let reviewSaveTimer = null

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

    /* 评审编辑弹窗的草稿（不落盘）：null 表示未打开 */
    reviewModal: null,

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
      focusCaseId: null, // 从「评审记录」进题查看：目标题目（仅交互态，不落盘）
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

    /* 已提问过的问题（跨会话汇总）：评审记录/分析视图只围绕这些展开（复刻原型 askedCases） */
    askedCases: (state) => {
      const ids = []
      state.chat.sessions.forEach((s) =>
        (s.rounds || []).forEach((r) => {
          if (r && r.caseId && ids.indexOf(r.caseId) < 0) ids.push(r.caseId)
        }),
      )
      return state.cases.filter((c) => ids.indexOf(c.case_id) >= 0)
    },

    /* 评审记录表格行：已提问问题 × 该题现有回答，经四维筛选后按题号/模型排序（复刻原型 reviewRows） */
    reviewRows() {
      const f = this.filters
      const out = []
      this.askedCases.forEach((c) => {
        this.answersOf(c.case_id).forEach((a) => {
          out.push({ c, a, r: this.getReview(c.case_id, a.model_id) })
        })
      })
      return out
        .filter((x) => {
          if (f.caseId !== 'all' && x.c.case_id !== f.caseId) return false
          if (f.modelId !== 'all' && x.a.model_id !== f.modelId) return false
          if (f.status !== 'all' && x.r.status !== f.status) return false
          if (f.label !== 'all' && x.r.failures.indexOf(f.label) < 0) return false
          return true
        })
        .sort((p, q) =>
          p.c.case_id < q.c.case_id ? -1 : p.c.case_id > q.c.case_id ? 1 : p.a.model_id < q.a.model_id ? -1 : 1,
        )
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

    /* 评分变更走防抖落盘（复刻 AUTOSAVE_DEBOUNCE_MS）；提交/保存等关键动作立即落盘 */
    schedulePersistReviews() {
      if (reviewSaveTimer) clearTimeout(reviewSaveTimer)
      reviewSaveTimer = setTimeout(() => {
        reviewSaveTimer = null
        this.persistReviews()
      }, AUTOSAVE_DEBOUNCE_MS)
    },

    /* 变更后的统一收尾：更新时间戳、去掉演示标记、清理空记录、落盘（默认防抖，可要求立即） */
    touchReview(caseId, modelId, immediate = false) {
      const r = this.reviews[keyOf(caseId, modelId)]
      if (!r) return
      r.updated_at = new Date().toISOString()
      r.demo = false
      this.pruneEmpty(caseId, modelId)
      if (immediate) this.persistReviews()
      else this.schedulePersistReviews()
    },

    /* 已提交且未进入「编辑评分」= 锁定 */
    isLocked(caseId, modelId) {
      return this.getReview(caseId, modelId).status === 'done' && !this.isEditingCard(caseId, modelId)
    },

    /* 评分锁定：已提交的记录默认锁定，进入「编辑评分」后解锁 */
    isEditingCard(caseId, modelId) {
      return this.chat.editing === 'ans_' + (caseId + '::' + modelId).replace(/[^a-zA-Z0-9]/g, '_')
    },

    /* 卡头 ✎：进入/退出「编辑评分」（只解锁评分区，回答正文不可改） */
    toggleEditScore(answerId) {
      const key = 'ans_' + String(answerId).replace(/[^a-zA-Z0-9]/g, '_')
      this.chat.editing = this.chat.editing === key ? null : key
    },

    /* 界面文案用「主题 / 问题摘要」，内部编号只出现在导出 JSON 里 */
    caseLabel(caseId) {
      const c = this.caseById(caseId)
      if (!c) return '一条提问'
      if (c.title) return c.title
      const q = String(c.question || '')
      return q.length > 14 ? q.slice(0, 14) + '…' : q || '自由提问'
    },

    setScore(caseId, modelId, dim, v) {
      if (this.isLocked(caseId, modelId)) {
        this.toast('该评审已提交，如需修改请点卡片右上角 ✎ 解锁', true)
        return
      }
      const r = this.ensureReview(caseId, modelId)
      r.scores[dim] = r.scores[dim] === v ? null : v
      if (r.status === 'none' && this.hasAnyReviewContent(r)) r.status = 'doing'
      this.touchReview(caseId, modelId)
    },

    toggleTag(caseId, modelId, tag) {
      if (this.isLocked(caseId, modelId)) {
        this.toast('该评审已提交，如需修改请点卡片右上角 ✎ 解锁', true)
        return
      }
      const r = this.ensureReview(caseId, modelId)
      const i = r.failures.indexOf(tag)
      if (i >= 0) r.failures.splice(i, 1)
      else r.failures.push(tag)
      if (r.status === 'none') r.status = 'doing'
      this.touchReview(caseId, modelId)
    },

    setComment(caseId, modelId, text) {
      if (this.isLocked(caseId, modelId)) return false
      const r = this.ensureReview(caseId, modelId)
      r.comment = text
      if (r.status === 'none' && this.hasAnyReviewContent(r)) r.status = 'doing'
      this.touchReview(caseId, modelId)
      return true
    },

    /* 缺失的维度名（提交校验用） */
    missingDims(r) {
      return DIMENSIONS.filter((d) => r.scores[d.key] === null || r.scores[d.key] === undefined).map((d) => d.name)
    },

    /* 三态切换：置「已完成」时必须五维齐全，否则拦截并提示缺失维度 */
    setStatus(caseId, modelId, s) {
      const r = this.ensureReview(caseId, modelId)
      if (s === 'done') {
        const missing = this.missingDims(r)
        if (missing.length) {
          this.toast('无法标记已完成，以下维度未打分：' + missing.join('、'), true)
          return false
        }
        r.status = 'done'
        r.reviewed_at = r.reviewed_at || new Date().toISOString()
        this.chat.editing = null
      } else {
        r.status = s
      }
      this.touchReview(caseId, modelId, true)
      return true
    },

    /* 提交/重新提交评审：缺维度直接拦截，不允许置 done */
    submitReview(caseId, modelId) {
      const r = this.ensureReview(caseId, modelId)
      const missing = this.missingDims(r)
      if (missing.length) {
        this.toast('还有未打分的维度，无法提交：' + missing.join('、'), true)
        return false
      }
      r.status = 'done'
      r.reviewed_at = new Date().toISOString()
      r.updated_at = r.reviewed_at
      r.demo = false
      this.chat.editing = null
      this.persistReviews()
      this.toast('已提交评审：' + this.caseLabel(caseId) + ' / ' + this.modelOf(modelId).name)
      return true
    },

    saveReview(caseId, modelId) {
      if (this.isLocked(caseId, modelId)) return
      const r = this.ensureReview(caseId, modelId)
      r.status = r.status === 'none' ? 'doing' : r.status
      r.reviewed_at = new Date().toISOString()
      r.updated_at = r.reviewed_at
      r.demo = false
      this.persistReviews()
      const t = reviewTotal(r)
      this.toast(
        '已保存：' + this.caseLabel(caseId) + ' / ' + this.modelOf(modelId).name + ' · ' + (t === null ? '未评完' : '总分 ' + t.toFixed(1)),
      )
    },

    resetReview(caseId, modelId) {
      if (this.isLocked(caseId, modelId)) {
        this.toast('该评审已提交，如需修改请点卡片右上角 ✎ 解锁', true)
        return
      }
      delete this.reviews[keyOf(caseId, modelId)]
      this.persistReviews()
      this.toast('已清空该回答的评分')
    },

    /* 导出本轮：单个问题（题目 + 回答 + 该题评审）导出为 JSON */
    exportRound(caseId) {
      const c = this.caseById(caseId)
      if (!c) return
      const payload = buildCaseExport(caseId, {
        cases: this.cases,
        answersOf: (id) => this.answersOf(id),
        reviews: this.allReviews,
        models: this.allModels(),
        stream: this.stream,
      })
      const n = this.cases.findIndex((x) => x.case_id === caseId) + 1
      downloadJSON(payload, 'fin-agent-eval-case' + n + '-' + dateStamp() + '.json')
      this.toast('已导出「' + this.caseLabel(caseId) + '」（含评审）')
    },

    /* ------------------------------ 数据导入导出（P6，复刻原型 buildExport / importData） ------------------------------ */
    /* 按范围导出 JSON：all=全量 / reviews=仅评审记录 / answers=仅回答 */
    exportData(scope) {
      const payload = buildExport(scope, {
        cases: this.cases,
        answersOf: (id) => this.answersOf(id),
        reviews: this.allReviews,
        models: MODELS,
        stream: this.stream,
      })
      const names = { all: '竞技场-全量-', reviews: '竞技场-评审记录-', answers: '竞技场-回答-' }
      downloadJSON(payload, (names[scope] || '竞技场-导出-') + dayStamp() + '.json')
      this.toast(scope === 'reviews' ? '已导出评审记录' : scope === 'answers' ? '已导出回答' : '已导出全部数据')
    },

    /* 复制全量 JSON 到剪贴板 */
    copyAllJSON() {
      const payload = buildExport('all', {
        cases: this.cases,
        answersOf: (id) => this.answersOf(id),
        reviews: this.allReviews,
        models: MODELS,
        stream: this.stream,
      })
      return copyText(JSON.stringify(payload, null, 2)).then((ok) => {
        this.toast(ok ? '已复制到剪贴板' : '复制失败，请手动选择文本', !ok)
        return ok
      })
    },

    /*
     * 导入数据（复刻原型 importData 合并规则）。
     * @param {object} obj   导出 JSON
     * @param {object} opts  { replace: 是否替换内置题目与回答, reviews: 是否同时导入评审记录 }
     * @returns {string[]}   成功导入项描述，空数组表示未识别到可导入内容
     */
    importData(obj, opts = {}) {
      const replace = !!opts.replace
      const withReviews = opts.reviews === undefined ? true : !!opts.reviews
      if (!obj || typeof obj !== 'object') {
        this.toast('导入失败：不是有效的 JSON 对象', true)
        return []
      }
      const ok = []

      /* 题目：按 case_id 合并（replace 时整体替换） */
      if (Array.isArray(obj.cases) && obj.cases.length) {
        if (replace) {
          this.cases = obj.cases.map(clone)
        } else {
          const map = Object.fromEntries(this.cases.map((c) => [c.case_id, c]))
          obj.cases.forEach((c) => {
            map[c.case_id] = clone(c)
          })
          this.cases = Object.values(map)
        }
        this.persistCases()
        ok.push(obj.cases.length + ' 题')
      }

      /* 回答：标记 custom，按 id 去重覆盖（replace 时整体替换自定义层） */
      if (Array.isArray(obj.answers) && obj.answers.length) {
        const incoming = obj.answers.map((a) => Object.assign(clone(a), { custom: true }))
        if (replace) {
          this.answersStore.custom = incoming
          this.answersStore.deleted = []
        } else {
          const ids = new Set(incoming.map((a) => a.id))
          this.answersStore.custom = this.answersStore.custom.filter((a) => !ids.has(a.id)).concat(incoming)
          this.answersStore.deleted = this.answersStore.deleted.filter((id) => !ids.has(id))
        }
        this.persistAnswers()
        ok.push(obj.answers.length + ' 条回答')
      }

      /* 评审记录：按 (case_id, model_id) 覆盖；分数 clamp 0–5；非法状态回落 none */
      if (withReviews && Array.isArray(obj.reviews) && obj.reviews.length) {
        let n = 0
        obj.reviews.forEach((r) => {
          if (!r || !r.case_id || !r.model_id) return
          const base = this.blankReview(r.case_id, r.model_id)
          DIMENSIONS.forEach((d) => {
            const v = r.scores ? r.scores[d.key] : null
            if (v === null || v === undefined || v === '') {
              base.scores[d.key] = null
              return
            }
            const num = Number(v)
            base.scores[d.key] = Number.isFinite(num) ? Math.max(0, Math.min(MAX_DIM_SCORE, num)) : null
          })
          base.failures = Array.isArray(r.failures) ? r.failures.slice() : []
          base.comment = r.comment || ''
          base.status = TO_LABEL[r.status] ? r.status : 'none'
          base.reviewed_at = r.reviewed_at || null
          base.updated_at = r.updated_at || null
          base.demo = false
          this.reviews[keyOf(r.case_id, r.model_id)] = base
          n++
        })
        this.persistReviews()
        ok.push(n + ' 条评审记录')
      }

      /* 配置：仅接受已知的流式速度 */
      if (obj.config && obj.config.stream && STREAM_SPEEDS[obj.config.stream] !== undefined) {
        this.stream = obj.config.stream
        this.persistConfig()
      }

      if (ok.length) this.toast('导入成功：' + ok.join('、'))
      else this.toast('未从该 JSON 中识别到可导入的数据', true)
      return ok
    },

    /* 恢复内置演示数据：参考问题、回答层、评审记录与对话会话全部重置 */
    resetAll() {
      this.cases = clone(BUILTIN_CASES)
      this.answersStore = { builtin: this.answersStore.builtin, custom: [], deleted: [] }
      this.reviews = {}
      const s = newSession()
      this.chat.sessions = [s]
      this.chat.currentId = s.id
      this.chat.customModels = []
      this.chat.active = MODELS.map((m) => m.id)
      this.chat.selected = null
      this.chat.reviewMode = true
      this.chat.editing = null
      this.chat.animated = {}
      this.chat.focusCaseId = null
      this.syncSession()
      this.persistCases()
      this.persistAnswers()
      this.persistReviews()
      this.persistChat()
      lsRemove(LS.seeded)
      this.toast('已恢复内置演示数据')
    },

    /* 清空全部评审记录（参考问题与回答保留） */
    clearAllReviews() {
      this.reviews = {}
      this.persistReviews()
      lsRemove(LS.seeded)
      this.toast('已清空全部评审记录')
    },

    /* 还原被删除的内置回答 */
    restoreAnswers() {
      this.answersStore.deleted = []
      this.persistAnswers()
      this.toast('已还原被删除的内置回答')
    },

    /* 生成并下载汇总报告（与「汇总报告」页共用同一套装配，保证内容一致） */
    exportReport() {
      const models = this.allModels()
      const data = buildReportData({
        cases: this.cases,
        answers: this.cases.flatMap((c) => this.answersOf(c.case_id)),
        reviews: this.allReviews,
        models,
        askedCaseIds: this.askedCases.map((c) => c.case_id),
      })
      const md = reportMarkdown({ generatedAt: new Date().toLocaleString('zh-CN'), models, ...data })
      downloadFile(md, '竞技场-汇总报告-' + dayStamp() + '.md', 'text/markdown')
      this.toast('已导出汇总报告（Markdown）')
    },

    /* ------------------------------ 评审编辑弹窗（草稿态，保存才写回） ------------------------------ */
    openReviewModal(caseId, modelId) {
      const r = this.getReview(caseId, modelId)
      const drafts = {}
      DIMENSIONS.forEach((d) => (drafts[d.key] = r.scores[d.key] === undefined ? null : r.scores[d.key]))
      this.reviewModal = {
        caseId,
        modelId,
        drafts,
        failures: (r.failures || []).slice(),
        comment: r.comment || '',
        status: r.status,
      }
    },

    closeReviewModal() {
      this.reviewModal = null
    },

    modalSetScore(dim, v) {
      const m = this.reviewModal
      if (!m) return
      m.drafts[dim] = m.drafts[dim] === v ? null : v
      if (m.status === 'none') m.status = 'doing'
    },

    modalToggleTag(tag) {
      const m = this.reviewModal
      if (!m) return
      const i = m.failures.indexOf(tag)
      if (i >= 0) m.failures.splice(i, 1)
      else m.failures.push(tag)
      if (m.status === 'none') m.status = 'doing'
    },

    modalSetStatus(s) {
      if (this.reviewModal) this.reviewModal.status = s
    },

    modalSetComment(text) {
      if (this.reviewModal) this.reviewModal.comment = text
    },

    saveReviewModal() {
      const m = this.reviewModal
      if (!m) return
      const r = this.ensureReview(m.caseId, m.modelId)
      DIMENSIONS.forEach((d) => {
        r.scores[d.key] = m.drafts[d.key] === undefined ? null : m.drafts[d.key]
      })
      r.failures = m.failures.slice()
      r.comment = m.comment
      r.status = m.status
      r.demo = false
      r.updated_at = new Date().toISOString()
      if (m.status === 'done') r.reviewed_at = r.reviewed_at || r.updated_at
      this.persistReviews()
      const t = reviewTotal(r)
      const label = this.caseLabel(m.caseId) + ' / ' + this.modelOf(m.modelId).name
      this.closeReviewModal()
      this.toast('已保存：' + label + ' · ' + (t === null ? '未评完' : '总分 ' + t.toFixed(1)))
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

    /* 载入 20 条演示评审：只填空位，遇到用户自建记录（非 demo）跳过，避免覆盖真实评审 */
    loadDemoReviews() {
      let n = 0
      DEMO_REVIEWS.forEach((d) => {
        const k = keyOf(d.case_id, d.model_id)
        const existing = this.reviews[k]
        if (existing && !existing.demo) return
        const r = this.blankReview(d.case_id, d.model_id)
        DIMENSIONS.forEach((dim) => (r.scores[dim.key] = d.scores[dim.key] === undefined ? null : d.scores[dim.key]))
        r.failures = (d.failures || []).slice()
        r.comment = d.comment || ''
        r.status = d.status
        r.reviewed_at = d.reviewed_at || null
        r.updated_at = d.updated_at || null
        r.demo = true
        this.reviews[k] = r
        n++
      })
      this.persistReviews()
      lsSet(LS.seeded, new Date().toISOString())
      this.toast(n ? '已载入 ' + n + ' 条演示评审记录' : '演示记录已全部存在，未重复载入')
      return n
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
      this.toast(n ? '已清空 ' + n + ' 条演示记录' : '没有演示记录')
      return n
    },

    /* ------------------------------ 评审记录视图 ------------------------------ */
    resetFilters() {
      this.filters = { caseId: 'all', modelId: 'all', status: 'all', label: 'all' }
    },

    /* 进题查看：定位该题所在的会话与轮次并展开（记录页「题号/查看」入口） */
    focusCaseRound(caseId) {
      let session = null
      let idx = -1
      for (const s of this.chat.sessions) {
        const i = (s.rounds || []).findIndex((r) => r && r.kind !== 'chat' && r.caseId === caseId)
        if (i >= 0) {
          session = s
          idx = i
          break
        }
      }
      if (!session) {
        /* 该题尚未提问：回到对话评审并预选，等用户提问后再产生记录 */
        this.chat.selected = caseId
        return
      }
      this.chat.currentId = session.id
      this.syncSession()
      this.chat.expandedRounds = [idx]
      this.chat.focusCaseId = caseId
      this.persistChat()
    },

    clearFocusCase() {
      this.chat.focusCaseId = null
    },
  },
})