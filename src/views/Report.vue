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
      <StatCard k="问题数" :v="data.askedCount" />
      <StatCard k="回答数" :v="data.totalAns" unit="条" />
      <StatCard k="已完成评审" :v="data.doneCount" :unit="' / ' + data.totalAns" />
      <StatCard k="完成率" :v="data.rate" unit="%" />
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
            <td class="num" style="font-weight: 650">{{ avgOf(data.agg.byModel[m.id]) }}</td>
            <td class="num">{{ data.agg.byModel[m.id].n }} / {{ data.askedCount }}</td>
            <td v-for="d in DIMENSIONS" :key="d.key" class="num">{{ dimOf(data.agg.byModel[m.id], d.key) }}</td>
            <td class="num">{{ labelSum(data.agg.byModel[m.id]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 失败标签总体分布 -->
    <div class="sec-title">失败标签总体分布<span class="line"></span></div>
    <div class="grid2">
      <div class="card card-pad"><LabelBars :counts="data.allLabels" title="全部模型" /></div>
      <div class="card card-pad"><LabelBars :counts="data.agg.byModel.wencai.labels" title="同花顺问财（基准）" /></div>
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
              <tr v-for="row in data.matrix" :key="row.c.case_id">
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
import { reviewTotal } from '@/lib/scoring'
import { buildReportData } from '@/lib/export'
import { fmt1, fmt2 } from '@/lib/format'
import StatCard from '@/components/common/StatCard.vue'
import Chip from '@/components/common/Chip.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LabelBars from '@/components/charts/LabelBars.vue'

const store = useArenaStore()
const router = useRouter()

/* 报告数据统一由 buildReportData 装配：页面与导出的 Markdown 报告共用同一口径 */
const data = computed(() =>
  buildReportData({
    cases: store.cases,
    answers: store.cases.flatMap((c) => store.answersOf(c.case_id)),
    reviews: store.allReviews,
    models: store.allModels(),
    askedCaseIds: store.askedCases.map((c) => c.case_id),
  }),
)

/* 「已完成但维度缺失」的记录：被统计排除 */
const unfinished = computed(() => store.allReviews.filter((r) => r.status === 'done' && reviewTotal(r) === null))

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
  store.exportReport()
}

function goChat() {
  router.push('/chat')
}
function goRecords() {
  router.push('/records')
}
</script>