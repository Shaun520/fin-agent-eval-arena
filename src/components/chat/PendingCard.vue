<template>
  <div class="card answer-card pending">
    <div class="ac-head">
      <span class="dot" :style="{ background: m.color }"></span>
      <span class="ac-name">{{ m.name }}</span>
      <Chip v-if="m.vendor">{{ m.vendor }}</Chip>
      <Chip variant="demo">等待回答</Chip>
    </div>
    <div class="card-pad">
      <span class="lbl">本页面不调用任何模型接口。把 {{ m.name }} 对这个问题给出的回答粘贴进来，即可参与评分。</span>
      <textarea v-model="text" class="ctl" rows="4" placeholder="粘贴模型原始回答…"></textarea>
      <span class="lbl" style="margin-top: 8px">引用（可选，每行一条：标题 | 来源 | YYYY-MM-DD）</span>
      <textarea
        v-model="citesText"
        class="ctl"
        rows="2"
        placeholder="示例：贵州茅台 2024 年年度报告 | 上海证券交易所 | 2025-04-02"
      ></textarea>
      <div class="row" style="margin-top: 9px">
        <button class="btn primary sm" @click="submit">提交回答</button>
        <button class="btn sm" @click="skip">本轮跳过该模型</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useArenaStore } from '@/stores/arena'
import Chip from '@/components/common/Chip.vue'

const props = defineProps({
  c: { type: Object, required: true },
  modelId: { type: String, required: true },
})

const store = useArenaStore()
const m = computed(() => store.modelOf(props.modelId))
const text = ref('')
const citesText = ref('')

function submit() {
  store.pendingSubmit(props.c.case_id, props.modelId, text.value, citesText.value)
}

function skip() {
  store.pendingSkip(props.c.case_id, props.modelId)
}
</script>