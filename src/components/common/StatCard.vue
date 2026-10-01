<template>
  <div class="stat">
    <div class="k">{{ k }}</div>
    <div class="v">{{ v }}<small v-if="unit">{{ unit }}</small></div>
  </div>
</template>

<script setup>
defineProps({
  k: { type: String, default: '' },
  v: { type: [String, Number], default: '' },
  unit: { type: String, default: '' },
})
</script>