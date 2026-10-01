<template>
  <div class="card card-pad" style="margin-bottom: 14px">
    <!-- 演示评审数据：首次进入可一键载入，也可一键清空（只影响 demo 记录） -->
    <div class="row" style="margin-bottom: 12px">
      <span class="mono-sm">演示数据</span>
      <button v-if="!demoCount" class="btn sm" @click="store.loadDemoReviews()">载入演示评审记录（{{ sampleSize }} 条）</button>
      <button v-else class="btn sm" @click="store.clearDemoReviews()">清空演示记录（{{ demoCount }}）</button>
      <span class="spacer"></span>
    </div>
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
import DEMO_REVIEWS from '@/data/demoReviews.json'
import QuestionGrid from './QuestionGrid.vue'

const store = useArenaStore()
const n = computed(() => store.activeModels.length)
const sampleSize = DEMO_REVIEWS.length
const demoCount = computed(() => store.allReviews.filter((r) => r.demo).length)
</script>