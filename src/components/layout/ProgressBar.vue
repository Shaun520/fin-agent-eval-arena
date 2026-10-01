<template>
  <div class="prog-wrap">
    <div class="prog-line">
      <span>评审完成进度</span>
      <span id="progText">{{ done }} / {{ total }}</span>
    </div>
    <div class="prog-bar">
      <i id="progBar" :style="{ width: percent + '%' }"></i>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  done: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
})

const percent = computed(() => (props.total ? (props.done / props.total) * 100 : 0))
</script>