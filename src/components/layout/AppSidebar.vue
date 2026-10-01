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
        <span v-if="store.navCount(it.key)" class="cnt">{{ store.navCount(it.key) }}</span>
      </button>
    </nav>

    <div class="sidebar-foot">
      <ProgressBar :done="store.progressStats.done" :total="store.progressStats.total" />
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
</script>