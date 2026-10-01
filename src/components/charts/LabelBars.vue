<template>
  <div>
    <div class="mono-sm" style="margin-bottom: 8px">{{ title }}</div>
    <div
      v-for="e in entries"
      :key="e.key"
      style="display: grid; grid-template-columns: 104px 1fr 28px; gap: 8px; align-items: center; padding: 3px 0"
    >
      <span style="font-size: 12px; color: var(--text-2)">{{ e.name }}</span>
      <div style="height: 9px; background: var(--bg-sunken); border-radius: 5px; overflow: hidden">
        <i
          style="display: block; height: 100%; border-radius: 5px"
          :style="{ width: (e.v / max) * 100 + '%', background: e.sev === 'high' ? 'var(--danger)' : 'var(--warn)' }"
        ></i>
      </div>
      <span class="num" style="font-size: 12px">{{ e.v }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { FAILURE_LABELS } from '@/data/failureLabels'

/* 失败标签条形图：props 传标签计数结果，高危红 / 一般橙，按次数降序 */
const props = defineProps({
  counts: { type: Object, default: () => ({}) },
  title: { type: String, default: '' },
})

const entries = computed(() =>
  FAILURE_LABELS.map((l) => ({ key: l.key, name: l.name, sev: l.sev, v: props.counts[l.key] || 0 })).sort(
    (a, b) => b.v - a.v,
  ),
)

const max = computed(() => Math.max(1, ...entries.value.map((e) => e.v)))
</script>