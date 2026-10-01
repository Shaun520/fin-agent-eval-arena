<template>
  <div class="card answer-card">
    <div class="ac-head">
      <span class="dot" :style="{ background: m.color }"></span>
      <span class="ac-name">{{ m.name }}</span>
      <Chip v-if="m.baseline" variant="brand">基准</Chip>
      <Chip v-else-if="m.vendor">{{ m.vendor }}</Chip>
      <span class="spacer"></span>
      <!-- 未评完时不显示总分（与状态「未评审」重复）；本阶段评分面板尚未实现，故通常为隐藏 -->
      <span class="mini-score" :class="{ 'total-none': total === null }">
        <b>{{ total === null ? '未评完' : fmt1(total) }}</b>
      </span>
      <button class="btn ghost sm" title="重新生成" @click="replay">↻</button>
      <button class="btn ghost sm danger" title="删除该回答" @click="remove">✕</button>
    </div>

    <div class="ac-body">
      <div class="ans-text">
        <span>{{ shown }}</span><span v-if="streaming" class="cursor"></span>
      </div>
      <div class="cite-wrap" :class="{ 'cite-shown': citeShown }">
        <div class="cite-title">引用与证据（{{ cites.length }}）</div>
        <div v-if="!cites.length" class="cite none">未提供任何引用来源</div>
        <template v-else>
          <div v-for="(x, i) in cites" :key="i" class="cite" :style="{ animationDelay: i * 70 + 'ms' }">
            <span class="d">{{ x.published_at || '无日期' }}</span>
            <a class="cite-link" href="#" title="在浏览器中打开该来源" @click.prevent>{{ x.title }} · {{ x.org || '未知来源' }}</a>
          </div>
        </template>
        <div class="cite-title" style="margin-top: 8px">
          回答生成于 {{ shortTime(a.generated_at) }}<span v-if="a.latency_ms"> · 耗时 {{ a.latency_ms }}ms</span><span v-if="a.cost_cny"> · 成本 ¥{{ a.cost_cny }}</span><span v-if="a.custom"> · 本地录入</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useArenaStore } from '@/stores/arena'
import { reviewTotal } from '@/lib/scoring'
import { fmt1, shortTime } from '@/lib/format'
import { streamText, STREAM_STAGGER_MS } from '@/lib/stream'
import Chip from '@/components/common/Chip.vue'

const props = defineProps({
  c: { type: Object, required: true },
  a: { type: Object, required: true },
  /* 该模型在本轮 modelIds 中的位置，用于并列作答的错峰起笔 */
  order: { type: Number, default: 0 },
})

const store = useArenaStore()
const m = computed(() => store.modelOf(props.a.model_id))
const review = computed(() => store.getReview(props.c.case_id, props.a.model_id))
const total = computed(() => reviewTotal(review.value))
const cites = computed(() => props.a.citations || [])

const streamKey = 'ans_' + props.a.id.replace(/[^a-zA-Z0-9]/g, '_')
const shown = ref(props.a.answer || '')
const streaming = ref(false)
const citeShown = ref(true)
let handle = null

function play(delayMs) {
  const full = props.a.answer || ''
  if (handle) handle.cancel()
  shown.value = ''
  citeShown.value = false
  streaming.value = !!full
  handle = streamText(full, {
    speed: store.stream,
    delay: delayMs,
    onUpdate: (t) => {
      shown.value = t
    },
    onDone: () => {
      streaming.value = false
      citeShown.value = true
    },
  })
}

function replay() {
  play(0)
}

onMounted(() => {
  /* 已播放过的回答直接整段显示，不重复动画（与原型的 animated 标记一致） */
  if (store.chat.animated[streamKey]) {
    shown.value = props.a.answer || ''
    streaming.value = false
    citeShown.value = true
    return
  }
  store.chat.animated[streamKey] = true
  play(props.order * STREAM_STAGGER_MS)
})

onBeforeUnmount(() => {
  if (handle) handle.cancel()
})

function remove() {
  if (!window.confirm('确认删除该回答？删除后它的评审记录也会一并移除。')) return
  store.deleteAnswer(props.c.case_id, props.a.model_id, props.a.id, !!props.a.custom)
}
</script>