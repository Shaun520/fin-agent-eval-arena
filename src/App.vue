<template>
  <div class="app">
    <AppSidebar />
    <main class="main">
      <AppTopbar />
      <div class="content">
        <router-view />
      </div>
      <!-- 常驻底栏：对话评审的 composer 在后续阶段挂载到这里 -->
      <div class="bottom-bar"></div>
    </main>
    <Toast />
  </div>
</template>

<script setup>
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import Toast from '@/components/common/Toast.vue'
</script>