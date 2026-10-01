<template>
  <!-- 日常对话轮：固定回复，不进入评审 -->
  <template v-if="isChat">
    <div v-if="!expanded" class="card round-head" @click="expand">
      <span class="qtag">日常对话</span>
      <span class="rh-q">{{ (rd.text || '').slice(0, 40) }}</span>
      <span class="spacer"></span>
      <button class="btn ghost sm">展开</button>
    </div>
    <div v-else class="round" :id="'round-' + idx">
      <div class="msg-user">
        <div class="bubble">{{ rd.text }}</div>
        <div class="msg-meta">
          <span>日常对话 · {{ shortTime(rd.askedAt) }}</span>
          <button class="btn ghost sm" @click="collapse">收起</button>
        </div>
      </div>
      <div class="msg-assistant"><div class="bubble-a">{{ DAILY_REPLY }}</div></div>
    </div>
  </template>

  <!-- 评审轮：用户气泡 → 问题卡片 → 并行作答 -->
  <template v-else-if="c">
    <div v-if="!expanded" class="card round-head" @click="expand">
      <span class="qtag">{{ headLabel }}</span>
      <span class="rh-q">{{ (c.question || '').slice(0, 46) }}…</span>
      <span class="spacer"></span>
      <span v-for="id in ids" :key="id" class="mini-score">
        <span class="dot" :style="{ background: store.modelOf(id).color }"></span>{{ store.modelOf(id).short || store.modelOf(id).name }}
        <b>{{ totalOf(id) }}</b>
      </span>
      <button class="btn ghost sm">展开评分</button>
    </div>
    <div v-else class="round" :id="'round-' + idx">
      <div class="msg-user">
        <div class="bubble">{{ c.question }}</div>
        <div class="msg-meta">
          <Chip v-if="c.free">自由提问</Chip>
          <span>{{ ids.length }} 个模型作答 · {{ shortTime(rd.askedAt) }}</span>
          <Chip>本轮进度 {{ doneN }} / {{ ids.length }}</Chip>
          <button class="btn ghost sm" @click="collapse">收起</button>
          <button class="btn ghost sm" @click="store.exportRound(c.case_id)">导出本轮</button>
        </div>
      </div>
      <div class="answers">
        <AnswerCard v-for="a in answers" :key="a.id" :c="c" :a="a" :order="ids.indexOf(a.model_id)" />
        <PendingCard v-for="id in pending" :key="id" :c="c" :model-id="id" />
      </div>
    </div>
  </template>
</template>

<script setup>
import { computed, nextTick } from 'vue'
import { useArenaStore } from '@/stores/arena'
import { reviewTotal } from '@/lib/scoring'
import { fmt1, shortTime } from '@/lib/format'
import Chip from '@/components/common/Chip.vue'
import AnswerCard from './AnswerCard.vue'
import PendingCard from './PendingCard.vue'

const DAILY_REPLY = '你好，我是金融 Agent 评测竞技场，选中输入框中的评审按钮，即可开启各大模型的评审噢~'

const props = defineProps({
  rd: { type: Object, required: true },
  idx: { type: Number, required: true },
})

const store = useArenaStore()
const isChat = computed(() => props.rd.kind === 'chat')
const expanded = computed(() => store.isRoundExpanded(props.idx))
const c = computed(() => (isChat.value ? null : store.caseById(props.rd.caseId)))
const headLabel = computed(() => (c.value && c.value.free ? '自由提问' : (c.value && c.value.title) || '参考问题'))

/* 本轮参与作答的模型（过滤掉已被移除的自定义模型） */
const ids = computed(() =>
  isChat.value ? [] : (props.rd.modelIds || []).filter((id) => store.allModels().some((m) => m.id === id)),
)
const answers = computed(() => {
  const list = store.answersOf(props.rd.caseId)
  return ids.value.map((id) => list.find((a) => a.model_id === id)).filter(Boolean)
})
const pending = computed(() => ids.value.filter((id) => !answers.value.some((a) => a.model_id === id)))
const doneN = computed(
  () => ids.value.filter((id) => store.getReview(props.rd.caseId, id).status === 'done').length,
)

function totalOf(id) {
  const t = reviewTotal(store.getReview(props.rd.caseId, id))
  return t === null ? '—' : fmt1(t)
}

function expand() {
  store.toggleRound(props.idx)
  nextTick(() => {
    const el = document.getElementById('round-' + props.idx)
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function collapse() {
  store.collapseRound(props.idx)
}
</script>