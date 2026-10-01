<template>
  <header class="topbar">
    <div class="tb-title">{{ meta.title }}</div>
    <div class="tb-sub">{{ meta.sub }}</div>
    <div class="tb-right">
      <slot name="right" />
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { VIEW_META } from '@/router'

const route = useRoute()
const meta = computed(() => VIEW_META[route.name] || { title: '', sub: '' })
</script>