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
    <!-- 评审编辑弹窗：全局挂载，当前由存储状态驱动（后续「评审记录」页复用） -->
    <ReviewModal v-if="store.reviewModal" />
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
import ReviewModal from '@/components/review/ReviewModal.vue'

const route = useRoute()
const store = useArenaStore()
const showComposer = computed(() => route.name === 'chat' && store.cases.length > 0)
</script>