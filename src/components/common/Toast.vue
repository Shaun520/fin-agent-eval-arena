<template>
  <div class="toast-wrap" id="toasts">
    <div v-for="t in store.toasts" :key="t.id" class="toast" :class="{ err: t.isErr }">{{ t.msg }}</div>
  </div>
</template>

<script setup>
import { useArenaStore } from '@/stores/arena'

const store = useArenaStore()
</script>