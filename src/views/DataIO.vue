<template>
  <!-- localStorage 不可用时的降级提示 -->
  <div v-if="!storageOK" class="banner">当前环境不支持 localStorage，数据仅存于内存，导出/导入仍可用。</div>

  <!-- 4 个统计卡 -->
  <div class="stats">
    <StatCard k="参考问题" :v="referenceCount" unit="条" />
    <StatCard k="回答" :v="answerCount" unit="条" />
    <StatCard k="评审记录" :v="reviewCount" unit="条" />
    <StatCard k="自定义回答" :v="store.answersStore.custom.length" unit="条" />
  </div>

  <div class="grid2">
    <!-- 导出 -->
    <div class="card">
      <div class="card-head">
        <h3>导出</h3>
        <span class="hint">JSON 结构 {{ SCHEMA_ID }}</span>
      </div>
      <div class="card-pad">
        <div class="row">
          <button class="btn primary sm" @click="store.exportData('all')">导出全部</button>
          <button class="btn sm" @click="store.exportData('reviews')">仅导出评审记录</button>
          <button class="btn sm" @click="store.exportData('answers')">仅导出回答</button>
          <button class="btn sm" @click="store.copyAllJSON()">复制 JSON 到剪贴板</button>
          <button class="btn sm" @click="store.exportReport()">导出汇总报告（.md）</button>
        </div>
        <div class="prose" style="margin-top: 10px">
          导出内容包含问题、回答、评审记录、配置与模型元数据，并附导出时间戳，可与 JSON 文件一并归档，保证评测题、模型回答与
          评审记录可追溯、可复现。
        </div>
      </div>
    </div>

    <!-- 导入 -->
    <div class="card">
      <div class="card-head">
        <h3>导入</h3>
        <span class="hint">按「问题 + 模型」合并，重复项覆盖</span>
      </div>
      <div class="card-pad">
        <input type="file" accept=".json,application/json" class="ctl" style="width: 100%; margin-bottom: 10px" @change="onFile" />
        <div class="row">
          <label class="mono-sm"><input v-model="impReviews" type="checkbox" /> 同时导入评审记录</label>
          <label class="mono-sm"><input v-model="impReplace" type="checkbox" /> 替换内置参考问题与回答</label>
        </div>
        <span class="lbl" style="margin-top: 10px">或直接粘贴 JSON：</span>
        <textarea
          v-model="importText"
          class="ctl"
          rows="4"
          :placeholder="'{\'schema\':\'' + SCHEMA_ID + '\', ...}'"
        ></textarea>
        <div class="row" style="margin-top: 9px">
          <button class="btn primary sm" @click="importFromText">从文本框导入</button>
          <button class="btn sm" @click="resetAll">恢复内置演示数据</button>
          <button class="btn sm danger" @click="clearReviews">清空全部评审记录</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 演示数据管理 -->
  <div class="sec-title">演示数据管理<span class="line"></span></div>
  <div class="card card-pad">
    <div class="row">
      <button class="btn sm" @click="store.loadDemoReviews()">载入演示评审记录（{{ demoCount }} 条）</button>
      <button class="btn sm" @click="store.clearDemoReviews()">清空演示记录</button>
      <button class="btn sm" @click="store.restoreAnswers()">
        还原被删除的内置回答（{{ store.answersStore.deleted.length }}）
      </button>
    </div>
    <div class="prose" style="margin-top: 10px">
      演示评审记录用于展示排行榜、汇总报告与标签分布的效果，可以随时删除，不影响你自己录入的评分。载入时会把演示覆盖的题目一并提问到当前会话，可直接在「对话评审」中查看回答与评分。
    </div>
  </div>

  <!-- 当前数据快照（只读） -->
  <div class="sec-title">当前数据快照（只读）<span class="line"></span></div>
  <div class="card card-pad">
    <details class="ref" open>
      <summary>查看导出 JSON 原文（内部编号只在这里出现）</summary>
      <textarea class="ctl snapshot" rows="14" readonly :value="snapshot"></textarea>
    </details>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useArenaStore } from '@/stores/arena'
import { buildExport } from '@/lib/export'
import { MODELS } from '@/data/models'
import { SCHEMA_ID, storageOK } from '@/lib/storage'
import DEMO_REVIEWS from '@/data/demoReviews.json'
import StatCard from '@/components/common/StatCard.vue'

const store = useArenaStore()

const impReviews = ref(true)
const impReplace = ref(true)
const importText = ref('')
const demoCount = DEMO_REVIEWS.length

/* 统计口径与原型 renderData 一致 */
const referenceCount = computed(() => store.cases.filter((c) => !c.free).length)
const answerCount = computed(() => store.cases.reduce((s, c) => s + store.answersOf(c.case_id).length, 0))
const reviewCount = computed(() => Object.keys(store.reviews).length)

/* 当前全量导出 JSON 原文（只读快照） */
const snapshot = computed(() =>
  JSON.stringify(
    buildExport('all', {
      cases: store.cases,
      answersOf: (id) => store.answersOf(id),
      reviews: store.allReviews,
      models: MODELS,
      stream: store.stream,
    }),
    null,
    2,
  ),
)

/* 文件导入：读取文本后走统一的 importData */
function onFile(e) {
  const f = e.target.files && e.target.files[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => {
    let obj = null
    try {
      obj = JSON.parse(String(reader.result))
    } catch (err) {
      store.toast('文件解析失败：' + err.message, true)
      return
    }
    store.importData(obj, { replace: impReplace.value, reviews: impReviews.value })
    e.target.value = ''
  }
  reader.readAsText(f, 'utf-8')
}

/* 文本框导入 */
function importFromText() {
  const raw = importText.value.trim()
  if (!raw) {
    store.toast('请先粘贴 JSON 内容', true)
    return
  }
  let obj = null
  try {
    obj = JSON.parse(raw)
  } catch (err) {
    store.toast('JSON 解析失败：' + err.message, true)
    return
  }
  const ok = store.importData(obj, { replace: impReplace.value, reviews: impReviews.value })
  if (ok.length) importText.value = ''
}

function resetAll() {
  if (!window.confirm('恢复内置演示数据：参考问题、回答与全部评审记录都会被重置，确认继续？')) return
  store.resetAll()
}

function clearReviews() {
  if (!window.confirm('清空全部评审记录（参考问题与回答保留）？')) return
  store.clearAllReviews()
}
</script>