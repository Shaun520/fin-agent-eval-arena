<template>
  <!-- 未提问：整个视图为空，不显示筛选（复刻原型 askedEmptyState） -->
  <div v-if="!store.askedCases.length" class="card card-pad">
    <EmptyState>
      还没有提问。<br />
      <span>去「对话评审」选一个参考问题或直接输入你的问题，评审记录会出现在这里。</span>
      <div style="margin-top: 12px">
        <button class="btn sm" @click="goChat">去对话评审</button>
      </div>
    </EmptyState>
  </div>

  <template v-else>
    <!-- 顶部筛选栏：问题 / 模型 / 状态 / 失败标签，实时联动 -->
    <div class="card card-pad" style="margin-bottom: 14px">
      <div class="row">
        <span class="mono-sm">筛选</span>
        <select v-model="store.filters.caseId" class="ctl">
          <option value="all">全部问题</option>
          <option v-for="c in store.askedCases" :key="c.case_id" :value="c.case_id">
            {{ store.caseLabel(c.case_id) }} · {{ c.title || '' }}
          </option>
        </select>
        <select v-model="store.filters.modelId" class="ctl">
          <option value="all">全部模型</option>
          <option v-for="m in store.allModels()" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <select v-model="store.filters.status" class="ctl">
          <option value="all">全部状态</option>
          <option v-for="s in ['none', 'doing', 'done']" :key="s" :value="s">{{ TO_LABEL[s] }}</option>
        </select>
        <select v-model="store.filters.label" class="ctl">
          <option value="all">全部失败标签</option>
          <option v-for="l in FAILURE_LABELS" :key="l.key" :value="l.key">{{ l.name }}</option>
        </select>
        <button class="btn sm" @click="store.resetFilters()">重置筛选</button>
        <span class="spacer"></span>
        <span class="mono-sm">命中 {{ rows.length }} 条</span>
      </div>
    </div>

    <div v-if="!rows.length" class="card card-pad">
      <EmptyState>
        没有符合条件的评审记录。
        <div style="margin-top: 12px">
          <button class="btn sm" @click="store.resetFilters()">重置筛选</button>
        </div>
      </EmptyState>
    </div>

    <!-- 记录表：固定列宽，列顺序与列宽对齐原型 -->
    <div v-else class="card">
      <table class="tbl records">
        <colgroup>
          <col style="width: 14%" />
          <col style="width: 11%" />
          <col style="width: 8%" />
          <col style="width: 6%" />
          <col style="width: 11%" />
          <col style="width: 14%" />
          <col style="width: 14%" />
          <col style="width: 10%" />
          <col style="width: 12%" />
        </colgroup>
        <thead>
          <tr>
            <th>问题</th>
            <th>模型</th>
            <th>状态</th>
            <th>总分</th>
            <th>分维度<br /><span class="mono-sm">数/引/时/安/质</span></th>
            <th>失败标签</th>
            <th>评语</th>
            <th>评审时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="x in rows" :key="x.c.case_id + '||' + x.a.model_id">
            <td class="cell-nowrap" :title="x.c.question || ''">
              <button class="qnum" title="查看该题的对话评审回合" @click="viewCase(x.c.case_id)">
                {{ store.caseLabel(x.c.case_id) }}
              </button>
            </td>
            <td class="cell-nowrap">
              <span class="dot" :style="{ background: store.modelOf(x.a.model_id).color }"></span>
              {{ store.modelOf(x.a.model_id).name }}
            </td>
            <td class="cell-nowrap">
              <Chip v-if="x.r.status === 'done'" variant="ok">已完成</Chip>
              <Chip v-else-if="x.r.status === 'doing'" variant="demo">评审中</Chip>
              <Chip v-else>未评审</Chip>
            </td>
            <td class="num" style="font-weight: 650">{{ totalOf(x.r) }}</td>
            <td class="dims-compact">
              <template v-for="(d, i) in DIMENSIONS" :key="d.key"
                ><span v-if="i"> / </span
                ><b :style="{ color: dimColor(x.r.scores[d.key]) }">{{
                  x.r.scores[d.key] === null ? '—' : x.r.scores[d.key]
                }}</b></template
              >
            </td>
            <td class="tags-cell">
              <div class="tags-clip">
                <template v-if="x.r.failures.length">
                  <Chip v-for="k in x.r.failures" :key="k" variant="danger">{{
                    LABEL_MAP[k] ? LABEL_MAP[k].name : k
                  }}</Chip>
                </template>
                <span v-else class="mono-sm">—</span>
              </div>
            </td>
            <td class="comment-cell">
              <div class="comment-clip" :title="x.r.comment || ''">
                <template v-if="x.r.comment">{{ x.r.comment }}</template>
                <span v-else class="mono-sm">—</span>
              </div>
            </td>
            <td class="mono-sm cell-nowrap" :title="shortTime(x.r.reviewed_at)">{{ shortDay(x.r.reviewed_at) }}</td>
            <td class="cell-nowrap">
              <button class="btn sm" @click="store.openReviewModal(x.c.case_id, x.a.model_id)">编辑</button>
              <button class="btn sm" style="margin-left: 6px" @click="viewCase(x.c.case_id)">查看</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useArenaStore } from '@/stores/arena'
import { DIMENSIONS, WARN_LOW } from '@/data/dimensions'
import { FAILURE_LABELS } from '@/data/failureLabels'
import { TO_LABEL, reviewTotal } from '@/lib/scoring'
import { fmt1, shortDay, shortTime } from '@/lib/format'
import Chip from '@/components/common/Chip.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const store = useArenaStore()
const router = useRouter()

const rows = computed(() => store.reviewRows)
const LABEL_MAP = Object.fromEntries(FAILURE_LABELS.map((l) => [l.key, l]))

function totalOf(r) {
  const t = reviewTotal(r)
  return t === null ? '—' : fmt1(t)
}

/* 低分（<= 3）红色、未打分灰色、其余常规色，与原型 dims-compact 一致 */
function dimColor(v) {
  if (v === null || v === undefined) return 'var(--muted-2)'
  return v <= WARN_LOW ? 'var(--danger)' : 'var(--text-2)'
}

/* 进题查看：跳到该题的对话评审回合（展开并滚动定位） */
function viewCase(caseId) {
  store.focusCaseRound(caseId)
  router.push('/chat')
}

function goChat() {
  router.push('/chat')
}
</script>
