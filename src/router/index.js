import { createRouter, createWebHistory } from 'vue-router'

/* 侧边栏两段导航 + 数据导入导出（底部固定） */
export const NAV_SEGMENTS = {
  review: [
    { key: 'chat', name: '对话评审', icon: 'arena' },
    { key: 'records', name: '评审记录', icon: 'records' },
  ],
  analysis: [
    { key: 'leaderboard', name: '模型排行榜', icon: 'leaderboard' },
    { key: 'report', name: '汇总报告', icon: 'report' },
    { key: 'labels', name: '失败标签分布', icon: 'labels' },
  ],
}

export const SEG_LABEL = { review: '评审', analysis: '分析' }

/* 顶栏标题 + 副标题（文案取自原型 VIEW_META） */
export const VIEW_META = {
  chat: { title: '对话评审', sub: '选题提问 · 多模型并行作答 · 逐条打分' },
  records: { title: '评审记录', sub: '筛选 · 查看 · 修改已保存评分' },
  leaderboard: { title: '模型排行榜', sub: '题均总分 · 分维度得分' },
  report: { title: '汇总报告', sub: '覆盖率 · 标签分布 · 单题对比' },
  labels: { title: '失败标签分布', sub: '总体与分模型统计' },
  data: { title: '数据导入导出', sub: 'JSON 全量可追溯' },
}

const routes = [
  { path: '/', redirect: '/chat' },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/views/ChatReview.vue'),
    meta: { seg: 'review', ...VIEW_META.chat },
  },
  {
    path: '/records',
    name: 'records',
    component: () => import('@/views/Records.vue'),
    meta: { seg: 'review', ...VIEW_META.records },
  },
  {
    path: '/leaderboard',
    name: 'leaderboard',
    component: () => import('@/views/Leaderboard.vue'),
    meta: { seg: 'analysis', ...VIEW_META.leaderboard },
  },
  {
    path: '/report',
    name: 'report',
    component: () => import('@/views/Report.vue'),
    meta: { seg: 'analysis', ...VIEW_META.report },
  },
  {
    path: '/labels',
    name: 'labels',
    component: () => import('@/views/LabelDistribution.vue'),
    meta: { seg: 'analysis', ...VIEW_META.labels },
  },
  {
    path: '/data',
    name: 'data',
    component: () => import('@/views/DataIO.vue'),
    meta: { seg: null, ...VIEW_META.data },
  },
  { path: '/:pathMatch(.*)*', redirect: '/chat' },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})