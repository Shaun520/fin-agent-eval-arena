<template>
  <div class="empty">
    <span class="big">{{ big }}</span>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  big: { type: String, default: '◻' },
})
</script>