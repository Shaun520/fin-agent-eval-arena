<template>
  <div class="segmented" id="segmented">
    <button
      v-for="s in SEGS"
      :key="s"
      :class="{ on: modelValue === s }"
      :data-seg="s"
      @click="emit('update:modelValue', s)"
    >
      {{ SEG_LABEL[s] }}
    </button>
  </div>
</template>

<script setup>
import { SEG_LABEL } from '@/router'

const SEGS = ['review', 'analysis']

defineProps({
  modelValue: { type: String, default: 'review' },
})
const emit = defineEmits(['update:modelValue'])
</script>