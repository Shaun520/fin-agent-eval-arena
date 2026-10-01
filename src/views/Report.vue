<template>
  <!-- 未提问：引导空态（复刻原型 askedEmptyState） -->
  <div v-if="!store.askedCases.length" class="card card-pad">
    <EmptyState>
      还没有提问。<br />
      <span>去「对话评审」选一个参考问题或直接输入你的问题，评审记录会出现在这里。</span>
      <div style="margin-top: 12px">
        <button class="btn sm" @click="goChat">去对话评审</button>
      </div>
    </EmptyState>
  </div>

  <template v-else>
    <!-- 概览统计卡 -->
    <div class="stats">
      <StatCard k="问题数" :v="store.askedCases.length" />
      <StatCard k="回答数" :v="totalAns" unit="条" />
      <StatCard k="已完成评审" :v="status.done" :unit="' / ' + totalAns" />
      <StatCard k="完成率" :v="totalAns ? ((status.done / totalAns) * 100).toFixed(0) : 0" unit="%" />
    </div>

    <!-- 存在「已完成但维度缺失」的记录：被统计排除，提示去处理 -->
    <div v-if="unfinished.length" class="banner">
      有 {{ unfinished.length }} 条记录状态为「已完成」但存在维度未打分，已从排行榜与汇总统计中排除，请补齐或改回「评审中」。
      <span class="spacer"></span>
      <button class="btn sm" @click="goRecords">去处理</button>
    </div>

    <!-- 各模型汇总表 -->
    <div class="sec-title">
      各模型汇总<span class="line"></span>
      <button class="btn sm" @click="exportReport">导出汇总报告（Markdown）</button>
    </div>
    <div class="card">
      <table class="tbl">
        <thead>
          <tr>
            <th>模型</th>
            <th>题均总分</th>
            <th>覆盖题数</th>
            <th v-for="d in DIMENSIONS" :key="d.key">{{ d.name }}</th>
            <th>失败标签合计</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in store.allModels()" :key="m.id">
            <td>
              <span class="dot" :style="{ background: m.color }"></span> {{ m.name }}
              <Chip v-if="m.baseline" variant="brand" style="margin-left: 4px">基准</Chip>
              <Chip v-else-if="m.custom" variant="demo" style="margin-left: 4px">自定义</Chip>
            </td>
            <td class="num" style="font-weight: 650">{{ avgOf(agg.byModel[m.id]) }}</td>
            <td class="num">{{ agg.byModel[m.id].n }} / {{ store.askedCases.length }}</td>
            <td v-for="d in DIMENSIONS" :key="d.key" class="num">{{ dimOf(agg.byModel[m.id], d.key) }}</td>
            <td class="num">{{ labelSum(agg.byModel[m.id]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 失败标签总体分布 -->
    <div class="sec-title">失败标签总体分布<span class="line"></span></div>
    <div class="grid2">
      <div class="card card-pad"><LabelBars :counts="allLabels" title="全部模型" /></div>
      <div class="card card-pad"><LabelBars :counts="baselineLabels" title="同花顺问财（基准）" /></div>
    </div>

    <!-- 问题 × 模型 对比矩阵 -->
    <div class="sec-title">问题对比与覆盖矩阵<span class="line"></span></div>
    <div class="card">
      <div class="card-pad">
        <div style="overflow: auto">
          <table class="tbl">
            <thead>
              <tr>
                <th>问题</th>
                <th v-for="m in store.allModels()" :key="m.id">{{ m.short || m.name }}</th>
                <th>均分</th>
                <th>主要失败标签</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in matrix" :key="row.c.case_id">
                <td>
                  <span class="qnum">{{ store.caseLabel(row.c.case_id) }}</span>
                  {{ (row.c.title || '').slice(0, 14) }}
                </td>
                <td v-for="cell in row.cells" :key="cell.model.id">
                  <template v-if="cell.none">
                    <span class="mono-sm">无回答</span>
                  </template>
                  <template v-else>
                    <span class="num" style="font-weight: 600" :style="{ color: scoreColor(cell.t) }">{{
                      cell.t === null ? '—' : fmt1(cell.t)
                    }}</span>
                    <Chip v-if="cell.status === 'done'" variant="ok" style="margin-left: 4px">已完成</Chip>
                    <Chip v-else-if="cell.status === 'doing'" variant="demo" style="margin-left: 4px">评审中</Chip>
                    <Chip v-else style="margin-left: 4px">未评审</Chip>
                  </template>
                </td>
                <td class="num">{{ row.avg === null ? '—' : fmt1(row.avg) }}</td>
                <td>
                  <template v-if="row.topLabels.length">
                    <Chip v-for="t in row.topLabels" :key="t.key" variant="danger" style="margin-right: 4px"
                      >{{ t.name }} ×{{ t.n }}</Chip
                    >
                  </template>
                  <span v-else class="mono-sm">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useArenaStore } from '@/stores/arena'
import { DIMENSIONS } from '@/data/dimensions'
import { LABEL_MAP } from '@/data/failureLabels'
import { aggregate, countLabels, reviewTotal } from '@/lib/scoring'
import { fmt1, fmt2, dateStamp } from '@/lib/format'
import { reportMarkdown, downloadFile } from '@/lib/export'
import StatCard from '@/components/common/StatCard.vue'
import Chip from '@/components/common/Chip.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LabelBars from '@/components/charts/LabelBars.vue'

const store = useArenaStore()
const router = useRouter()

/* 回答总数 = 已提问问题 × 该题现有回答 */
const totalAns = computed(() => store.askedCases.reduce((s, c) => s + store.answersOf(c.case_id).length, 0))

/* 状态计数：只统计「已提问问题 × 该题回答」（复刻原型 countStatus） */
const status = computed(() => {
  const c = { none: 0, doing: 0, done: 0 }
  store.askedCases.forEach((cs) => {
    store.answersOf(cs.case_id).forEach((a) => {
      const s = store.getReview(cs.case_id, a.model_id).status
      c[s] = (c[s] || 0) + 1
    })
  })
  return c
})

/* 汇总口径：全部问题的「已完成且五维齐全」记录 */
const agg = computed(() => aggregate('all', { reviews: store.allReviews, models: store.allModels() }))

/* 全部有评审内容的记录（含评审中），用于标签总体分布 */
const reviewed = computed(() => store.allReviews.filter((r) => store.hasAnyReviewContent(r)))
const allLabels = computed(() => countLabels(reviewed.value))
const baselineLabels = computed(() => agg.value.byModel.wencai.labels)

/* 「已完成但维度缺失」的记录：被统计排除 */
const unfinished = computed(() => store.allReviews.filter((r) => r.status === 'done' && reviewTotal(r) === null))

/* 问题 × 模型矩阵：每格总分（状态 done 且五维齐全才计入均分）+ 状态，行尾均分与 Top3 标签 */
const matrix = computed(() =>
  store.askedCases.map((c) => {
    const answers = store.answersOf(c.case_id)
    let sum = 0
    let n = 0
    const labelCount = {}
    const cells = store.allModels().map((m) => {
      const a = answers.find((x) => x.model_id === m.id)
      if (!a) return { model: m, none: true }
      const r = store.getReview(c.case_id, m.id)
      const t = reviewTotal(r)
      if (r.status === 'done' && t !== null) {
        sum += t
        n++
      }
      r.failures.forEach((k) => {
        labelCount[k] = (labelCount[k] || 0) + 1
      })
      return { model: m, t, status: r.status }
    })
    const topLabels = Object.entries(labelCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => ({ key: k, name: LABEL_MAP[k] ? LABEL_MAP[k].name : k, n: v }))
    return { c, cells, avg: n ? sum / n : null, topLabels }
  }),
)

function avgOf(s) {
  return s && s.avg !== null ? fmt1(s.avg) : '—'
}
function dimOf(s, key) {
  return s && s.dims[key] !== null && s.dims[key] !== undefined ? fmt2(s.dims[key]) : '—'
}
function labelSum(s) {
  return s ? Object.values(s.labels || {}).reduce((a, b) => a + b, 0) : 0
}
/* 总分色阶：≥85 绿 / ≥70 橙 / 其余红；无分灰色 */
function scoreColor(t) {
  if (t === null) return 'var(--muted-2)'
  if (t >= 85) return 'var(--ok)'
  if (t >= 70) return 'var(--warn)'
  return 'var(--danger)'
}

function exportReport() {
  const md = reportMarkdown({
    generatedAt: new Date().toLocaleString('zh-CN'),
    askedCount: store.askedCases.length,
    totalAns: totalAns.value,
    doneCount: status.value.done,
    agg: agg.value,
    models: store.allModels(),
    allLabels: allLabels.value,
  })
  downloadFile(md, 'fin-agent-eval-report-' + dateStamp() + '.md', 'text/markdown')
  store.toast('已导出汇总报告（Markdown）')
}

function goChat() {
  router.push('/chat')
}
function goRecords() {
  router.push('/records')
}
</script>