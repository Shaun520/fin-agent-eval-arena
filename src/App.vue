<template>
  <div class="app">
    <AppSidebar />
    <main class="main">
      <AppTopbar />
      <div class="content">
        <router-view />
      </div>
      <!-- 常驻底栏：不随内容滚动；仅在「对话评审」且有参考问题时挂载 composer -->
      <div class="bottom-bar">
        <Composer v-if="showComposer" />
      </div>
    </main>
    <Toast />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useArenaStore } from '@/stores/arena'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import Toast from '@/components/common/Toast.vue'
import Composer from '@/components/chat/Composer.vue'

const route = useRoute()
const store = useArenaStore()
const showComposer = computed(() => route.name === 'chat' && store.cases.length > 0)
</script>