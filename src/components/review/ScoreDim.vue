<template>
  <!-- 单个评分维度：维度名(+权重) / 0–5 分按钮组 / 该维度分值；内联面板与弹窗共用 -->
  <div class="dim">
    <div class="dn" :title="dim.desc">{{ dim.name }}<em>{{ Math.round(dim.weight * 100) }}%</em></div>
    <div class="scale">
      <button
        v-for="s in SCORE_STEPS"
        :key="s"
        :class="value === s ? ['on', scoreClass(s)] : []"
        :disabled="disabled"
        :title="dim.desc"
        @click="emit('pick', s)"
      >
        {{ s }}
      </button>
    </div>
    <span class="total-mini" :class="{ none: value === null || value === undefined }">
      {{ value === null || value === undefined ? '—' : value }}
    </span>
  </div>
</template>

<script setup>
import { SCORE_STEPS } from '@/data/dimensions'
import { scoreClass } from '@/lib/scoring'

defineProps({
  /* 维度定义 { key, name, weight, desc } */
  dim: { type: Object, required: true },
  /* 当前分值；null 表示未打分 */
  value: { type: Number, default: null },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['pick'])
</script>