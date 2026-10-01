<template>
  <div class="card">
    <div class="card-pad">
      <div class="row" style="gap: 8px">
        <span class="qnum">{{ c.free ? '自由提问' : c.case_id }}</span>
        <span class="qtext" style="font-weight: 600">{{ c.title || '自由提问' }}</span>
      </div>
      <div class="qtext" style="margin-top: 6px">{{ c.question }}</div>
      <div v-if="!c.free" class="row" style="margin-top: 8px">
        <span class="lbl" style="margin: 0">信息截止 {{ c.cutoff_at || '—' }}</span>
        <Chip v-for="r in c.risk_labels" :key="r" variant="risk">{{ r }}</Chip>
      </div>
      <!-- 参考答案折叠区：左侧参考值键值块，右侧允许证据（含发布日期） -->
      <details v-if="hasRef" class="ref">
        <summary>参考答案与允许证据</summary>
        <div class="ref-grid">
          <div class="ref-box">
            <h4>参考答案</h4>
            <div
              v-if="c.reference_answer"
              style="font-size: var(--fs-12); color: var(--text-2); line-height: 1.7; white-space: pre-wrap; margin: 0 0 8px"
            >
              {{ c.reference_answer }}
            </div>
            <div class="kv">
              <span v-for="v in c.reference_values" :key="v.name" class="v">
                <b>{{ v.value }}{{ v.unit }}</b><span>{{ v.name }}</span>
              </span>
            </div>
          </div>
          <div class="ref-box">
            <h4>允许证据</h4>
            <ul class="ev-list">
              <li v-for="e in c.allowed_evidence" :key="e.title">
                <span class="d">{{ e.published_at || '无日期' }}</span>
                <span>{{ e.title }}<span v-if="e.org" style="color: var(--muted)"> · {{ e.org }}</span></span>
              </li>
            </ul>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Chip from '@/components/common/Chip.vue'

const props = defineProps({
  c: { type: Object, required: true },
})

/* 自由提问没有参考答案，不渲染折叠区 */
const hasRef = computed(() => {
  const c = props.c
  if (c.free) return false
  return !!(c.reference_answer || (c.reference_values || []).length || (c.allowed_evidence || []).length)
})
</script>