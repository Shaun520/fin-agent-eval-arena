<template>
  <div class="qgrid">
    <button
      v-for="c in cases"
      :key="c.case_id"
      class="qcard"
      :class="{ on: selected === c.case_id }"
      @click="$emit('pick', c.case_id)"
    >
      <span class="qcard-top">
        <span class="qtag">{{ c.title || '参考问题' }}</span>
      </span>
      <span class="qtext">{{ c.question }}</span>

    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useArenaStore } from '@/stores/arena'

defineProps({
  /* 当前选中的 case_id，用于 .qcard.on 高亮 */
  selected: { type: String, default: null },
})
defineEmits(['pick'])

const store = useArenaStore()
/* 参考问题 = 内置带参考答案的问题；自由提问不进这个列表 */
const cases = computed(() => store.referenceCases())
</script>