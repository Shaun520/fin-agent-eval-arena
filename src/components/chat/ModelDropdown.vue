<template>
  <div class="model-pop2" role="listbox" aria-label="模型选择">
    <button class="mopt" :class="{ on: !rm }" @click="store.pickDefaultModel()">
      <span class="mopt-main">
        <span class="mopt-name">默认模型</span>
        <span class="mopt-desc">日常对话，不触发模型评审</span>
      </span>
      <span v-if="!rm" class="ck">✓</span>
    </button>
    <div class="mopt-divider"></div>
    <div v-if="!rm" class="mopt-hint">日常对话模式下不使用模型；开启评审模式后可勾选参与评审的模型。</div>
    <button
      v-for="m in models"
      :key="m.id"
      class="mopt"
      :class="{ on: isOn(m), disabled: !rm }"
      :disabled="!rm"
      @click="store.toggleModel(m.id)"
    >
      <span class="mopt-main">
        <span class="mopt-name"><span class="dot" :style="{ background: m.color }"></span> {{ m.name }}</span>
        <span class="mopt-desc">{{ m.baseline ? '基准模型' : m.vendor || '自定义模型' }}</span>
      </span>
      <span v-if="isOn(m)" class="ck">✓</span>
    </button>
    <div class="mopt-divider"></div>
    <div v-if="store.chat.addingModel" class="mopt-form">
      <input v-model="newName" class="ctl" placeholder="模型名称，例如：DeepSeek-V3" />
      <input v-model="newVendor" class="ctl" placeholder="提供方（可选）" />
      <div class="row" style="margin-top: 6px">
        <button class="btn primary sm" @click="confirmNew">添加并选中</button>
        <button class="btn sm" @click="store.chat.addingModel = false">取消</button>
      </div>
      <div class="mono-sm" style="margin-top: 6px">新增模型不会调用接口，需在它的卡片里粘贴回答后才能评分。</div>
    </div>
    <button v-else class="mopt add" @click="store.chat.addingModel = true">＋ 新增模型</button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useArenaStore } from '@/stores/arena'

const store = useArenaStore()
const rm = computed(() => store.chat.reviewMode)
const models = computed(() => store.allModels())
const newName = ref('')
const newVendor = ref('')

const isOn = (m) => rm.value && store.chat.active.indexOf(m.id) >= 0

function confirmNew() {
  const name = newName.value.trim()
  if (!name) {
    store.toast('请填写模型名称', true)
    return
  }
  store.addCustomModel(name, newVendor.value.trim())
  newName.value = ''
  newVendor.value = ''
}
</script>