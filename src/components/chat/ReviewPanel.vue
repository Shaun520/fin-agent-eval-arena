<template>
  <!-- 答案卡片内联评审区（复刻原型 .rv）：5 维打分 / 失败标签 / 状态 / 评语 / 操作行 -->
  <div class="rv">
    <div class="rv-sec-label">维度打分 <span class="mono-sm">0–5 分 · 人工判定</span></div>
    <ScoreDim
      v-for="d in DIMENSIONS"
      :key="d.key"
      :dim="d"
      :value="review.scores[d.key]"
      :disabled="locked"
      @pick="(v) => store.setScore(c.case_id, a.model_id, d.key, v)"
    />
    <!-- 加权总分：五维未打满时显示「未评完」灰色 -->
    <div class="dim" style="margin-top: 2px">
      <div class="dn" style="font-weight: 600; color: var(--text)">加权总分</div>
      <div class="mono-sm">Σ (维度分 / 5 × 权重) × 100</div>
      <span class="total-mini" :class="{ none: total === null }">{{ total === null ? '未评完' : fmt1(total) }}</span>
    </div>

    <div class="rv-sec-label">失败标签（可多选）</div>
    <div class="tags">
      <button
        v-for="l in FAILURE_LABELS"
        :key="l.key"
        class="tag"
        :class="{ on: review.failures.indexOf(l.key) >= 0 }"
        :disabled="locked"
        :title="l.desc"
        @click="store.toggleTag(c.case_id, a.model_id, l.key)"
      >
        {{ l.name }}
      </button>
    </div>

    <div class="rv-sec-label">评语</div>
    <textarea
      class="ctl"
      rows="3"
      :readonly="locked"
      :value="review.comment"
      placeholder="记录失败原因、证据缺口、可复现的核对结论…"
      @input="onComment"
    ></textarea>

    <div class="row rv-actions">
      <button class="btn sm" :disabled="locked" @click="store.saveReview(c.case_id, a.model_id)">保存评审</button>
      <button class="btn primary sm" :disabled="locked" @click="store.submitReview(c.case_id, a.model_id)">{{ submitLabel }}</button>
      <button class="btn sm" :disabled="locked" @click="store.resetReview(c.case_id, a.model_id)">清空评分</button>
      <span class="spacer"></span>
      <span class="draft-note" :class="{ saved: noteSaved }">{{ noteText }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useArenaStore } from '@/stores/arena'
import { DIMENSIONS } from '@/data/dimensions'
import { FAILURE_LABELS } from '@/data/failureLabels'
import { reviewTotal } from '@/lib/scoring'
import { fmt1, shortTime } from '@/lib/format'
import { AUTOSAVE_DEBOUNCE_MS } from '@/lib/storage'
import ScoreDim from '@/components/review/ScoreDim.vue'

const props = defineProps({
  c: { type: Object, required: true },
  a: { type: Object, required: true },
})

const store = useArenaStore()

const review = computed(() => store.getReview(props.c.case_id, props.a.model_id))
const total = computed(() => reviewTotal(review.value))
/* 已提交且未点 ✎ 解锁 = 锁定；未提交的记录默认可直接编辑 */
const locked = computed(() => store.isLocked(props.c.case_id, props.a.model_id))
const editing = computed(() => store.isEditingCard(props.c.case_id, props.a.model_id))

const submitLabel = computed(() => {
  if (review.value.status !== 'done') return '提交评审'
  return editing.value ? '重新提交' : '已提交'
})

/* 评语自动保存提示：输入中 → 已自动保存（绿色） */
const saving = ref(false)
let saveTimer = null
const noteSaved = computed(() => !saving.value && !review.value.demo && !!review.value.updated_at)
const noteText = computed(() => {
  if (review.value.demo) return '演示记录'
  if (saving.value) return '输入中…自动保存'
  return review.value.updated_at ? '已自动保存 ' + shortTime(review.value.updated_at) : '未保存'
})

function onComment(e) {
  const ok = store.setComment(props.c.case_id, props.a.model_id, e.target.value)
  if (!ok) {
    e.target.value = review.value.comment
    return
  }
  saving.value = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saving.value = false
  }, AUTOSAVE_DEBOUNCE_MS)
}

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
})
</script>