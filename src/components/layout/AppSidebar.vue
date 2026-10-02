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

    <!-- 会话与最近评审：仅在「评审」分组下展示（复刻原型 reviewing 判定） -->
    <template v-if="store.seg === 'review'">
      <div class="sessions">
        <div class="sess-head">
          <span class="nav-group-label">会话</span>
          <button class="sess-add" title="新建会话" @click="store.createSession()">＋ 新建</button>
        </div>
        <div class="sess-list">
          <span
            v-for="s in store.chat.sessions"
            :key="s.id"
            class="sess-item"
            :class="{ on: s.id === store.chat.currentId }"
          >
            <button class="sess-open" title="切换到该会话" @click="store.switchSession(s.id)">
              <span class="sess-t">{{ store.sessionTitle(s) }}</span>
              <span class="sess-n">{{ s.rounds.length }}</span>
            </button>
            <button class="sess-del" title="删除该会话" @click="store.deleteSession(s.id)">✕</button>
          </span>
        </div>
      </div>

      <div class="recent">
        <div class="nav-group-label">最近评审</div>
        <div v-if="!store.recentRounds.length" class="recent-empty">还没有评审，去右侧选一个开始</div>
        <button
          v-for="r in store.recentRounds"
          :key="r.idx"
          class="rq-item"
          :class="{ on: store.isRoundExpanded(r.idx) }"
          @click="openRound(r.idx)"
        >
          <span class="rq-t">★</span>
          <span>{{ roundTitle(r.rd) }}</span>
          <span class="rq-n">{{ progressText(r.rd) }}</span>
        </button>
      </div>
    </template>

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
import { computed, nextTick } from 'vue'
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

/* 「最近评审」条目文案：题面截 14 字 + 该题已完成 / 应完成数 */
function roundTitle(rd) {
  const c = store.caseById(rd.caseId)
  return c ? String(c.title || c.question || '').slice(0, 14) : ''
}

function progressText(rd) {
  const p = store.reviewProgress(rd.caseId)
  return p.done + '/' + Math.max(p.total, (rd.modelIds || []).length)
}

/* 点最近评审 = 切换该轮展开态并滚动定位（复刻原型 expand-round） */
function openRound(idx) {
  store.toggleRound(idx)
  nextTick(() => {
    const el = document.getElementById('round-' + idx)
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
</script>