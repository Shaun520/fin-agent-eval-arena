<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">⚖</div>
      <div>
        <div class="brand-title">金融 Agent 评测竞技场</div>
        <div class="brand-sub">人工评审 · 可追溯</div>
      </div>
    </div>

    <SegmentedNav :model-value="store.seg" @update:model-value="switchSeg" />

    <nav class="nav" id="nav">
      <div class="nav-group-label">{{ SEG_LABEL[store.seg] }}</div>
      <button
        v-for="it in items"
        :key="it.key"
        class="nav-item"
        :class="{ on: isActive(it.key) }"
        :data-nav="it.key"
        @click="go(it.key)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          v-html="ICONS[it.icon]"
        ></svg>
        <span>{{ it.name }}</span>
        <span v-if="count(it.key)" class="cnt">{{ count(it.key) }}</span>
      </button>
    </nav>

    <div class="sidebar-foot">
      <ProgressBar :done="progress.done" :total="progress.total" />
      <button class="nav-item" :class="{ on: isActive('data') }" data-nav="data" @click="go('data')">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          v-html="ICONS.data"
        ></svg>
        数据导入导出
      </button>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV_SEGMENTS, SEG_LABEL } from '@/router'
import { ICONS } from '@/data/icons'
import { DIMENSIONS } from '@/data/dimensions'
import { useArenaStore } from '@/stores/arena'
import SegmentedNav from './SegmentedNav.vue'
import ProgressBar from './ProgressBar.vue'

const route = useRoute()
const router = useRouter()
const store = useArenaStore()

const items = computed(() => NAV_SEGMENTS[store.seg] || [])

const isActive = (key) => route.name === key

function switchSeg(seg) {
  store.seg = seg
  router.push({ name: NAV_SEGMENTS[seg][0].key })
}

/* 进入「数据导入导出」不改变当前分段，与原型一致 */
function go(key) {
  if (key === 'chat' || key === 'records') store.seg = 'review'
  else if (key !== 'data') store.seg = 'analysis'
  router.push({ name: key })
}

const hasContent = (r) =>
  (r.failures && r.failures.length > 0) || String(r.comment || '').trim() !== '' || DIMENSIONS.some((d) => r.scores[d.key] !== null)

function count(key) {
  if (key !== 'records') return ''
  const n = Object.values(store.reviews).filter(hasContent).length
  return n ? String(n) : ''
}

/* 评审完成进度：各会话中「已提问的问题 × 该轮选中的模型」去重后统计，未提问时为 0 / 0 */
const progress = computed(() => ({ total: 0, done: 0 }))
</script>