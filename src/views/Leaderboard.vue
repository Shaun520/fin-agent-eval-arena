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
    <!-- 统计范围与样本说明 -->
    <div class="card card-pad" style="margin-bottom: 14px">
      <div class="row">
        <span class="mono-sm">统计范围</span>
        <select v-model="store.leaderboardCase" class="ctl">
          <option value="all">全部问题</option>
          <option v-for="c in store.askedCases" :key="c.case_id" :value="c.case_id">
            {{ store.caseLabel(c.case_id) }} · {{ c.title || '' }}
          </option>
        </select>
        <span class="spacer"></span>
        <span class="mono-sm">样本：{{ agg.n }} 条「已完成且五维齐全」记录（题均分口径）</span>
        <button class="btn sm" @click="copyLeaderboard">复制排行榜（Markdown）</button>
      </div>
    </div>

    <!-- 已提问但没有可统计记录 -->
    <div v-if="!agg.n" class="card card-pad">
      <EmptyState>
        还没有「已完成且五维齐全」的评审记录。<br />
        <span>请到「对话评审」打分并提交评审。</span>
        <div style="margin-top: 12px">
          <button class="btn sm" @click="goChat">去对话评审</button>
        </div>
      </EmptyState>
    </div>

    <template v-else>
      <!-- 排行榜：按题均加权总分降序 -->
      <div class="card" style="margin-bottom: 14px">
        <div class="card-head">
          <h3>模型排行榜</h3>
          <span class="hint">按题均加权总分排序</span>
          <span class="spacer"></span>
          <span class="mono-sm">总分 = Σ(维度分 / 5 × 权重) × 100</span>
        </div>
        <div class="card-pad">
          <div
            v-for="(x, i) in ranked"
            :key="x.m.id"
            style="display: grid; grid-template-columns: 26px 130px 1fr 62px 150px; gap: 10px; align-items: center; padding: 7px 0"
          >
            <span class="num" style="color: var(--muted-2); font-weight: 650">{{ i + 1 }}</span>
            <div>
              <span class="dot" :style="{ background: x.m.color }"></span>
              <span style="font-weight: 600; font-size: 13px">{{ x.m.name }}</span>
              <Chip v-if="x.m.baseline" variant="brand" style="margin-left: 4px">基准</Chip>
            </div>
            <div style="height: 12px; background: var(--bg-sunken); border-radius: 6px; overflow: hidden">
              <i
                style="display: block; height: 100%; border-radius: 6px"
                :style="{ width: ((x.s.avg === null ? 0 : x.s.avg) / 100) * 100 + '%', background: x.m.color }"
              ></i>
            </div>
            <span class="num" style="font-weight: 650; font-size: 15px">{{ x.s.avg === null ? '—' : fmt1(x.s.avg) }}</span>
            <span class="mono-sm">覆盖 {{ x.s.n }} / {{ store.askedCases.length }} 问题</span>
          </div>
        </div>
      </div>

      <!-- 分维度均分对比（原生 SVG） -->
      <div class="sec-title">分维度均分对比<span class="line"></span></div>
      <div class="card card-pad">
        <DimGroupedChart :by-model="agg.byModel" />
      </div>

      <!-- 分维度明细表 -->
      <div class="sec-title">分维度明细表<span class="line"></span></div>
      <div class="card">
        <table class="tbl">
          <thead>
            <tr>
              <th>排名</th>
              <th>模型</th>
              <th>题均总分</th>
              <th v-for="d in DIMENSIONS" :key="d.key">
                {{ d.name }}<br /><span class="mono-sm">{{ Math.round(d.weight * 100) }}%</span>
              </th>
              <th>覆盖题数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(x, i) in ranked" :key="x.m.id">
              <td class="num">{{ i + 1 }}</td>
              <td>
                <span class="dot" :style="{ background: x.m.color }"></span> {{ x.m.name }}
              </td>
              <td class="num" style="font-weight: 650">{{ x.s.avg === null ? '—' : fmt1(x.s.avg) }}</td>
              <td v-for="d in DIMENSIONS" :key="d.key" class="num">
                {{ x.s.dims[d.key] === null ? '—' : fmt2(x.s.dims[d.key]) }}
              </td>
              <td class="num">{{ x.s.n }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useArenaStore } from '@/stores/arena'
import { DIMENSIONS } from '@/data/dimensions'
import { aggregate } from '@/lib/scoring'
import { fmt1, fmt2 } from '@/lib/format'
import { leaderboardMarkdown, copyText } from '@/lib/export'
import Chip from '@/components/common/Chip.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import DimGroupedChart from '@/components/charts/DimGroupedChart.vue'

const store = useArenaStore()
const router = useRouter()

/* 聚合只纳入「已完成且五维齐全」的记录；范围由 store.leaderboardCase 决定 */
const agg = computed(() =>
  aggregate(store.leaderboardCase, { reviews: store.allReviews, models: store.allModels() }),
)

/* 名次按题均总分降序，无数据的模型排到最后 */
const ranked = computed(() =>
  store
    .allModels()
    .map((m) => ({ m, s: agg.value.byModel[m.id] }))
    .sort((a, b) => (b.s.avg === null ? -1 : b.s.avg) - (a.s.avg === null ? -1 : a.s.avg)),
)

async function copyLeaderboard() {
  const scopeLabel = store.leaderboardCase === 'all' ? '全部问题' : store.caseLabel(store.leaderboardCase)
  const md = leaderboardMarkdown({
    scopeLabel,
    sampleN: agg.value.n,
    agg: agg.value,
    models: store.allModels(),
  })
  const ok = await copyText(md)
  store.toast(ok ? '已复制到剪贴板' : '复制失败，请手动选择文本', !ok)
}

function goChat() {
  router.push('/chat')
}
</script>