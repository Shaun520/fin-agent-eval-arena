<template>
  <div class="toast-wrap" id="toasts">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="{ err: t.isErr }">{{ t.msg }}</div>
  </div>
</template>

<script>
import { ref } from 'vue'

/* 全局 toast 队列：与原型一致，2.3s 后自动移除 */
export const toasts = ref([])
let seq = 0

export function toast(msg, isErr = false) {
  const id = ++seq
  toasts.value.push({ id, msg, isErr })
  setTimeout(() => {
    const i = toasts.value.findIndex((t) => t.id === id)
    if (i >= 0) toasts.value.splice(i, 1)
  }, 2300)
}

export default {
  name: 'Toast',
  setup() {
    return { toasts }
  },
}
</script>