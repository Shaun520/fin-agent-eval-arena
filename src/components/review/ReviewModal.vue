<template>
  <!-- 评审编辑弹窗（复刻原型 .modal）：草稿态，点「保存」才写回 -->
  <Modal label="编辑评审" @close="store.closeReviewModal()">
    <template #head>
      <h3>编辑评审</h3>
      <span class="mono-sm">{{ headLabel }}</span>
    </template>

    <!-- 关闭时 reviewModal 置 null，此处必须自守，避免卸载前的一次渲染读空 -->
    <template v-if="m">
      <div v-if="c" class="modal-q">{{ c.question }}</div>

      <div class="rv-sec-label">维度打分 <span class="mono-sm">0–5 分 · 人工判定</span></div>
      <ScoreDim
        v-for="d in DIMENSIONS"
        :key="d.key"
        :dim="d"
        :value="m.drafts[d.key]"
        @pick="(v) => store.modalSetScore(d.key, v)"
      />
      <div class="dim" style="margin-top: 2px">
        <div class="dn" style="font-weight: 600; color: var(--text)">加权总分</div>
        <div class="mono-sm">Σ (维度分 / 5 × 权重) × 100</div>
        <span class="total-mini" :class="{ none: total === null }">{{ total === null ? '未评完' : fmt1(total) }}</span>
      </div>

      <div class="rv-sec-label">失败标签（可多选）</div>
      <div class="tags modal-tags">
        <button
          v-for="l in FAILURE_LABELS"
          :key="l.key"
          class="tag"
          :class="{ on: m.failures.indexOf(l.key) >= 0 }"
          :title="l.desc"
          @click="store.modalToggleTag(l.key)"
        >
          {{ l.name }}
        </button>
      </div>

      <div class="rv-sec-label">评语</div>
      <div class="modal-comment-wrap">
        <textarea
          ref="ta"
          class="ctl"
          :value="m.comment"
          placeholder="记录失败原因、证据缺口、可复现的核对结论…"
          @input="onComment"
        ></textarea>
      </div>

      <div class="rv-sec-label">评审状态</div>
      <div class="status-seg">
        <button
          v-for="s in ['none', 'doing', 'done']"
          :key="s"
          :data-s="s"
          :class="{ on: m.status === s }"
          @click="store.modalSetStatus(s)"
        >
          {{ TO_LABEL[s] }}
        </button>
      </div>
    </template>

    <template #foot>
      <span class="mono-sm">{{ cur.reviewed_at ? '上次评审 ' + shortTime(cur.reviewed_at) : '尚未评审' }}</span>
      <span class="spacer"></span>
      <button class="btn sm" @click="store.closeReviewModal()">取消</button>
      <button class="btn primary sm" @click="store.saveReviewModal()">保存</button>
    </template>
  </Modal>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useArenaStore } from '@/stores/arena'
import { DIMENSIONS } from '@/data/dimensions'
import { FAILURE_LABELS } from '@/data/failureLabels'
import { weightedTotal, TO_LABEL } from '@/lib/scoring'
import { fmt1, shortTime } from '@/lib/format'
import Modal from '@/components/common/Modal.vue'
import ScoreDim from '@/components/review/ScoreDim.vue'

const store = useArenaStore()
const m = computed(() => store.reviewModal)
const c = computed(() => (m.value ? store.caseById(m.value.caseId) : null))
const cur = computed(() => (m.value ? store.getReview(m.value.caseId, m.value.modelId) : { reviewed_at: null }))
const headLabel = computed(() => (m.value ? store.caseLabel(m.value.caseId) + ' · ' + store.modelOf(m.value.modelId).name : ''))
const total = computed(() => {
  if (!m.value) return null
  return DIMENSIONS.every((d) => m.value.drafts[d.key] !== null && m.value.drafts[d.key] !== undefined)
    ? weightedTotal(m.value.drafts)
    : null
})

/* 评语框随内容长高，由外层 .modal-comment-wrap 提供独立滚动条 */
const ta = ref(null)
function autoGrow() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(64, el.scrollHeight) + 'px'
}
function onComment(e) {
  store.modalSetComment(e.target.value)
  autoGrow()
}
onMounted(() => nextTick(autoGrow))
</script>