<template>
  <div class="card card-pad" style="margin-bottom: 14px">
    <div class="hello">
      <div class="hello-mark">⚖</div>
      <h2>你好，我是金融 Agent 评测竞技场</h2>
      <p>挑一个参考问题开始，或者直接在下面的输入框里提问；已选中的 {{ n }} 个模型会同时作答。</p>
    </div>
    <QuestionGrid :selected="store.chat.selected" @pick="(id) => store.pickQuestion(id)" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useArenaStore } from '@/stores/arena'
import QuestionGrid from './QuestionGrid.vue'

const store = useArenaStore()
const n = computed(() => store.activeModels.length)
</script>