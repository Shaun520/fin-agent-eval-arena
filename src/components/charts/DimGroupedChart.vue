<template>
  <div>
    <svg viewBox="0 0 760 260" style="width: 100%; height: auto">
      <!-- Y 轴 0–5 网格线与刻度 -->
      <template v-for="v in 6" :key="'g' + v">
        <line :x1="padL" :x2="W - padR" :y1="y(v - 1)" :y2="y(v - 1)" stroke="#eef0f3" />
        <text :x="padL - 8" :y="y(v - 1) + 4" text-anchor="end" font-size="10" fill="#9aa1a9">{{ v - 1 }}</text>
      </template>

      <!-- 每个维度一组，每组 4 根柱（数据缺失的模型跳过） -->
      <template v-for="g in groups" :key="g.key">
        <rect
          v-for="b in g.bars"
          :key="b.id"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          :fill="b.color"
          :opacity="b.opacity"
          rx="3"
        />
        <text :x="g.cx" :y="H - 12" text-anchor="middle" font-size="11" fill="#41474d">{{ g.name }}</text>
      </template>
    </svg>

    <div class="row" style="justify-content: center; margin-top: 4px">
      <span v-for="m in MODELS" :key="m.id" class="mini-score">
        <span class="dot" :style="{ background: m.color }"></span>{{ m.name }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { DIMENSIONS, MAX_DIM_SCORE } from '@/data/dimensions'
import { MODELS } from '@/data/models'

/* 传入聚合结果 byModel（id -> { dims }），几何与配色严格复刻原型 dimGroupedChart */
const props = defineProps({
  byModel: { type: Object, default: () => ({}) },
})

const W = 760
const H = 260
const padL = 34
const padB = 34
const padT = 14
const padR = 10
const innerH = H - padT - padB
const gw = (W - padL - padR) / DIMENSIONS.length
const bw = (gw - 28) / MODELS.length

/* 分数 → y 坐标（0 在底部、5 在顶部） */
const y = (v) => padT + innerH * (1 - v / MAX_DIM_SCORE)

const groups = computed(() =>
  DIMENSIONS.map((d, i) => ({
    key: d.key,
    name: d.name,
    cx: padL + gw * i + gw / 2,
    bars: MODELS.map((m, j) => {
      const byM = props.byModel[m.id]
      const v = byM ? byM.dims[d.key] : null
      const hh = v === null || v === undefined ? 0 : innerH * (v / MAX_DIM_SCORE)
      return {
        id: m.id,
        x: padL + gw * i + 14 + bw * j + 2,
        y: padT + innerH - hh,
        w: bw - 4,
        h: hh,
        color: m.color,
        opacity: m.baseline ? 0.95 : 0.72,
        /* 该模型在此范围无数据：不渲染柱子 */
        empty: v === null || v === undefined,
      }
    }).filter((b) => !b.empty),
  })),
)
</script>