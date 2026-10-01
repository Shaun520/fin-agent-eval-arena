<template>
  <!-- 无任何评审内容：空态 -->
  <div v-if="!reviewed.length" class="card card-pad">
    <EmptyState>
      暂无评审记录，无法统计失败标签。<br />
      <span>请到「对话评审」打分、勾选失败标签后再回到这里。</span>
      <div style="margin-top: 12px">
        <button class="btn sm" @click="goChat">去对话评审</button>
      </div>
    </EmptyState>
  </div>

  <template v-else>
    <!-- 统计口径说明 -->
    <div class="card card-pad" style="margin-bottom: 14px">
      <div class="row">
        <span class="mono-sm"
          >统计基于全部有评审内容的记录（{{ reviewed.length }} 条，已完成 {{ status.done }} 条）</span
        >
        <span class="spacer"></span>
        <span class="mono-sm">同一记录可命中多个标签</span>
      </div>
    </div>

    <div class="grid2">
      <!-- 全部模型标签条形图 -->
      <div class="card card-pad"><LabelBars :counts="allLabels" title="全部模型" /></div>

      <!-- 标签 × 模型 命中矩阵 -->
      <div class="card">
        <div class="card-head"><h3>标签 × 模型 命中矩阵</h3></div>
        <div class="card-pad" style="padding-top: 6px">
          <div style="overflow: auto">
            <table class="tbl">
              <thead>
                <tr>
                  <th>标签</th>
                  <th v-for="m in MODELS" :key="m.id">{{ m.short }}</th>
                  <th>合计</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in FAILURE_LABELS" :key="l.key">
                  <td>
                    {{ l.name }}
                    <Chip :variant="l.sev === 'high' ? 'danger' : ''">{{ l.sev === 'high' ? '高危' : '一般' }}</Chip>
                  </td>
                  <td
                    v-for="(v, i) in rowOf(l.key)"
                    :key="MODELS[i].id"
                    class="num"
                    :style="v ? { fontWeight: 650, color: MODELS[i].color } : { color: 'var(--muted-2)' }"
                  >
                    {{ v }}
                  </td>
                  <td class="num" style="font-weight: 650">{{ rowOf(l.key).reduce((a, b) => a + b, 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- 标签含义与判定建议 -->
    <div class="sec-title">标签含义与判定建议<span class="line"></span></div>
    <div class="card">
      <table class="tbl">
        <thead>
          <tr>
            <th>标签</th>
            <th>键</th>
            <th>严重度</th>
            <th>判定说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in FAILURE_LABELS" :key="l.key">
            <td>{{ l.name }}</td>
            <td class="mono-sm">{{ l.key }}</td>
            <td>
              <Chip :variant="l.sev === 'high' ? 'danger' : ''">{{ l.sev === 'high' ? '高危' : '一般' }}</Chip>
            </td>
            <td style="color: var(--text-2); font-size: 12px">{{ l.desc }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useArenaStore } from '@/stores/arena'
import { MODELS } from '@/data/models'
import { FAILURE_LABELS } from '@/data/failureLabels'
import { countLabels } from '@/lib/scoring'
import Chip from '@/components/common/Chip.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LabelBars from '@/components/charts/LabelBars.vue'

const store = useArenaStore()
const router = useRouter()

/* 统计基于全部有评审内容的记录（含评审中），与原型 renderLabels 一致 */
const reviewed = computed(() => store.allReviews.filter((r) => store.hasAnyReviewContent(r)))
const allLabels = computed(() => countLabels(reviewed.value))

/* 已完成计数按「已提问问题 × 该题回答」口径（复刻原型 countStatus） */
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

/* 每个内置模型的标签计数（矩阵列） */
const perModel = computed(() => {
  const out = {}
  MODELS.forEach((m) => {
    out[m.id] = countLabels(reviewed.value.filter((r) => r.model_id === m.id))
  })
  return out
})

function rowOf(key) {
  return MODELS.map((m) => perModel.value[m.id][key] || 0)
}

function goChat() {
  router.push('/chat')
}
</script>