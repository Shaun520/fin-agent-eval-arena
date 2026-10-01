<template>
  <div v-if="!store.cases.length" class="empty">
    <span class="big">◻</span>还没有可用的参考问题，可在「数据导入导出」中导入 JSON。
  </div>
  <template v-else>
    <!-- 空状态：问候 + 参考问题网格 -->
    <HelloPanel v-if="!store.chat.rounds.length" />
    <div class="chat-thread">
      <ChatRound v-for="(rd, i) in store.chat.rounds" :key="i" :rd="rd" :idx="i" />
    </div>
  </template>
</template>

<script setup>
import { useArenaStore } from '@/stores/arena'
import HelloPanel from '@/components/chat/HelloPanel.vue'
import ChatRound from '@/components/chat/ChatRound.vue'

const store = useArenaStore()
</script>