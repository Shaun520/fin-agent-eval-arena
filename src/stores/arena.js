import { defineStore } from 'pinia'

/*
 * 全局状态（P0 空壳）：
 * 后续阶段在这里落地 cases / answersStore / reviews / chat / filters 等域状态
 * 以及 loadState / persist* / setScore / submitReview 等动作。
 * 命名口径：case_id + model_id 作为评审记录主键，5 维 key 见 data/dimensions.js。
 */
export const useArenaStore = defineStore('arena', {
  state: () => ({
    /* 侧边栏分段（评审 / 分析）：进入「数据导入导出」时保持不变，与原型一致 */
    seg: 'review',
    cases: [],
    answersStore: { custom: [], deleted: [] },
    reviews: {},
    filters: { caseId: 'all', modelId: 'all', status: 'all', label: 'all' },
    stream: 'medium',
  }),
  getters: {},
  actions: {},
})