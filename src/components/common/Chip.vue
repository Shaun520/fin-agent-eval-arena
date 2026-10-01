<template>
  <span class="chip" :class="variant">
    <slot />
  </span>
</template>

<script setup>
defineProps({
  /* '' | 'brand' | 'demo' | 'ok' | 'danger' | 'risk' | 'mono' */
  variant: { type: String, default: '' },
})
</script>