<template>
  <div class="composer">
    <!-- @click.stop：弹层内部的点击不再冒泡到 document，避免 Vue 重渲染把被点的按钮换成别的节点后，
         外部点击判定拿到已脱离文档的 target 而误判为「点了外部」并收起弹层 -->
    <div v-if="store.chat.showPicker" ref="pickerEl" class="picker-pop" @click.stop>
      <QuestionGrid :selected="store.chat.selected" @pick="pick" />
    </div>
    <textarea
      ref="inputEl"
      v-model="text"
      class="ctl"
      rows="2"
      :placeholder="rm ? '输入你想问的金融问题…' : '日常对话模式：直接输入，和我聊聊…'"
      @keydown.ctrl.enter.prevent="send"
      @keydown.meta.enter.prevent="send"
    ></textarea>
    <div class="cp-row">
      <button
        class="mode-toggle"
        :class="{ on: rm }"
        title="开启后，每次提问都会让选中的模型同时作答并进入评审；关闭则为日常对话"
        @click="store.toggleReviewMode()"
      >
        <span class="knob"></span><span class="mode-label">{{ rm ? '评审模式' : '日常对话' }}</span>
      </button>
      <button
        v-if="store.chat.rounds.length"
        ref="pickerBtnEl"
        class="btn sm"
        :class="{ primary: store.chat.showPicker }"
        @click="togglePicker"
      >
        参考问题
      </button>
      <span class="spacer"></span>
      <div ref="ddEl" class="model-dd" @click.stop>
        <button class="btn sm model-dd-btn" @click="toggleModelPop">模型选择 <span class="chev">▾</span></button>
        <ModelDropdown v-if="store.chat.modelPopOpen" />
      </div>
      <button class="btn primary" :disabled="rm && !n" @click="send">发送</button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useArenaStore } from '@/stores/arena'
import QuestionGrid from './QuestionGrid.vue'
import ModelDropdown from './ModelDropdown.vue'

const store = useArenaStore()
const rm = computed(() => store.chat.reviewMode)
const n = computed(() => store.activeModels.length)

const text = ref('')
const inputEl = ref(null)
const pickerEl = ref(null)
const pickerBtnEl = ref(null)
const ddEl = ref(null)

function togglePicker() {
  store.chat.showPicker = !store.chat.showPicker
  store.chat.modelPopOpen = false
}

function toggleModelPop() {
  store.chat.modelPopOpen = !store.chat.modelPopOpen
  store.chat.addingModel = false
  /* 与原型一致：打开模型下拉时收起参考问题浮层（此时内部的 stop 已让 document 判定不再兜底） */
  store.chat.showPicker = false
}

function pick(caseId) {
  store.pickQuestion(caseId)
}

function scrollToRound(caseId) {
  const idx = store.chat.rounds.findIndex((rd) => rd.caseId === caseId)
  if (idx < 0) return
  const el = document.getElementById('round-' + idx)
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function send() {
  const t = text.value.trim()
  if (!t) {
    store.toast('先输入内容，或点上面的参考问题', true)
    return
  }
  if (!store.chat.reviewMode) {
    store.askDaily(t)
    text.value = ''
    return
  }
  /* 优先用已选中的参考问题；否则按题干匹配内置问题；都不中则为自由提问 */
  const target = (store.chat.selected && store.caseById(store.chat.selected)) || store.matchCase(t)
  const caseId = target ? target.case_id : store.createFreeQuestion(t)
  store.askQuestion(caseId)
  text.value = ''
  nextTick(() => scrollToRound(caseId))
}

/* 点击弹层外部收起；点 qcard 不收起（由 pick 负责关闭），与原型一致 */
function onDocClick(e) {
  const t = e.target
  if (!t) return
  if (store.chat.modelPopOpen && ddEl.value && !ddEl.value.contains(t)) store.chat.modelPopOpen = false
  if (
    store.chat.showPicker &&
    !(pickerEl.value && pickerEl.value.contains(t)) &&
    !(pickerBtnEl.value && pickerBtnEl.value.contains(t))
  ) {
    store.chat.showPicker = false
  }
}

/* 选中参考问题后：题干带入输入框并聚焦 */
watch(
  () => store.chat.selected,
  (v) => {
    if (!v) return
    const c = store.caseById(v)
    if (!c) return
    text.value = c.question
    nextTick(() => inputEl.value && inputEl.value.focus())
  },
)

onMounted(() => {
  document.addEventListener('click', onDocClick)
  /* 刷新后若 restore 了选中的问题，回填题干（等价于原型的 renderBottomBar） */
  if (store.chat.selected) {
    const c = store.caseById(store.chat.selected)
    if (c) text.value = c.question
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})
</script>